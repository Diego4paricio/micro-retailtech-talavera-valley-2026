// Simulated users for the interface study (Docs/engineering/31-relevo-usuarios-simulados.md).
// Each persona drives its own Chrome through navegador.mjs on its own port.
// Accounts are created by the persona itself through the real sign-up, with
// Resend's test inbox (delivered+…@resend.dev): nothing reaches anyone.

export const PANEL_URL = process.env.SIM_PANEL_URL ?? "http://localhost:5196";
export const API_URL = process.env.SIM_API_URL ?? "http://localhost:3031";
export const SITE_URL = process.env.SIM_SITE_URL ?? "http://localhost:5197";

const phone = {
  device: "celular",
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1.5,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
};
const laptop = {
  device: "computadora",
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

export const personas = {
  lupe: {
    port: 8911,
    name: "Guadalupe Hernández",
    short: "Doña Lupe",
    business: "Fonda Doña Lupe",
    ...phone,
  },
  beto: {
    port: 8912,
    name: "Alberto Ramírez",
    short: "Don Beto",
    business: "Tacos Don Beto",
    ...phone,
  },
  mariana: {
    port: 8913,
    name: "Mariana López",
    short: "Mariana",
    business: "Mariana Nails",
    ...phone,
  },
  paco: {
    port: 8914,
    name: "Francisco Torres",
    short: "Paco",
    business: "Café La Esquina",
    ...laptop,
  },
  laura: {
    port: 8915,
    name: "Laura Ríos",
    short: "Laura",
    business: "Despacho Contable Ríos",
    ...laptop,
  },
  verifcel: {
    port: 8917,
    name: "Verificación Celular",
    short: "Verificación (celular)",
    business: "Fonda Verificación",
    ...phone,
  },
  verifpc: {
    port: 8918,
    name: "Verificación Laptop",
    short: "Verificación (laptop)",
    business: "Uñas Verificación",
    ...laptop,
  },
  nuevocel: {
    port: 8920,
    name: "Nueva Celular",
    short: "Nueva (celular)",
    business: "Taquería Nueva",
    ...phone,
  },
  nuevopc: {
    port: 8921,
    name: "Nueva Laptop",
    short: "Nueva (laptop)",
    business: "Café Nuevo",
    ...laptop,
  },
  prueba: {
    port: 8919,
    name: "Prueba Coordinador",
    short: "Piloto",
    business: "Piloto Sim",
    ...phone,
  },
  diego: {
    port: 8916,
    name: "Diego Mendoza",
    short: "Diego",
    business: "Nodo Digital",
    ...laptop,
  },

  // Round 2 (Docs/engineering/35-relevo-usuarios-simulados-ronda-2.md):
  // 20 personas on 8930–8949, the pilot on 8950.
  rosa: { port: 8930, name: "Rosa Martínez", short: "Doña Rosa", business: "Cocina Económica Doña Rosa", ...phone },
  javier: { port: 8931, name: "Javier Gómez", short: "Javier", business: "Panadería San Javier", ...phone },
  fernanda: { port: 8932, name: "Fernanda Ruiz", short: "Fernanda", business: "Florería Azahar", ...laptop },
  ernesto: { port: 8933, name: "Ernesto Garza", short: "Lic. Ernesto", business: "Garza y Asociados", ...laptop },
  paola: { port: 8934, name: "Paola Canto", short: "Dra. Paola", business: "Consultorio Dental Sonrisa Maya", ...phone },
  carmen: { port: 8935, name: "Carmen Navarro", short: "Carmen", business: "Carmen Nails & Lashes", ...phone },
  tono: { port: 8936, name: "Antonio Pérez", short: "Toño", business: "Barbería El Toño", ...phone },
  ivan: { port: 8937, name: "Iván Santiago", short: "Iván", business: "Mezcalería La Tuna", ...laptop },
  sofia: { port: 8938, name: "Sofía Herrera", short: "Sofía", business: "Boutique Sofía", ...phone },
  ricardo: { port: 8939, name: "Ricardo Lozano", short: "Ricardo", business: "Lozano Bienes Raíces", ...laptop },
  marisol: { port: 8940, name: "Marisol Vega", short: "Marisol", business: "Casa Jacarandas Hotel", ...laptop },
  luis: { port: 8941, name: "Luis Aguilar", short: "Profe Luis", business: "Academia de Inglés Bright", ...laptop },
  ana: { port: 8942, name: "Ana Castillo", short: "Ana", business: "Salón de Fiestas Los Arcos", ...phone },
  diego2: { port: 8943, name: "Diego Salazar", short: "Diego", business: "Agencia Brinco", ...laptop },
  mateo: { port: 8944, name: "Mateo Rivas", short: "Mateo", business: "Mateo Rivas Fotografía", ...phone },
  chema: { port: 8945, name: "José María Flores", short: "Don Chema", business: "Tacos Don Chema", ...phone },
  lucia: { port: 8946, name: "Lucía Ortega", short: "Lucía", business: "Café Grano Fino", ...laptop },
  karla: { port: 8947, name: "Karla Medina", short: "Karla", business: "Prana Yoga Estudio", ...phone },
  raul: { port: 8948, name: "Raúl Quintero", short: "Ing. Raúl", business: "Taller Mecánico Quintero", ...phone },
  paty: { port: 8949, name: "Patricia Leal", short: "Paty", business: "Food Truck La Güera Paty", ...phone },
  piloto2: { port: 8950, name: "Piloto Ronda Dos", short: "Piloto 2", business: "Papelería El Piloto", ...phone },

  // Round 3, after the fixes of relevo 37 (§8): the same people with new
  // accounts, only the tasks that touch what was fixed. Ports 8951–8956.
  lucia3: { port: 8951, name: "Lucía Ortega", short: "Lucía", business: "Café Grano Fino", ...laptop },
  ernesto3: { port: 8952, name: "Ernesto Garza", short: "Lic. Ernesto", business: "Garza y Asociados", ...laptop },
  javier3: { port: 8953, name: "Javier Gómez", short: "Javier", business: "Panadería San Javier", ...phone },
  paola3: { port: 8954, name: "Paola Canto", short: "Dra. Paola", business: "Consultorio Dental Sonrisa Maya", ...phone },
  raul3: { port: 8955, name: "Raúl Quintero", short: "Ing. Raúl", business: "Taller Mecánico Quintero", ...phone },
  rosa3: { port: 8956, name: "Rosa Martínez", short: "Doña Rosa", business: "Cocina Económica Doña Rosa", ...phone },
  // Second pass of round 3, after its own fixes (guisados saved, hours,
  // QR names, the AI notice, the product name on its card).
  rosa4: { port: 8957, name: "Rosa Martínez", short: "Doña Rosa", business: "Cocina Económica Doña Rosa", ...phone },
  paola4: { port: 8958, name: "Paola Canto", short: "Dra. Paola", business: "Consultorio Dental Sonrisa Maya", ...phone },
  javier4: { port: 8959, name: "Javier Gómez", short: "Javier", business: "Panadería San Javier", ...phone },
  // Third pass, short: the guisados inside their dish in Disponibilidad and
  // the photo field that names its product.
  rosa5: { port: 8960, name: "Rosa Martínez", short: "Doña Rosa", business: "Cocina Económica Doña Rosa", ...phone },
  javier5: { port: 8961, name: "Javier Gómez", short: "Javier", business: "Panadería San Javier", ...phone },

  // Round 4 (Docs/engineering/39-relevo-usuarios-simulados-ronda-4.md): the
  // same 20 people of round 2 start over with new accounts, after the fixes
  // of relevo 37 and kardo-a2's billing per person. Ports 8962–8981, in the
  // order of the rounds; the day-to-day session reuses the persona's port.
  "rosa-r4": { port: 8962, name: "Rosa Martínez", short: "Doña Rosa", business: "Cocina Económica Doña Rosa", ...phone },
  "fernanda-r4": { port: 8963, name: "Fernanda Ruiz", short: "Fernanda", business: "Florería Azahar", ...laptop },
  "lucia-r4": { port: 8964, name: "Lucía Ortega", short: "Lucía", business: "Café Grano Fino", ...laptop },
  "carmen-r4": { port: 8965, name: "Carmen Navarro", short: "Carmen", business: "Carmen Nails & Lashes", ...phone },
  "tono-r4": { port: 8966, name: "Antonio Pérez", short: "Toño", business: "Barbería El Toño", ...phone },
  "javier-r4": { port: 8967, name: "Javier Gómez", short: "Javier", business: "Panadería San Javier", ...phone },
  "paola-r4": { port: 8968, name: "Paola Canto", short: "Dra. Paola", business: "Consultorio Dental Sonrisa Maya", ...phone },
  "ivan-r4": { port: 8969, name: "Iván Santiago", short: "Iván", business: "Mezcalería La Tuna", ...laptop },
  "luis-r4": { port: 8970, name: "Luis Aguilar", short: "Profe Luis", business: "Academia de Inglés Bright", ...laptop },
  "karla-r4": { port: 8971, name: "Karla Medina", short: "Karla", business: "Prana Yoga Estudio", ...phone },
  "sofia-r4": { port: 8972, name: "Sofía Herrera", short: "Sofía", business: "Boutique Sofía", ...phone },
  "ricardo-r4": { port: 8973, name: "Ricardo Lozano", short: "Ricardo", business: "Lozano Bienes Raíces", ...laptop },
  "marisol-r4": { port: 8974, name: "Marisol Vega", short: "Marisol", business: "Casa Jacarandas Hotel", ...laptop },
  "raul-r4": { port: 8975, name: "Raúl Quintero", short: "Ing. Raúl", business: "Taller Mecánico Quintero", ...phone },
  "paty-r4": { port: 8976, name: "Patricia Leal", short: "Paty", business: "Food Truck La Güera Paty", ...phone },
  "ana-r4": { port: 8977, name: "Ana Castillo", short: "Ana", business: "Salón de Fiestas Los Arcos", ...phone },
  "diego2-r4": { port: 8978, name: "Diego Salazar", short: "Diego", business: "Agencia Brinco", ...laptop },
  "mateo-r4": { port: 8979, name: "Mateo Rivas", short: "Mateo", business: "Mateo Rivas Fotografía", ...phone },
  "ernesto-r4": { port: 8980, name: "Ernesto Garza", short: "Lic. Ernesto", business: "Garza y Asociados", ...laptop },
  "chema-r4": { port: 8981, name: "José María Flores", short: "Don Chema", business: "Tacos Don Chema", ...phone },
};

/** Persona key → account email (one per study day, set at sign-up). */
export function emailFor(key, stamp) {
  return `delivered+kardo-sim-${key}-${stamp}@resend.dev`;
}

export function persona(key) {
  const found = personas[key];
  if (!found) {
    console.error(
      `No conozco a «${key}». Personas: ${Object.keys(personas).join(", ")}`,
    );
    process.exit(2);
  }
  return { key, ...found };
}
