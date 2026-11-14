-- Piezas de Kardo con código de activación (ADR 026; fase 2 del ADR 025 §7).
--
-- Kardo crea en Operations un lote (el pedido de un kit o de piezas
-- sueltas). Cada pieza nace como un Touchpoint de tipo `kardo`, sin dueño
-- (status `available`, workspace_id null) y con su dirección permanente ya
-- reservada: el QR impreso lleva `?src=qr` y el chip `?src=nfc`. El cliente
-- la activa en su panel con el código del kit (todas las piezas del lote de
-- una vez) o con el código de la pieza (una suelta).
--
-- Los códigos: Crockford base32, 10 caracteres el del kit (50 bits) y 8 el de
-- la pieza (40 bits). Se buscan por su sha256; el texto solo lo lee staff
-- (para el archivo del taller) y se borra en cuanto ya no sirve.

-- ---------------------------------------------------------------------------
-- 1. Los kits que el SQL necesita del catálogo (kits-catalog.json)
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.kits (
  code text primary key check (code ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  panel_plan_code text not null check (panel_plan_code ~ '^[a-z0-9_-]{2,64}$'),
  panel_days integer not null check (panel_days between 1 and 90),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 10),
  updated_at timestamptz not null default now()
);
alter table kardo_billing.kits enable row level security;

-- Copia de Docs/engineering/config/kits-catalog.json (ADR 025 §2). Si el
-- catálogo cambia, esta tabla cambia con una migración en el mismo commit;
-- scripts/e2e/billing-sync.mts falla si no coinciden.
insert into kardo_billing.kits (code, name, panel_plan_code, panel_days, items) values
  ('mostrador', 'Kit Mostrador', 'profesional', 30,
    '[{"piece":"stand","quantity":1},{"piece":"sticker","quantity":2}]'),
  ('presentacion', 'Kit Presentación', 'profesional', 30,
    '[{"piece":"card","quantity":2},{"piece":"stand","quantity":1}]'),
  ('refri', 'Kit Refri', 'profesional', 30,
    '[{"piece":"magnet","quantity":25},{"piece":"sticker","quantity":2}]'),
  ('completo', 'Kit Completo', 'negocio', 30,
    '[{"piece":"stand","quantity":1},{"piece":"card","quantity":1},{"piece":"magnet","quantity":10},{"piece":"sticker","quantity":5}]')
on conflict (code) do update set
  name = excluded.name,
  panel_plan_code = excluded.panel_plan_code,
  panel_days = excluded.panel_days,
  items = excluded.items,
  updated_at = now();

drop policy if exists "staff api kits read" on kardo_billing.kits;
create policy "staff api kits read" on kardo_billing.kits
  for select to kardo_staff_api
  using (kardo_private.is_active_staff());
grant select on kardo_billing.kits to kardo_staff_api;

-- ---------------------------------------------------------------------------
-- 2. El Touchpoint de tipo «Producto de Kardo»
-- ---------------------------------------------------------------------------

alter table kardo_core.touchpoints
  drop constraint if exists touchpoints_kind_allowed;
alter table kardo_core.touchpoints
  add constraint touchpoints_kind_allowed
  check (kind in ('nfc', 'qr', 'other', 'link', 'kardo'));

alter table kardo_core.touchpoints
  add column if not exists piece_model text,
  add column if not exists piece_batch_id uuid;

alter table kardo_core.touchpoints
  drop constraint if exists touchpoints_piece_model_allowed;
alter table kardo_core.touchpoints
  add constraint touchpoints_piece_model_allowed
  check (piece_model is null or piece_model in ('stand', 'card', 'magnet', 'sticker'));

-- Una pieza de Kardo siempre sabe qué pieza es, y nada más tiene modelo.
alter table kardo_core.touchpoints
  drop constraint if exists touchpoints_piece_model_kind;
alter table kardo_core.touchpoints
  add constraint touchpoints_piece_model_kind
  check ((kind = 'kardo') = (piece_model is not null));

-- Solo una pieza de Kardo existe sin dueño (antes de activarse).
alter table kardo_core.touchpoints
  drop constraint if exists touchpoints_unowned_only_pieces;
alter table kardo_core.touchpoints
  add constraint touchpoints_unowned_only_pieces
  check (workspace_id is not null or kind = 'kardo');

