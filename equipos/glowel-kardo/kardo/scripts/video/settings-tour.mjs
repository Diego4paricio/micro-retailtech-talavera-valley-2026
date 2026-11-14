// Tour of the 2026-10-03 session (relevo 30, ADR 023): Configuración by
// level, Perfil, Preferencias, Seguridad with the real second factor, signing
// in with it, Equipo and Ayuda, Plan y facturación (usage bars, downgrade
// option B and the «Fuera del plan» badge) and Tus datos (export, delete).
//
//   node scripts/video/accounts.mjs pilates coach gema
//   node scripts/video/settings-tour.mjs
//
// Local stack: Customer API copy on 3011 (no watch) and the panel on 5185
// against it (scripts/video/README.md). kardo-dev only; the accounts are
// Resend test inboxes. Creates «Estudio Pilates Luna» off camera, deletes the
// «gema» account on camera and leaves the rest for the owner to look at.
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import {
  createNarrator,
  finishVideo,
  log,
  offCameraSession,
  postgres,
  readAccounts,
  readEnv,
  recordingContext,
  sleep,
  totp,
} from "./lib.mjs";

const PANEL = process.env.VIDEO_PANEL ?? "http://localhost:5185";
const BUSINESS = "Estudio Pilates Luna";
const TOTAL = 8;
const LEGAL = "1.1";

const env = readEnv();
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("Only outside production.");
const { pilates, coach, gema } = readAccounts();
if (!pilates || !coach || !gema)
  throw new Error("Primero: node scripts/video/accounts.mjs pilates coach gema");

const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const randomId = (prefix) =>
  `${prefix}${randomBytes(12).toString("base64url")}`.slice(0, 24);

// --- Off camera: people, the organization and its 17 QR -------------------
await sql`
  update kardo_core.profiles
  set display_name = case id
        when ${pilates.id}::uuid then 'Paula Rivera'
        when ${coach.id}::uuid then 'Iván Torres'
        else 'Gema Ruiz' end,
      preferred_name = null, time_zone = null, hour_cycle = null,
      terms_version = ${LEGAL}, privacy_version = ${LEGAL}, terms_accepted_at = now()
  where id in (${pilates.id}::uuid, ${coach.id}::uuid, ${gema.id}::uuid)
`;
const [org] = await sql`
  insert into kardo_core.workspaces (public_id, kind, name)
  values (${randomId("ws")}, 'organization', ${BUSINESS})
  returning id
`;
await sql`
  insert into kardo_core.workspace_memberships (workspace_id, profile_id, role) values
    (${org.id}::uuid, ${pilates.id}::uuid, 'owner'),
    (${org.id}::uuid, ${coach.id}::uuid, 'editor')
`;
const places = [
  "Recepción",
  "Salón Reformer",
  "Salón Mat",
  "Salón Barre",
  "Vestidores",
  "Tienda",
  "Barra de bebidas",
  "Clase muestra",
  ...Array.from({ length: 9 }, (_, index) => `Reformer ${index + 1}`),
];
for (const name of places)
  await sql`
    insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
    values (${randomId("tp")}, ${org.id}::uuid, 'assigned', 'other', 'qr', ${name})
  `;

async function setPlan(code) {
  await sql`
    insert into kardo_core.workspace_plans (workspace_id, plan_id, assigned_at)
    select ${org.id}::uuid, p.id, now() from kardo_core.plans p where p.code = ${code}
    on conflict (workspace_id) do update
      set plan_id = excluded.plan_id, assigned_at = now(), override_until = null
  `;
  const [row] =
    await sql`select kardo_billing.refresh_plan_overage(${org.id}::uuid) as result`;
  return row.result;
}

// Like the beta organizations: «Beta», with no limits.
await setPlan("beta");

// Gema has her own small business, where she is the only person.
const [gemaOrg] = await sql`
  insert into kardo_core.workspaces (public_id, kind, name)
  values (${randomId("ws")}, 'organization', 'Florería Gema')
  returning id
`;
await sql`
  insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
  values (${gemaOrg.id}::uuid, ${gema.id}::uuid, 'owner')
`;
await sql`
  insert into kardo_core.workspace_plans (workspace_id, plan_id, assigned_at)
  select ${gemaOrg.id}::uuid, p.id, now() from kardo_core.plans p where p.code = 'beta'
`;
await sql`
  insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
  values (${randomId("tp")}, ${gemaOrg.id}::uuid, 'assigned', 'other', 'qr', 'Mostrador')
`;

