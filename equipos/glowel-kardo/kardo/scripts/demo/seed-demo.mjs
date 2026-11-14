// Seeds a clean, realistic demo business in kardo-dev for manual review of
// the panels: "Café Central" with two table zones, published Experiences, a
// draft, a team, leads and real public taps (so charts have data).
// Development only. Idempotent: re-running keeps the same password and does
// not duplicate content. The shared demo password lives in .env
// (DEMO_PASSWORD) and is printed once so the owner can sign in.
//
// Usage: node scripts/demo/seed-demo.mjs   (Customer API running locally)
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "services/customer-api/package.json"));
const postgres = require("postgres");

const envPath = path.join(root, ".env");
const envText = fs.readFileSync(envPath, "utf8");
const raw = Object.fromEntries(
  envText
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const env = Object.fromEntries(
  Object.entries(raw).map(([key, value]) => [key, value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => raw[name] ?? "")]),
);
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local")) {
  throw new Error("La demo solo se siembra fuera de producción.");
}
const api = (process.env.DEMO_API_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");
const resolver = (env.TAP_RESOLVER_URL ?? env.VITE_TAP_RESOLVER_URL).replace(/\/$/, "");
const password = env.DEMO_PASSWORD || `Kardo-Demo-${randomBytes(4).toString("hex")}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const people = {
  owner: { email: "demo@kardo.test", name: "Ana Martínez" },
  editor: { email: "demo-editor@kardo.test", name: "Luis Herrera" },
  staff: { email: "demo-staff@kardo.test", name: "Soporte Kardo (demo)" },
};

// --- 1. Accounts (admin connection, dev only) ----------------------------------
const sql = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const ids = {};
try {
  for (const [key, person] of Object.entries(people)) {
    const [existing] = await sql`select id from auth.users where email = ${person.email}`;
    if (existing) {
      ids[key] = existing.id;
      await sql`
        update auth.users
        set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
        where id = ${existing.id}
      `;
    } else {
      ids[key] = await sql.begin(async (tx) => {
        const [user] = await tx`
          insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, reauthentication_token, phone_change, phone_change_token
          ) values (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            ${person.email}, extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
            ${sql.json({ provider: "email", providers: ["email"] })},
            ${sql.json({ display_name: person.name })}, now(), now(),
            '', '', '', '', '', '', '', ''
          )
          returning id
        `;
        await tx`
          insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          values (${user.id}, ${user.id}::text, ${sql.json({ sub: user.id, email: person.email, email_verified: true })},
                  'email', now(), now(), now())
        `;
        return user.id;
      });
    }
    await sql`update kardo_core.profiles set display_name = ${person.name} where id = ${ids[key]}::uuid`;
  }
  // Demo staff: active platform-admin; TOTP is enrolled on the first sign-in.
  await sql`
    insert into kardo_staff.staff_profiles (id, status, display_name)
    values (${ids.staff}::uuid, 'active', ${people.staff.name})
    on conflict (id) do update set status = 'active', revoked_at = null
  `;
  await sql`
    insert into kardo_staff.role_assignments (staff_id, role_id)
    select ${ids.staff}::uuid, id from kardo_staff.roles where code = 'platform-admin'
    on conflict do nothing
  `;
} finally {
  await sql.end();
}

if (!env.DEMO_PASSWORD) {
  const lines = envText.split("\n");
  lines.push("# Demo accounts for manual review in kardo-dev (scripts/demo/seed-demo.mjs).", `DEMO_PASSWORD=${password}`);
  fs.writeFileSync(envPath, lines.join("\n"), { mode: fs.statSync(envPath).mode & 0o777 });
}

// --- 2. Business content through the real Customer API ---------------------------
async function signIn(email) {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`No se pudo iniciar sesión como ${email} (HTTP ${response.status}).`);
  return (await response.json()).access_token;
}
async function call(token, method, route, body, headers = {}) {
  const response = await fetch(`${api}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${route} → HTTP ${response.status} ${json?.code ?? ""}`);
  return json;
}

const owner = await signIn(people.owner.email);
const workspaces = await call(owner, "GET", "/v1/workspaces");
let org = workspaces.find((workspace) => workspace.kind === "organization" && workspace.name === "Café Central");

if (org) {
  console.log("La organización «Café Central» ya existe: no se duplica el contenido.");
} else {
  org = await call(owner, "POST", "/v1/organizations", { name: "Café Central" });
  const w = org.id;

  const terraza = await call(owner, "POST", `/v1/workspaces/${w}/touchpoint-groups`, {
    name: "Terraza",
    description: "Mesas exteriores con QR en el centro de mesa",
  });
  const salon = await call(owner, "POST", `/v1/workspaces/${w}/touchpoint-groups`, {
    name: "Salón",
    description: "Mesas interiores con etiqueta NFC",
  });
  const terrazaTables = (await call(owner, "POST", `/v1/workspaces/${w}/touchpoints/batch`, {
    namePrefix: "Terraza · Mesa", start: 1, count: 4, kind: "qr", groupId: terraza.id,
  })).touchpoints;
  const salonTables = (await call(owner, "POST", `/v1/workspaces/${w}/touchpoints/batch`, {
    namePrefix: "Salón · Mesa", start: 1, count: 6, kind: "nfc", groupId: salon.id,
  })).touchpoints;
  const counter = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints`, {
    operationalName: "Mostrador · Caja", kind: "qr",
  });
  const card = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints`, {
    operationalName: "Tarjeta de presentación · Ana", kind: "nfc",
  });

  const create = (body) => call(owner, "POST", `/v1/workspaces/${w}/experiences`, body);
  const publish = (experience) =>
    call(owner, "POST", `/v1/workspaces/${w}/experiences/${experience.id}/publication-intents`, undefined, {
      "idempotency-key": randomUUID(),
    });

  const menu = await create({
    name: "Carta de temporada",
    type: "menu",
    targets: { touchpointIds: [], groupIds: [terraza.id, salon.id] },
    content: {
      title: "Carta de otoño",
      description: "Café de especialidad de Veracruz y panadería del día.",
      currency: "MXN",
      sections: [
        { id: "cafe", name: "Café", items: [
          { id: "espresso", name: "Espresso", description: "Doble, tueste medio", price: 45 },
          { id: "latte", name: "Latte", description: "Leche entera o de avena", price: 62 },
          { id: "cold-brew", name: "Cold brew", description: "Infusión en frío de 18 horas", price: 68 },
        ] },
        { id: "panaderia", name: "Panadería", items: [
          { id: "concha", name: "Concha de vainilla", price: 38 },
          { id: "croissant", name: "Croissant de mantequilla", price: 48 },
          { id: "rol", name: "Rol de canela", description: "Con glaseado de queso crema", price: 55 },
        ] },
        { id: "desayunos", name: "Desayunos", items: [
          { id: "chilaquiles", name: "Chilaquiles verdes", description: "Con huevo estrellado", price: 135 },
          { id: "molletes", name: "Molletes", description: "Frijol, queso y pico de gallo", price: 98 },
        ] },
      ],
    },
  });
  const promo = await create({
    name: "Martes 2×1 en lattes",
    type: "links",
    targets: { touchpointIds: [terrazaTables[0].id], groupIds: [] },
    content: {
      title: "Martes 2×1 en lattes",
      description: "Muestra esta pantalla al pedir. Válido todos los martes.",
      links: [
        { id: "instagram", label: "Síguenos en Instagram", url: "https://www.instagram.com/" },
        { id: "resena", label: "Déjanos una reseña", url: "https://www.google.com/maps" },
      ],
    },
  });
  const form = await create({
    name: "Reservas para eventos",
    type: "form",
    targets: { touchpointIds: [counter.id], groupIds: [] },
    content: {
      title: "¿Organizas un evento?",
      description: "Déjanos tus datos y te enviamos opciones para grupos de 10 a 40 personas.",
      fields: { name: "required", phone: "optional", message: "optional" },
      submitLabel: "Quiero que me contacten",
      successMessage: "¡Gracias! Te escribimos en menos de 24 horas.",
      consentText: "Acepto que Café Central me contacte sobre mi solicitud.",
    },
  });
  const profile = await create({
    name: "Perfil de Ana",
    type: "profile",
    targets: { touchpointIds: [card.id], groupIds: [] },
    content: {
      displayName: "Ana Martínez",
      headline: "Fundadora de Café Central",
      biography: "Tostamos café mexicano de especialidad desde 2019.",
      links: [
        { id: "web", label: "Sitio web", url: "https://www.kardo.mx/" },
        { id: "whatsapp", label: "Escríbeme por WhatsApp", url: "https://wa.me/" },
      ],
    },
  });
  // A draft that is never published, to show the draft state.
  await create({
    name: "Carta de invierno (borrador)",
    type: "redirect",
    targets: { touchpointIds: [], groupIds: [salon.id] },
    content: { destinationUrl: "https://www.kardo.mx/" },
  });

  for (const experience of [menu, promo, form, profile]) await publish(experience);
  console.log("Publicando contenido…");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await call(owner, "GET", `/v1/workspaces/${w}/experiences`);
    const pending = [menu, promo, form, profile].filter(
      (experience) => list.find((item) => item.id === experience.id)?.publicationStatus !== "published",
    );
    if (pending.length === 0) break;
    await sleep(3_000);
  }

  // Team: an editor who accepted, and a pending invitation (reserved domain:
  // no real email is sent).
  const invitation = await call(owner, "POST", `/v1/workspaces/${w}/invitations`, {
    email: people.editor.email,
    role: "editor",
  });
  const editor = await signIn(people.editor.email);
  await call(editor, "POST", "/v1/invitations/accept", { token: invitation.token });
  await call(owner, "POST", `/v1/workspaces/${w}/invitations`, { email: "caja@cafecentral.example", role: "viewer" });

  // Public traffic: real taps through the Resolver (QR mostly, some NFC).
  const allTables = [...terrazaTables, ...salonTables];
  const taps = [];
  for (const [index, table] of allTables.entries()) {
    const visits = 3 + ((index * 7) % 6);
    for (let visit = 0; visit < visits; visit += 1) {
      taps.push(`${resolver}/t/${table.publicId}?src=${visit % 4 === 0 ? "nfc" : "qr"}`);
    }
  }
  for (let visit = 0; visit < 6; visit += 1) taps.push(`${resolver}/t/${counter.publicId}?src=qr`);
  for (let visit = 0; visit < 4; visit += 1) taps.push(`${resolver}/t/${card.publicId}?src=nfc`);
  taps.push(`${resolver}/t/${card.publicId}`);
  for (const url of taps) {
    const response = await fetch(url, { redirect: "manual" });
    await response.body?.cancel();
  }
  for (let click = 0; click < 3; click += 1) {
    const response = await fetch(`${resolver}/t/${terrazaTables[0].publicId}/go/instagram?src=qr`, { redirect: "manual" });
    await response.body?.cancel();
  }

  // Leads from the event form.
  const leads = [
    { name: "Mariana López", email: "mariana.lopez@example.com", phone: "+52 55 1234 5678", message: "Cumpleaños para 25 personas el 12 de octubre." },
    { name: "Grupo Andares", email: "eventos@andares.example", message: "Desayuno de trabajo para 15, entre semana." },
    { name: "Jorge Ruiz", email: "jorge.ruiz@example.com", phone: "+52 33 9876 5432" },
  ];
  for (const lead of leads) {
    const response = await fetch(`${resolver}/t/${counter.publicId}/leads?src=qr`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...lead, consent: "yes", website: "" }).toString(),
    });
    await response.body?.cancel();
  }
  await sleep(4_000);
  const page = await call(owner, "GET", `/v1/workspaces/${w}/leads?limit=10`);
  const first = page.items.find((item) => item.email === leads[1].email);
  if (first) await call(owner, "PATCH", `/v1/workspaces/${w}/leads/${first.id}`, { status: "contacted" });

  console.log(`Sembrado: 12 Touchpoints en 2 grupos, 4 Experiences publicadas + 1 borrador, ${taps.length} visitas, 3 clics, ${leads.length} leads, 1 editor y 1 invitación pendiente.`);
}

console.log("\nCuentas demo (kardo-dev):");
console.log(`  Dueña del negocio  ${people.owner.email}`);
console.log(`  Editor             ${people.editor.email}`);
console.log(`  Staff Kardo        ${people.staff.email}  (primer acceso a Operations: registra el TOTP)`);
console.log(`  Contraseña         ${password}`);