-- La dirección de una pieza la reconoce el Resolver por su forma: `kp_` y 20
-- letras o números. Ningún otro Touchpoint la usa (los del panel son 32 hex).
alter table kardo_core.touchpoints
  drop constraint if exists touchpoints_piece_public_id;
alter table kardo_core.touchpoints
  add constraint touchpoints_piece_public_id
  check ((kind = 'kardo') = (public_id ~ '^kp_[A-Za-z0-9]{20}$'));

-- Una pieza sigue siendo pieza, y nada se convierte en pieza: lo impreso ya
-- dice QR y NFC a la vez (ADR 026 §2).
create or replace function kardo_core.enforce_piece_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind and (old.kind = 'kardo' or new.kind = 'kardo') then
    raise exception using errcode = 'P0001', message = 'PIECE_KIND_FIXED';
  end if;
  if new.piece_model is distinct from old.piece_model
    or new.piece_batch_id is distinct from old.piece_batch_id then
    raise exception using errcode = 'P0001', message = 'PIECE_KIND_FIXED';
  end if;
  return new;
end;
$$;
drop trigger if exists touchpoints_piece_kind on kardo_core.touchpoints;
create trigger touchpoints_piece_kind
  before update of kind, piece_model, piece_batch_id on kardo_core.touchpoints
  for each row execute function kardo_core.enforce_piece_kind();

-- El panel nunca crea piezas: solo nacen en Operations.
drop policy if exists "customer api touchpoints no pieces" on kardo_core.touchpoints;
create policy "customer api touchpoints no pieces" on kardo_core.touchpoints
  as restrictive
  for insert to kardo_customer_api
  with check (kind <> 'kardo');

-- ---------------------------------------------------------------------------
-- 3. Lotes (el pedido de un kit o de piezas sueltas)
-- ---------------------------------------------------------------------------

create table if not exists kardo_core.piece_batches (
  id uuid primary key default gen_random_uuid(),
  kit_code text references kardo_billing.kits(code) on delete restrict,
  -- Para quién es, en palabras de Kardo («Café Central, pedido del 13»).
  reference text not null check (char_length(btrim(reference)) between 3 and 120),
  claim_secret_hash text not null unique check (claim_secret_hash ~ '^[0-9a-f]{64}$'),
  -- El código del kit en texto, solo para el archivo del taller; se borra
  -- cuando ya no queda ninguna pieza por activar.
  claim_code text check (claim_code is null or claim_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  -- La primera activación dice de quién es el lote: desde ahí el código del
  -- kit solo sirve en esa organización.
  workspace_id uuid references kardo_core.workspaces(id) on delete set null,
  claimed_by uuid references kardo_core.profiles(id) on delete set null,
  claimed_at timestamptz,
  -- Los 30 días del kit se aplican una sola vez (ADR 025 §2).
  -- trial: su prueba se alargó; courtesy: ya había pagado antes y recibió el
  -- plan del kit con vigencia; subscription/manual/internal: nada cambió;
  -- none: la organización no tiene cuenta de cobro.
  panel_outcome text check (panel_outcome in ('trial', 'courtesy', 'subscription', 'manual', 'internal', 'none')),
  panel_granted_at timestamptz,
  created_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint piece_batches_panel_consistent check ((panel_outcome is null) = (panel_granted_at is null))
);
create index if not exists piece_batches_created_idx on kardo_core.piece_batches (created_at desc);
create index if not exists piece_batches_workspace_idx on kardo_core.piece_batches (workspace_id) where workspace_id is not null;
alter table kardo_core.piece_batches enable row level security;

drop policy if exists "staff api piece batches read" on kardo_core.piece_batches;
create policy "staff api piece batches read" on kardo_core.piece_batches
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('pieces.read'));
grant select on kardo_core.piece_batches to kardo_staff_api;

alter table kardo_core.touchpoints
  drop constraint if exists touchpoints_piece_batch_fk;
alter table kardo_core.touchpoints
  add constraint touchpoints_piece_batch_fk
  foreign key (piece_batch_id) references kardo_core.piece_batches(id) on delete restrict;
create index if not exists touchpoints_piece_batch_idx
  on kardo_core.touchpoints (piece_batch_id) where piece_batch_id is not null;