// --- Recording --------------------------------------------------------------
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ownerSession = await offCameraSession(browser, PANEL, pilates);
const { context, dir } = await recordingContext(browser, "settings-tour");
const page = await context.newPage();
page.setDefaultTimeout(20_000);
page.on("pageerror", (error) => log(`pageerror ${error.message}`));
const { say, unmark, slide } = createNarrator(page, TOTAL);
const dialog = () => page.getByRole("dialog");

async function enter(session, workspaceId) {
  await page.goto(`${PANEL}/`);
  await page.evaluate(
    ([entries, workspace]) => {
      localStorage.clear();
      for (const [key, value] of Object.entries(entries))
        localStorage.setItem(key, value);
      if (workspace) localStorage.setItem("kardo.workspace", workspace);
    },
    [session, workspaceId],
  );
}

async function open(path, text) {
  await page.goto(`${PANEL}${path}`);
  await page.getByText(text).first().waitFor();
  await sleep(700);
}

async function part(number, title, lines) {
  await slide(
    `<p class="k" style="font-weight:700;letter-spacing:.12em;font-size:15px">PARTE ${number} DE ${TOTAL}</p>
     <h2>${title}</h2>
     <ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`,
    4500,
  );
}

const cleanup = [];
try {
  await slide(
    `<p class="k" style="font-weight:700;letter-spacing:.12em;font-size:15px">KARDO · SESIÓN DEL 3 DE OCTUBRE</p>
     <h1>Tu cuenta, seguridad, equipo y plan</h1>
     <p>Todo lo de este video funciona en kardo-dev. Las cuentas son de prueba y no reciben correos reales.</p>
     <ul>
       <li>1. Configuración por niveles</li><li>2. Perfil</li><li>3. Preferencias</li>
       <li>4. Seguridad y verificación en dos pasos</li><li>5. Entrar con el código de la app</li>
       <li>6. Equipo y Ayuda</li><li>7. Plan: consumo, bajada de plan y «Fuera del plan»</li>
       <li>8. Tus datos: exportar y borrar la cuenta</li>
     </ul>`,
    8000,
  );

  // 1. Configuración by level.
  await part(1, "Configuración por niveles", [
    "«Tu cuenta» y «Organización» separados, en azul de Kardo",
    "Cada opción es una página con grupos y renglones, sin cajas",
  ]);
  await enter(ownerSession, org.id);
  await open("/settings/cuenta", "Nombre preferido");
  await say(1, "HOY", "Dos niveles", "Arriba lo tuyo (Perfil, Preferencias, Seguridad, Tus datos). Abajo lo de la organización (General, Marca, Equipo, Plan y facturación).", 6500, page.locator(".settings-nav"));

  // 2. Perfil.
  await part(2, "Perfil", [
    "Nombre preferido: con él te saluda Kardo",
    "Cambiar el correo es posible, pero protegido",
  ]);
  await open("/settings/cuenta", "Nombre preferido");
  await page.getByRole("button", { name: "Cambiar nombre preferido" }).click();
  await dialog().locator("input").first().pressSequentially("Pau", { delay: 60 });
  await say(2, "HOY", "Cada cambio en su propio diálogo", "Nada de campos sueltos con un «Guardar» al final: cada dato se cambia en su diálogo.", 4500, dialog());
  await dialog().getByRole("button", { name: "Guardar" }).click();
  await sleep(1200);
  await say(2, "HOY", "Nombre preferido guardado", "Se guarda en tu cuenta (ya no en el navegador) y el saludo del Resumen lo usa en todos tus dispositivos.", 5000, page.getByText("Pau").first());
  await page.getByRole("button", { name: "Cambiar correo" }).click();
  await dialog().getByText(/contraseña/i).first().waitFor();
  await say(2, "HOY", "Cambiar correo", "Primero confirmas que eres tú con tu contraseña. Luego llega un código al correo actual y otro al nuevo, y avisamos al anterior.", 7000, dialog());
  await page.keyboard.press("Escape");
  await unmark();

  // 3. Preferencias.
  await part(3, "Preferencias", [
    "Zona horaria y formato de hora para todas las fechas del panel",
    "Permiso para recibir novedades por correo",
  ]);
  await open("/settings/preferencias", "Zona horaria");
  await page.getByRole("button", { name: "Cambiar zona horaria" }).click();
  await dialog().locator("#time-zone-select").selectOption("America/Tijuana");
  await say(3, "HOY", "Zona horaria", "Por omisión usa la de tu dispositivo; aquí eliges otra. Todas las fechas y horas del panel la siguen.", 5000, dialog());
  await dialog().getByRole("button", { name: "Guardar" }).click();
  await sleep(1000);
  await page.locator('button[role="radio"][value="h23"]').click();
  await sleep(800);
  await say(3, "HOY", "Formato de hora", "12 o 24 horas, o el automático de tu región.", 4500, page.getByRole("radiogroup", { name: "Formato de hora" }));
  await say(3, "HOY", "Novedades de Kardo", "Solo te escribimos novedades si lo permites. Los avisos de seguridad y de cobro llegan siempre.", 5000, page.getByRole("switch", { name: "Recibir novedades de Kardo por correo" }));
  await unmark();

  // 4. Seguridad.
  await part(4, "Seguridad", [
    "Cambiar la contraseña pide la actual",
    "Verificación en dos pasos con app de autenticación (y app de respaldo)",
    "Sesiones activas y el historial de 90 días",
  ]);
  await open("/settings/seguridad", "Sesiones activas");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();
  await say(4, "HOY", "Contraseña", "Para cambiarla pide la actual; al guardarla te avisamos por correo y se cierran tus otras sesiones.", 5500, dialog());
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Activar la verificación en dos pasos" }).click();
  await dialog().locator("input").first().fill("Google Authenticator");
  await dialog().getByRole("button", { name: "Continuar" }).click();
  const secretField = dialog().locator("#two-factor-secret");
  await secretField.waitFor();
  const secret = await secretField.inputValue();
  await say(4, "HOY", "Escanea el código", "Con Google Authenticator, 1Password o Authy. La clave vive en Supabase, no en nuestro servidor.", 6000, dialog());
  const activationCode = totp(secret);
  await dialog().locator("#two-factor-code").pressSequentially(activationCode, { delay: 80 });
  await dialog().getByRole("button", { name: "Activar" }).click();
  await sleep(2000);
  await say(4, "HOY", "Activa", "Desde ahora cada inicio de sesión pide el código. Recomendamos agregar una app de respaldo por si pierdes el celular.", 6000, page.getByText("Verificación en dos pasos").first());
  await page.keyboard.press("Escape");
  await say(4, "HOY", "Sesiones activas", "Dónde tienes Kardo abierto. Cierras una sola o todas las demás.", 5500, page.locator("#security-sessions"));
  await say(4, "HOY", "Historial de inicios de sesión", "Los últimos 90 días, con dispositivo y lugar aproximado. Después se borran solos.", 5500, page.locator("#security-history"));
  await unmark();

  // 5. Signing in with the second factor.
  await part(5, "Entrar con el código de la app", [
    "Después de la contraseña, Kardo pide el código",
    "Sin el código, el API no entrega ningún dato",
    "Lo mismo al entrar con código por correo",
  ]);
  await page.goto(`${PANEL}/settings/seguridad`);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.locator("#email").waitFor();
  await page.locator("#email").pressSequentially(pilates.email, { delay: 18 });
  await page.locator("#password").fill(pilates.password);
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await page.getByRole("heading", { name: "Verificación en dos pasos." }).waitFor();
  await sleep(600);
  await say(5, "HOY", "El segundo paso", "La contraseña sola ya no basta. Mientras no escribas el código, el panel no carga nada de tu cuenta.", 6000, page.locator("#second-factor-code"));
  // A code is used once: wait for a new 30-second window if needed.
  while (totp(secret) === activationCode) await sleep(1000);
  await page.locator("#second-factor-code").pressSequentially(totp(secret), { delay: 90 });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("link", { name: "Configuración" }).first().waitFor();
  await sleep(1200);
  await say(5, "HOY", "Adentro", "Probado de punta a punta: con contraseña y con código por correo («¿La olvidaste?»), siempre pide también el de la app.", 6000);

  // 6. Equipo y Ayuda.
  await part(6, "Equipo y Ayuda", [
    "Personas e invitaciones en una sola lista",
    "Roles explicados en frases; el rol de lectura se llama Viewer",
    "Guía de ayuda por sección",
  ]);
  await open("/organization", "Equipo");
  await say(6, "HOY", "Equipo", "Quién está, con qué rol, y las invitaciones pendientes. Cambiar un rol o quitar a alguien se hace en su diálogo.", 6500, page.locator("main"));
  await page.getByRole("button", { name: /^Invitar/ }).first().click();
  await say(6, "HOY", "Invitar", "Correo y rol, con lo que puede hacer cada rol explicado en una frase.", 5500, dialog());
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "¿Cómo funciona?" }).first().click();
  await sleep(900);
  await say(6, "HOY", "Ayuda", "Cada sección tiene su guía: para qué sirve, pasos y preguntas. «Pregúntale a Kardo» responde con lo que sabe del panel.", 6500, page.locator(".help-drawer-panel"));
  await page.keyboard.press("Escape");
  await unmark();

  // 7. Plan y facturación.
  await part(7, "Plan: consumo, bajada de plan y «Fuera del plan»", [
    "Barras de consumo: lo usado y el número",
    "Si bajas a un plan más chico, tienes 14 días para elegir qué sigue activo",
    "Lo que queda fuera lleva el sello «Fuera del plan»",
  ]);
  await open("/settings/plan", "Consumo y límites");
  await say(7, "HOY", "Sin límite", "Con «Beta sin límites» no hay total contra el cual medir: la barra queda rayada y dice cuánto usas.", 6000, page.locator(".billing-meters"));
  const opened = await setPlan("esencial");
  log(`Plan Esencial: ${JSON.stringify(opened)}`);
  await open("/settings/plan", "Consumo y límites");
  await say(7, "SIMULADO", "Ahora el plan es Esencial", "Le pusimos a la organización el plan Esencial (15 Touchpoints), pero tiene 17 QR. Arriba aparece el aviso con el plazo de 14 días.", 7000, page.locator(".access-strip").first());
  await say(7, "HOY", "Barras de consumo", "Lo usado y el número: 17 de 15, en rojo porque se pasa del plan.", 5500, page.locator(".billing-meters"));
  await page.getByRole("button", { name: "Elegir cuáles siguen activos" }).click();
  await dialog().getByText("Elegir qué sigue activo").first().waitFor();
  await say(7, "HOY", "Qué sigue activo", "Marcas lo que debe seguir activo, dentro de lo que incluye el plan. Nada se borra y vuelve al instante si subes de plan.", 7000, dialog());
  for (const name of ["Clase muestra", "Barra de bebidas"]) {
    const box = dialog().locator("label.plan-selection-item", { hasText: name }).locator("input");
    if (await box.isChecked()) await box.click();
    await sleep(500);
  }
  const allBoxes = dialog().locator("label.plan-selection-item input");
  for (let index = 0; index < (await allBoxes.count()); index += 1) {
    const label = await dialog().locator("label.plan-selection-item").nth(index).innerText();
    const box = allBoxes.nth(index);
    const keep = !/Clase muestra|Barra de bebidas/.test(label);
    if ((await box.isChecked()) !== keep) await box.click();
  }
  await say(7, "HOY", "15 de 15", "Dejamos fuera «Clase muestra» y «Barra de bebidas».", 4500, dialog().locator("legend").first());
  await dialog().getByRole("button", { name: "Guardar" }).click();
  await sleep(2500);
  await page.locator(".billing-meters").getByText("15 de 15").waitFor();
  await say(7, "HOY", "Elegido: 15 de 15", "Lo que quedó fuera ya no cuenta para el límite, el aviso de arriba se va y su página muestra «no está disponible por ahora».", 6500, page.locator(".billing-meters"));
  await open("/touchpoints", "Reformer 1");
  await say(7, "HOY", "Sello «Fuera del plan»", "En la lista de Touchpoints se ve qué quedó fuera del plan.", 6000, page.getByText("Fuera del plan").first());
  await page.getByText("Clase muestra").first().click();
  await page.getByText("Quedó fuera de lo que incluye tu plan").waitFor();
  await say(7, "HOY", "En el detalle", "Explica qué pasa y dónde volver a activarlo: Plan y facturación, o subir de plan.", 6500, page.getByText("Quedó fuera de lo que incluye tu plan"));
  await unmark();

  // 8. Tus datos.
  await part(8, "Tus datos", [
    "Descargar tus datos en un archivo",
    "Borrar tu cuenta: te dice qué se borra y qué resolver antes",
    "Pide tu contraseña (o el código de la app) y escribir BORRAR MI CUENTA",
  ]);
  await open("/settings/datos", "Exportar mis datos");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar" }).click();
  const file = await download;
  await say(8, "HOY", "Exportar mis datos", `Se descargó «${file.suggestedFilename()}»: perfil, preferencias, organizaciones, sesiones e historial.`, 6000, page.locator("#data-export"));
  await page.getByRole("button", { name: "Borrar mi cuenta" }).click();
  await dialog().getByText(/único Owner/).waitFor();
  await say(8, "HOY", "Antes hay que resolver algo", "Paula es la única Owner de un equipo con más personas: primero transfiere la propiedad. Así nadie deja huérfana a una organización.", 7500, dialog());
  await page.keyboard.press("Escape");

  // Gema: only her personal space, so she can delete her account.
  const gemaSession = await offCameraSession(browser, PANEL, gema);
  await enter(gemaSession, gemaOrg.id);
  await open("/settings/datos", "Exportar mis datos");
  await say(8, "HOY", "Otra cuenta: Gema", "Gema tiene su espacio personal y su florería, donde es la única persona. Ella sí puede borrar su cuenta.", 5000);
  await page.getByRole("button", { name: "Borrar mi cuenta" }).click();
  await dialog().locator("#delete-account-password").waitFor();
  await say(8, "HOY", "Qué se borra contigo", "La lista dice qué se va. Conservamos solo lo que la ley pide, como constancias de cobro y facturas.", 6500, dialog());
  await dialog().locator("#delete-account-password").pressSequentially(gema.password, { delay: 12 });
  await dialog().locator("#delete-account-phrase").pressSequentially("BORRAR MI CUENTA", { delay: 45 });
  await say(8, "HOY", "Confirmar", "Su contraseña (o el código de la app) y la frase exacta.", 4500, dialog());
  await dialog().getByRole("button", { name: "Borrar mi cuenta" }).click();
  await page.getByText("Borramos tu cuenta y tus datos.").waitFor();
  await say(8, "HOY", "Cuenta borrada", "Se cierra la sesión y la pantalla de entrada lo confirma.", 5500, page.getByText("Borramos tu cuenta y tus datos."));
  cleanup.push("gema borrada");

  await slide(
    `<h2>Lo que falta (lo haces tú)</h2>
     <ul>
       <li><span class="tag pen">PENDIENTE</span>Supabase: pegar la plantilla de cambio de correo y encender los 4 avisos de seguridad</li>
       <li><span class="tag pen">PENDIENTE</span>Supabase: encender «Require current password»</li>
       <li><span class="tag pen">PENDIENTE</span>Desplegar Customer API, panel y Resolver (relevo 30 §5)</li>
       <li><span class="tag pen">PENDIENTE</span>Revisión del abogado de los textos legales 1.1</li>
     </ul>`,
    8000,
  );
} catch (error) {
  await page
    .screenshot({ path: "scripts/video/.out/settings-tour-fail.png" })
    .catch(() => undefined);
  throw error;
} finally {
  await sql`delete from kardo_billing.notices where workspace_id = ${org.id}::uuid and kind like 'plan_overage%'`.catch(() => undefined);
  await context.close();
  await browser.close();
  await sql.end();
}
finishVideo(dir, "settings-tour");
log(`Organización «${BUSINESS}» (${org.id}) queda en kardo-dev. ${cleanup.join(", ")}`);