-- ---------------------------------------------------------------------------
-- 4. El código de cada pieza (touchpoint_activations, del esquema inicial)
-- ---------------------------------------------------------------------------

alter table kardo_core.touchpoint_activations
  add column if not exists claim_code text,
  add column if not exists claimed_workspace_id uuid references kardo_core.workspaces(id) on delete set null;
alter table kardo_core.touchpoint_activations
  drop constraint if exists touchpoint_activations_code_format;
alter table kardo_core.touchpoint_activations
  add constraint touchpoint_activations_code_format
  check (claim_code is null or claim_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$');
alter table kardo_core.touchpoint_activations
  drop constraint if exists touchpoint_activations_hash_format;
alter table kardo_core.touchpoint_activations
  add constraint touchpoint_activations_hash_format
  check (claim_secret_hash ~ '^[0-9a-f]{64}$');

-- El esquema inicial dejó la tabla legible para el Customer API con una
-- política `true` (nadie la usaba). Ahora guarda códigos: solo la leen las
-- funciones de activación (security definer) y staff.
drop policy if exists "customer api activations" on kardo_core.touchpoint_activations;
revoke all on kardo_core.touchpoint_activations from kardo_customer_api;
drop policy if exists "staff api activations read" on kardo_core.touchpoint_activations;
create policy "staff api activations read" on kardo_core.touchpoint_activations
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('pieces.read'));
grant select on kardo_core.touchpoint_activations to kardo_staff_api;

-- ---------------------------------------------------------------------------
-- 5. Intentos de activación (límite por persona y por red)
-- ---------------------------------------------------------------------------

create table if not exists kardo_private.piece_claim_attempts (
  id bigint generated always as identity primary key,
  subject uuid not null references kardo_core.profiles(id) on delete cascade,
  -- sha256 de la IP, nunca la IP.
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  failed boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists piece_claim_attempts_subject_idx
  on kardo_private.piece_claim_attempts (subject, attempted_at) where failed;
create index if not exists piece_claim_attempts_client_idx
  on kardo_private.piece_claim_attempts (client_hash, attempted_at) where failed;
create index if not exists piece_claim_attempts_age_idx
  on kardo_private.piece_claim_attempts (attempted_at);
alter table kardo_private.piece_claim_attempts enable row level security;
revoke all on kardo_private.piece_claim_attempts from public;

-- Fallos permitidos por hora. Con 40 bits por código, 10 intentos por hora
-- no alcanzan para adivinar uno en mil años.
create or replace function kardo_private.piece_claim_failure_limits()
returns table (per_subject integer, per_client integer, window_length interval)
language sql
immutable
set search_path = ''
as $$ select 10, 30, interval '1 hour' $$;

-- Mayúsculas, sin espacios ni guiones, y la lectura de Crockford (I y L
-- son 1, O es 0) para quien copia a mano.
create or replace function kardo_private.normalize_piece_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(regexp_replace(upper(coalesce(p_code, '')), '[^0-9A-Z]', '', 'g'), 'ILO', '110')
$$;

create or replace function kardo_private.piece_code_hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(kardo_private.normalize_piece_code(p_code), 'sha256'), 'hex')
$$;
revoke all on function kardo_private.normalize_piece_code(text) from public;
revoke all on function kardo_private.piece_code_hash(text) from public;
revoke all on function kardo_private.piece_claim_failure_limits() from public;

-- ---------------------------------------------------------------------------
-- 6. Los 30 días del kit (ADR 025 §2 y §5, ahora solos)
-- ---------------------------------------------------------------------------

-- Qué pasaría con el panel de la cuenta si hoy se activa un kit:
--   internal      organización interna: nada cambia;
--   subscription  la cuenta ya paga: nada cambia;
--   manual        Kardo le dio un plan a mano y sigue vigente: nada cambia;
--   trial         su prueba dura hasta 30 días desde hoy, con el plan del kit
--                 si es mayor (Negocio en el Kit Completo).
create or replace function kardo_billing.kit_panel_outcome(p_workspace_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid := kardo_billing.account_of(p_workspace_id);
begin
  if kardo_billing.is_internal_workspace(p_workspace_id) then
    return 'internal';
  end if;
  if exists (
    select 1 from kardo_billing.subscriptions s
    where v_account is not null and s.account_id = v_account
      and kardo_billing.is_live_subscription(s.status)
  ) then
    return 'subscription';
  end if;
  if exists (
    select 1 from kardo_billing.account_plans ap
    where v_account is not null and ap.account_id = v_account
      and (ap.override_until is null or ap.override_until > now())
  ) then
    return 'manual';
  end if;
  return 'trial';
end;
$$;
revoke all on function kardo_billing.kit_panel_outcome(uuid) from public;

-- Aplica los días del kit a la cuenta de la organización. Solo la llama
-- `claim_kardo_pieces`, una vez por lote. Devuelve qué hizo y hasta cuándo.
create or replace function kardo_billing.grant_kit_panel(p_workspace_id uuid, p_kit_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := kardo_billing.kit_panel_outcome(p_workspace_id);
  v_account uuid := kardo_billing.account_of(p_workspace_id);
  v_profile uuid;
  v_kit kardo_billing.kits%rowtype;
  v_plan uuid;
  v_plan_sort integer;
  v_until timestamptz;
  v_trial uuid;
  v_trial_plan uuid;
  v_trial_converted timestamptz;
  v_email text;
  v_ends timestamptz;
begin
  select * into v_kit from kardo_billing.kits k where k.code = p_kit_code;
  if not found then
    raise exception using errcode = 'P0001', message = 'KIT_NOT_FOUND';
  end if;
  if v_outcome <> 'trial' then
    return jsonb_build_object('outcome', v_outcome);
  end if;

  select p.id, p.sort_order into v_plan, v_plan_sort
  from kardo_core.plans p
  where p.code = v_kit.panel_plan_code and p.is_active;
  if v_plan is null then
    raise exception using errcode = 'P0001', message = 'KIT_PLAN_NOT_FOUND';
  end if;
  select a.profile_id into v_profile from kardo_billing.accounts a where a.id = v_account;
  if v_profile is null then
    return jsonb_build_object('outcome', 'none');
  end if;
  v_until := now() + make_interval(days => v_kit.panel_days);

  select t.id, t.plan_id, t.converted_at into v_trial, v_trial_plan, v_trial_converted
  from kardo_billing.trials t
  where t.profile_id = v_profile
  order by t.ends_at desc
  limit 1
  for update;

  if v_trial is not null and v_trial_converted is null then
    -- Su prueba (vigente o ya vencida) dura hasta 30 días desde hoy, con el
    -- plan mayor entre el de la prueba y el del kit.
    update kardo_billing.trials t
    set ends_at = greatest(t.ends_at, v_until),
        plan_id = case
          when v_plan_sort > coalesce((select p.sort_order from kardo_core.plans p where p.id = t.plan_id), 0)
            then v_plan else t.plan_id
        end
    where t.id = v_trial
    returning t.ends_at into v_ends;
    return jsonb_build_object('outcome', 'trial', 'planCode', v_kit.panel_plan_code, 'endsAt', v_ends);
  end if;

  if v_trial is null then
    -- Nunca tuvo prueba (se unió por invitación y luego creó su negocio):
    -- el kit la abre.
    select lower(u.email) into v_email from auth.users u where u.id = v_profile;
    if v_email is not null then
      insert into kardo_billing.trials (workspace_id, profile_id, email_sha256, plan_id, billing_interval, ends_at)
      values (
        case when exists (select 1 from kardo_billing.trials t where t.workspace_id = p_workspace_id)
          then null else p_workspace_id end,
        v_profile, encode(extensions.digest(v_email, 'sha256'), 'hex'), v_plan, 'month', v_until
      )
      on conflict do nothing
      returning id into v_trial;
      if v_trial is not null then
        return jsonb_build_object('outcome', 'trial', 'planCode', v_kit.panel_plan_code, 'endsAt', v_until);
      end if;
    end if;
  end if;

  -- Ya pagó antes (su prueba se convirtió) y hoy no tiene suscripción: el
  -- kit le da el plan con vigencia, como un plan manual que vence solo.
  insert into kardo_billing.account_plans (account_id, plan_id, override_until, assigned_by, assigned_at)
  values (v_account, v_plan, v_until, null, now())
  on conflict (account_id) do update set
    plan_id = excluded.plan_id,
    override_until = excluded.override_until,
    assigned_by = null,
    assigned_at = now();
  return jsonb_build_object('outcome', 'courtesy', 'planCode', v_kit.panel_plan_code, 'endsAt', v_until);
end;
$$;
revoke all on function kardo_billing.grant_kit_panel(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- 7. Activar piezas desde el panel
-- ---------------------------------------------------------------------------

-- Lo que un código abre para esta organización. Nunca dice si un código
-- existe pero es de otra organización: ese caso es igual a uno que no existe.
--   status invalid | used | ok
create or replace function kardo_private.find_piece_claim(p_workspace_id uuid, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := kardo_private.normalize_piece_code(p_code);
  v_hash text;
  v_batch kardo_core.piece_batches%rowtype;
  v_activation kardo_core.touchpoint_activations%rowtype;
  v_piece kardo_core.touchpoints%rowtype;
  v_pieces jsonb;
  v_active integer;
begin
  if v_code !~ '^[0-9A-HJKMNP-TV-Z]{8}$' and v_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

  if char_length(v_code) = 10 then
    select * into v_batch from kardo_core.piece_batches b where b.claim_secret_hash = v_hash;
    if not found or (v_batch.workspace_id is not null and v_batch.workspace_id <> p_workspace_id) then
      return jsonb_build_object('status', 'invalid');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('touchpointId', t.id, 'model', t.piece_model)
             order by array_position(array['stand', 'card', 'magnet', 'sticker'], t.piece_model), t.public_id),
           '[]'::jsonb)
      into v_pieces
    from kardo_core.touchpoints t
    where t.piece_batch_id = v_batch.id and t.status = 'available' and t.workspace_id is null;
    select count(*) into v_active
    from kardo_core.touchpoints t
    where t.piece_batch_id = v_batch.id and t.workspace_id = p_workspace_id;
    if jsonb_array_length(v_pieces) = 0 then
      -- Ya activó todo con este código en esta organización.
      if v_batch.workspace_id = p_workspace_id then
        return jsonb_build_object('status', 'used', 'scope', 'kit');
      end if;
      return jsonb_build_object('status', 'invalid');
    end if;
    return jsonb_build_object(
      'status', 'ok', 'scope', 'kit', 'batchId', v_batch.id, 'kitCode', v_batch.kit_code,
      'pieces', v_pieces, 'alreadyActive', v_active,
      'panelPending', v_batch.kit_code is not null and v_batch.panel_granted_at is null
    );
  end if;

  select * into v_activation from kardo_core.touchpoint_activations a where a.claim_secret_hash = v_hash;
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_piece from kardo_core.touchpoints t where t.id = v_activation.touchpoint_id;
  if not found or v_piece.kind <> 'kardo' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_piece.status = 'available' and v_piece.workspace_id is null then
    select * into v_batch from kardo_core.piece_batches b where b.id = v_piece.piece_batch_id;
    return jsonb_build_object(
      'status', 'ok', 'scope', 'piece', 'batchId', v_piece.piece_batch_id, 'kitCode', v_batch.kit_code,
      'pieces', jsonb_build_array(jsonb_build_object('touchpointId', v_piece.id, 'model', v_piece.piece_model)),
      'alreadyActive', 0,
      'panelPending', v_batch.kit_code is not null and v_batch.panel_granted_at is null
    );
  end if;
  if v_piece.workspace_id = p_workspace_id and v_piece.status <> 'retired' then
    return jsonb_build_object('status', 'used', 'scope', 'piece');
  end if;
  return jsonb_build_object('status', 'invalid');
end;
$$;
revoke all on function kardo_private.find_piece_claim(uuid, text) from public;

-- Quién puede activar: quien puede crear touchpoints (Owner, Admin, Editor),
-- con el límite de fallos por hora. Lanza FORBIDDEN o PIECE_CODE_RATE_LIMITED.
create or replace function kardo_private.check_piece_claim_caller(p_workspace_id uuid, p_client text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_client text;
  v_limits record;
begin
  if v_subject is null
    or coalesce(kardo_private.workspace_role(p_workspace_id)::text, '') not in ('owner', 'admin', 'editor') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_client := encode(extensions.digest('kardo-piece-claim:' || coalesce(p_client, ''), 'sha256'), 'hex');
  select * into v_limits from kardo_private.piece_claim_failure_limits();
  delete from kardo_private.piece_claim_attempts a where a.attempted_at < now() - interval '1 day';
  if (select count(*) from kardo_private.piece_claim_attempts a
      where a.subject = v_subject and a.failed and a.attempted_at > now() - v_limits.window_length) >= v_limits.per_subject
    or (select count(*) from kardo_private.piece_claim_attempts a
      where a.client_hash = v_client and a.failed and a.attempted_at > now() - v_limits.window_length) >= v_limits.per_client then
    raise exception using errcode = 'P0001', message = 'PIECE_CODE_RATE_LIMITED';
  end if;
  return v_client;
end;
$$;
revoke all on function kardo_private.check_piece_claim_caller(uuid, text) from public;

-- Vista previa: qué piezas abre el código, el kit y sus días de panel. Un
-- código que no sirve cuenta como intento fallido (por eso no lanza error).
create or replace function kardo_private.preview_piece_claim(p_workspace_id uuid, p_code text, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text := kardo_private.check_piece_claim_caller(p_workspace_id, p_client);
  v_found jsonb := kardo_private.find_piece_claim(p_workspace_id, p_code);
  v_kit kardo_billing.kits%rowtype;
  v_panel jsonb := null;
begin
  insert into kardo_private.piece_claim_attempts (subject, client_hash, failed)
  values (kardo_private.current_customer_subject(), v_client, v_found->>'status' = 'invalid');
  if v_found->>'status' <> 'ok' then
    return v_found;
  end if;
  if v_found->>'kitCode' is not null then
    select * into v_kit from kardo_billing.kits k where k.code = v_found->>'kitCode';
    v_panel := jsonb_build_object(
      'kitCode', v_kit.code,
      'kitName', v_kit.name,
      'planCode', v_kit.panel_plan_code,
      'planName', (select p.name from kardo_core.plans p where p.code = v_kit.panel_plan_code),
      'days', v_kit.panel_days,
      'pending', (v_found->>'panelPending')::boolean,
      'outcome', kardo_billing.kit_panel_outcome(p_workspace_id)
    );
  end if;
  return (v_found - 'panelPending' - 'batchId') || jsonb_build_object('kit', v_panel);
end;
$$;
revoke all on function kardo_private.preview_piece_claim(uuid, text, text) from public;
grant execute on function kardo_private.preview_piece_claim(uuid, text, text) to kardo_customer_api;

-- Activa las piezas elegidas del código, con su nombre y su grupo, todas o
-- ninguna. El plan y su límite los revisa el Customer API en la misma
-- transacción, después de esta función (si no caben, todo se deshace).
--   p_pieces: [{ "touchpointId": uuid, "name": text }]
create or replace function kardo_private.claim_kardo_pieces(
  p_workspace_id uuid,
  p_code text,
  p_client text,
  p_pieces jsonb,
  p_group_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text := kardo_private.check_piece_claim_caller(p_workspace_id, p_client);
  v_subject uuid := kardo_private.current_customer_subject();
  v_found jsonb := kardo_private.find_piece_claim(p_workspace_id, p_code);
  v_batch kardo_core.piece_batches%rowtype;
  v_allowed uuid[];
  v_ids uuid[];
  v_count integer;
  v_locked integer;
  v_panel jsonb := null;
  v_public_ids text[];
  v_remaining integer;
begin
  insert into kardo_private.piece_claim_attempts (subject, client_hash, failed)
  values (v_subject, v_client, v_found->>'status' = 'invalid');
  if v_found->>'status' <> 'ok' then
    return jsonb_build_object('status', v_found->>'status');
  end if;

  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array'
    or jsonb_array_length(p_pieces) < 1 or jsonb_array_length(p_pieces) > 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_PIECES';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_pieces) piece
    where jsonb_typeof(piece) <> 'object'
       or coalesce(piece->>'touchpointId', '') !~ '^[0-9a-fA-F-]{36}$'
       or char_length(btrim(coalesce(piece->>'name', ''))) not between 1 and 120
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PIECES';
  end if;

  select array_agg((piece->>'touchpointId')::uuid) into v_allowed
  from jsonb_array_elements(v_found->'pieces') piece;
  select array_agg(distinct (piece->>'touchpointId')::uuid), count(*) into v_ids, v_count
  from jsonb_array_elements(p_pieces) piece;
  if cardinality(v_ids) <> v_count or not (v_ids <@ v_allowed) then
    raise exception using errcode = 'P0001', message = 'PIECE_NOT_CLAIMABLE';
  end if;

  if p_group_id is not null and not exists (
    select 1 from kardo_core.touchpoint_groups g
    where g.id = p_group_id and g.workspace_id = p_workspace_id
  ) then
    raise exception using errcode = 'P0001', message = 'GROUP_NOT_FOUND';
  end if;

  select * into v_batch from kardo_core.piece_batches b
  where b.id = (v_found->>'batchId')::uuid
  for update;

  -- Otra activación pudo ganar la carrera: todas siguen libres o ninguna.
  perform 1 from kardo_core.touchpoints t
  where t.id = any (v_ids) and t.status = 'available' and t.workspace_id is null
  for update;
  get diagnostics v_locked = row_count;
  if v_locked <> v_count then
    raise exception using errcode = 'P0001', message = 'PIECE_NOT_CLAIMABLE';
  end if;

  -- Kardo ya la grabó e imprimió: llega lista para probar y colocar.
  update kardo_core.touchpoints t
  set workspace_id = p_workspace_id,
      status = 'assigned',
      operational_name = btrim(piece->>'name'),
      group_id = p_group_id,
      object_prepared_at = coalesce(t.object_prepared_at, now()),
      updated_at = now()
  from jsonb_array_elements(p_pieces) piece
  where t.id = (piece->>'touchpointId')::uuid;

  update kardo_core.touchpoint_activations a
  set claimed_at = now(), claimed_by = v_subject, claimed_workspace_id = p_workspace_id, claim_code = null
  where a.touchpoint_id = any (v_ids);

  select count(*) into v_remaining
  from kardo_core.touchpoints t
  where t.piece_batch_id = v_batch.id and t.status = 'available' and t.workspace_id is null;
  update kardo_core.piece_batches b
  set workspace_id = coalesce(b.workspace_id, p_workspace_id),
      claimed_by = coalesce(b.claimed_by, v_subject),
      claimed_at = coalesce(b.claimed_at, now()),
      claim_code = case when v_remaining = 0 then null else b.claim_code end
  where b.id = v_batch.id;

  if v_batch.kit_code is not null and v_batch.panel_granted_at is null then
    v_panel := kardo_billing.grant_kit_panel(p_workspace_id, v_batch.kit_code);
    update kardo_core.piece_batches b
    set panel_outcome = v_panel->>'outcome', panel_granted_at = now()
    where b.id = v_batch.id;
  end if;

  select array_agg(t.public_id order by t.public_id) into v_public_ids
  from kardo_core.touchpoints t where t.id = any (v_ids);

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'pieces.claimed', 'piece_batch', v_batch.id, 'succeeded',
    jsonb_build_object(
      'scope', v_found->>'scope', 'kitCode', v_batch.kit_code, 'pieces', v_count,
      'groupId', p_group_id, 'panel', v_panel
    )
  );

  return jsonb_build_object(
    'status', 'claimed',
    'scope', v_found->>'scope',
    'touchpointIds', to_jsonb(v_ids),
    'publicIds', to_jsonb(v_public_ids),
    'panel', v_panel
  );
end;
$$;
revoke all on function kardo_private.claim_kardo_pieces(uuid, text, text, jsonb, uuid) from public;
grant execute on function kardo_private.claim_kardo_pieces(uuid, text, text, jsonb, uuid) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 8. Crear un lote desde Operations
-- ---------------------------------------------------------------------------

-- Los códigos y direcciones los genera el Staff API (aleatorios de 40 y 50
-- bits); aquí se validan, se guardan y se audita.
--   p_items  (sin kit): [{ "piece": "card", "quantity": 10 }]
--   p_pieces: [{ "publicId": "kp_…", "model": "card", "code": "ABCD2345" }]
create or replace function kardo_private.create_piece_batch(
  p_kit_code text,
  p_items jsonb,
  p_reference text,
  p_reason text,
  p_batch_code text,
  p_pieces jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := kardo_private.current_staff_subject();
  v_items jsonb;
  v_batch uuid;
  v_batch_code text := kardo_private.normalize_piece_code(p_batch_code);
  v_total integer;
begin
  if v_staff is null or not kardo_private.staff_has_permission('pieces.write') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;
  if p_reference is null or char_length(btrim(p_reference)) not between 3 and 120 then
    raise exception using errcode = 'P0001', message = 'INVALID_REFERENCE';
  end if;

  if p_kit_code is not null then
    select k.items into v_items from kardo_billing.kits k where k.code = p_kit_code;
    if v_items is null then
      raise exception using errcode = 'P0001', message = 'KIT_NOT_FOUND';
    end if;
  else
    v_items := p_items;
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1
    or exists (
      select 1 from jsonb_array_elements(v_items) item
      where coalesce(item->>'piece', '') not in ('stand', 'card', 'magnet', 'sticker')
         or coalesce(item->>'quantity', '') !~ '^[0-9]{1,3}$'
         or (item->>'quantity')::integer < 1
    ) then
    raise exception using errcode = 'P0001', message = 'INVALID_ITEMS';
  end if;
  select sum((item->>'quantity')::integer) into v_total from jsonb_array_elements(v_items) item;
  if v_total > 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_ITEMS';
  end if;

  -- Las piezas que mandó el API son exactamente las del pedido.
  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array' or jsonb_array_length(p_pieces) <> v_total
    or exists (
      select 1 from jsonb_array_elements(p_pieces) piece
      where coalesce(piece->>'publicId', '') !~ '^kp_[A-Za-z0-9]{20}$'
         or coalesce(piece->>'code', '') !~ '^[0-9A-HJKMNP-TV-Z]{8}$'
    )
    or exists (
      select 1
      from (select item->>'piece' as model, sum((item->>'quantity')::integer) as quantity
            from jsonb_array_elements(v_items) item group by 1) wanted
      full join (select piece->>'model' as model, count(*) as quantity
                 from jsonb_array_elements(p_pieces) piece group by 1) given
        on given.model = wanted.model
      where given.quantity is distinct from wanted.quantity
    ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PIECES';
  end if;
  if v_batch_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_CODE';
  end if;

  insert into kardo_core.piece_batches (kit_code, reference, claim_secret_hash, claim_code, created_by)
  values (
    p_kit_code, btrim(p_reference), encode(extensions.digest(v_batch_code, 'sha256'), 'hex'),
    v_batch_code, v_staff
  )
  returning id into v_batch;

  with created as (
    insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, piece_model, piece_batch_id)
    select piece->>'publicId', null, 'available', 'card', 'kardo', piece->>'model', v_batch
    from jsonb_array_elements(p_pieces) piece
    returning id, public_id
  )
  insert into kardo_core.touchpoint_activations (touchpoint_id, claim_secret_hash, claim_code)
  select created.id, encode(extensions.digest(piece->>'code', 'sha256'), 'hex'), piece->>'code'
  from created
  join jsonb_array_elements(p_pieces) piece on piece->>'publicId' = created.public_id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
  ) values (
    null, v_staff, 'staff', 'pieces.batch_created', 'piece_batch', v_batch, 'succeeded', btrim(p_reason),
    jsonb_build_object('kitCode', p_kit_code, 'items', v_items, 'pieces', v_total)
  );
  return v_batch;
end;
$$;
revoke all on function kardo_private.create_piece_batch(text, jsonb, text, text, text, jsonb) from public;
grant execute on function kardo_private.create_piece_batch(text, jsonb, text, text, text, jsonb) to kardo_staff_api;

-- ---------------------------------------------------------------------------
-- 9. Permisos de staff
-- ---------------------------------------------------------------------------

insert into kardo_staff.permissions (role_id, permission)
select role.id, catalog.permission
from kardo_staff.roles role
join (
  values
    ('platform-admin', 'pieces.read'),
    ('platform-admin', 'pieces.write'),
    ('operations', 'pieces.read'),
    ('operations', 'pieces.write'),
    ('commercial', 'pieces.read'),
    ('commercial', 'pieces.write'),
    ('support', 'pieces.read')
) as catalog(role_code, permission) on catalog.role_code = role.code
on conflict do nothing;
