#!/usr/bin/env node
// Kardo: margen del 50 % por plan, costo de Stripe y tablas de precios.
// Node puro, sin dependencias. Uso:
//   node scripts/pricing/margen-50.mjs                    (fx 18.5 y 20, 25 y 50 clientes)
//   node scripts/pricing/margen-50.mjs --fx=20            (solo ese tipo de cambio)
//   node scripts/pricing/margen-50.mjs --clientes=25      (solo ese numero de clientes)
// Documento que usa esta salida: Docs/engineering/research/2026-10-01-stripe-y-precios-50.md
// Todo monto en pesos MXN salvo donde dice USD. Fecha de los supuestos: 2026-10-01.

// ------------------------------------------------------------------
// SUPUESTOS (cada uno con su fuente; "no verificado" si no hay fuente fechada)
// ------------------------------------------------------------------
const IVA = 0.16; // IVA en Mexico

// Stripe Mexico, https://stripe.com/mx/pricing (consultada 2026-10-01). Todas las tarifas excluyen IVA.
const STRIPE_PCT = 0.036; // tarjeta nacional: 3.6 % + $3.00
const STRIPE_FIJO = 3.0;
const STRIPE_BILLING = 0.007; // Billing: 0.7 % del volumen de Billing (pagina de precios; sin tope ni plan alterno publicado)
// Transferencia bancaria (SPEI via customer_balance): MXN 7.00 + IVA por transaccion,
// https://stripe.com/mx/pricing/local-payment-methods (2026-10-01)
const SPEI_FIJO = 7.0;
const OXXO_PCT = 0.04; // OXXO: 4 % + $3.00 (misma pagina). No sirve con Billing (docs.stripe.com/payments/oxxo, 2026-09-29)
const OXXO_FIJO = 3.0;
const DISPUTA = 150; // por disputa recibida, mas IVA (stripe.com/mx/pricing)

// Costos fijos de infraestructura con cobro activo, USD al mes (Docs/engineering/research/2026-10-01-costo-real-y-margen-por-plan.md
// y supabase.com/pricing, resend.com/pricing, developers.cloudflare.com, consultados 2026-09-29 y 2026-10-01)
const FIJOS_USD = { 'Supabase Pro': 25, 'Cloudflare Workers Paid': 5, 'Resend Pro': 20, Dominio: 1, 'Provision (logs, builds, picos)': 10 };
const FIJOS_USD_TOTAL = Object.values(FIJOS_USD).reduce((a, b) => a + b, 0); // 61
const PITR_USD = 100; // Supabase PITR 7 dias; la Pro ya trae respaldos diarios de 7 dias (supabase.com/pricing, 2026-10-01)
const FACTURAPI_MXN_IVA_INCL = 299; // Facturapi para Stripe, $299 al mes IVA incluido (facturapi.io/pricing, 2026-10-01)
const TIMBRE_MXN_IVA_INCL = 0.6; // por timbre, IVA incluido (misma pagina)
const FACTURAPI_SIN_IVA = FACTURAPI_MXN_IVA_INCL / (1 + IVA);
const TIMBRE_SIN_IVA = TIMBRE_MXN_IVA_INCL / (1 + IVA);

// Infraestructura variable al tope del plan (USD al mes). Precios unitarios:
// R2 US$0.015/GB-mes, visitas US$4.39 por millon fuera de cuota, correo US$0.0004 (Resend Pro).
// Los volumenes de visitas y correos son SUPUESTOS elegidos para reproducir los $6 / $19 / $56 MXN a 18.5
// del documento del 1-oct (no son mediciones).
const R2_USD_GB = 0.015;
const VISITAS_USD_MILLON = 4.39;
const CORREO_USD = 0.0004;
const PLANES = {
  esencial: { nombre: 'Esencial', gb: 2, visitas: 25_000, correos: 500, ia_gens: 8 },
  profesional: { nombre: 'Profesional', gb: 10, visitas: 100_000, correos: 1_000, ia_gens: 18 },
  negocio: { nombre: 'Negocio', gb: 50, visitas: 250_000, correos: 3_000, ia_gens: 50 },
  corporativo: { nombre: 'Corporativo', gb: 100, visitas: 500_000, correos: 6_000, ia_gens: 100 },
};
const TIPICO_INFRA = 0.4; // un cliente tipico gasta menos de la mitad del tope (documento del 1-oct): se usa 40 %

// IA (Claude Sonnet 5, US$2 / US$10 por millon de tokens). Costo por generacion del documento del 1-oct:
// peor caso US$0.53, tipica US$0.15. NO MEDIDO en produccion (el puente de desarrollo cuesta 0).
const IA_PEOR_GEN = 0.53;
const IA_TIPICA_GEN = 0.15;
const IA_USO_TIPICO = 0.5; // uso tipico = la mitad del tope de generaciones
const IA_TOPE_USD_RECOMENDADO = { esencial: 1.25, profesional: 2.75, negocio: 7.5, corporativo: 15 };

// Mezcla de clientes para vistas combinadas (documento del 1-oct)
const MEZCLA = { esencial: 0.6, profesional: 0.3, negocio: 0.1 };
const CUPON = { pct: 0.2, meses: 3 }; // catalogo: 20 % por 3 meses, solo mensual
const ANUAL_MESES = 10; // "2 meses gratis"

// ------------------------------------------------------------------
// TABLAS DE PRECIOS (IVA incluido). Anual = 10 x mensual. ia_usd = tope de IA en dolares por organizacion.
// Los limites del catalogo solo cambian donde dice CAMBIO (aqui: tope de IA en Esencial / Profesional).
// ------------------------------------------------------------------
const TABLAS = [
  {
    id: 'Vigente',
    nota: 'Catalogo aprobado, con el tope de IA en dolares recomendado el 1-oct',
    precios: { esencial: 199, profesional: 449, negocio: 1199 },
    ia_usd: { esencial: 1.25, profesional: 2.75, negocio: 7.5 },
  },
  {
    id: 'A',
    nota: 'Baja lo alto: Esencial igual, Profesional -11 %, Negocio -25 %. CAMBIO: Esencial sin IA (hoy oculta), Profesional con tope de IA US$2',
    precios: { esencial: 199, profesional: 399, negocio: 899 },
    ia_usd: { esencial: 0, profesional: 2.0, negocio: 7.5 },
  },
  {
    id: 'P',
    nota: 'Para el reparto proporcional, sin tocar limites ni IA: baja Esencial y Profesional, Negocio casi igual',
    precios: { esencial: 179, profesional: 399, negocio: 1099 },
    ia_usd: { esencial: 1.25, profesional: 2.75, negocio: 7.5 },
  },
  {
    id: 'D',
    nota: 'Cumple con ambos metodos: igual que A pero Negocio con tope de IA de US$4. CAMBIO: Esencial sin IA, Profesional US$2, Negocio US$4',
    precios: { esencial: 199, profesional: 399, negocio: 899 },
    ia_usd: { esencial: 0, profesional: 2.0, negocio: 4.0 },
  },
  {
    id: 'Dueño',
    nota: 'Decision del 1-oct (noche), aplicada en el catalogo: Esencial igual, Profesional $379, Negocio $699, anual $2,190 / $3,790 / $6,990, con los topes de IA de D salvo Esencial, que el dueno dejo en US$1 (2 generaciones)',
    precios: { esencial: 199, profesional: 379, negocio: 699 },
    anual: { esencial: 2190, profesional: 3790, negocio: 6990 },
    ia_usd: { esencial: 1.0, profesional: 2.0, negocio: 4.0 },
  },
  {
    id: 'Dueño con IA vigente',
    nota: 'Los mismos precios con el tope de IA en dolares de hoy (Esencial US$1.25, Profesional US$2.75, Negocio US$7.50): lo que pasa si la IA se vende sin aplicar los topes de D',
    precios: { esencial: 199, profesional: 379, negocio: 699 },
    anual: { esencial: 2190, profesional: 3790, negocio: 6990 },
    ia_usd: { esencial: 1.25, profesional: 2.75, negocio: 7.5 },
  },
];

// Pasarelas (comision por cobro con tarjeta nacional, sin IVA; el IVA se suma). Fuente y estado en el documento.
const PASARELAS = [
  { n: 'Stripe + Billing (hoy)', pct: STRIPE_PCT + STRIPE_BILLING, fijo: STRIPE_FIJO, f: 'stripe.com/mx/pricing 2026-10-01' },
  { n: 'Stripe sin Billing (hipotetico)', pct: STRIPE_PCT, fijo: STRIPE_FIJO, f: 'stripe.com/mx/pricing 2026-10-01' },
  { n: 'Conekta', pct: 0.034, fijo: 3.0, f: 'conekta.com/pricing 2026-10-01' },
  { n: 'Mercado Pago suscripciones (dinero a 10 dias)', pct: 0.0289, fijo: 0, f: 'mercadopago.com.mx/herramientas-para-vender/suscripciones 2026-10-01' },
  { n: 'Mercado Pago suscripciones (dinero al instante)', pct: 0.0319, fijo: 0, f: 'misma pagina 2026-10-01' },
  { n: 'Clip pagos recurrentes', pct: 0.036, fijo: 0, f: 'clip.mx/term/tyc-pagos-recurrentes-clip 2026-10-01' },
  { n: 'PayPal comercial estandar', pct: 0.0395, fijo: 4.0, f: 'paypal.com/mx/business/paypal-business-fees 2026-10-01' },
  { n: 'Openpay (fuente secundaria, NO VERIFICADO en pagina oficial)', pct: 0.029, fijo: 2.5, f: 'documents.openpay.mx/en/comisiones via buscador 2026-10-01' },
];

// ------------------------------------------------------------------
// ARGUMENTOS
// ------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
  }),
);
const FXS = args.fx ? [Number(args.fx)] : [18.5, 20];
const NS = args.clientes ? [Number(args.clientes)] : [25, 50];
if (FXS.some((x) => !(x > 0)) || NS.some((x) => !(x > 0))) {
  console.error('Uso: node scripts/pricing/margen-50.mjs [--fx=20] [--clientes=25]');
  process.exit(1);
}
const METODOS = args.metodo === 'igual' ? ['igual'] : args.metodo === 'proporcional' ? ['prop'] : ['igual', 'prop'];
if (args.metodo && !['igual', 'proporcional'].includes(args.metodo)) {
  console.error('--metodo debe ser igual o proporcional');
  process.exit(1);
}
const ETQ = { igual: 'por partes iguales (prueba estricta)', prop: 'proporcionales al ingreso (vista contable)' };
let MT = 'igual'; // metodo de reparto de fijos activo
const ESCENARIOS = FXS.flatMap((fx) => NS.map((n) => ({ fx, n })));

// ------------------------------------------------------------------
// FORMATO
// ------------------------------------------------------------------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m0 = (x) => `$${nf0.format(Math.round(x))}`;
const m2 = (x) => `$${nf2.format(x)}`;
const pc = (x) => `${(x * 100).toFixed(1)} %`;
const ok = (x, meta = 0.5) => `${pc(x)} ${x >= meta - 1e-9 ? 'si' : 'NO'}`;
const usd = (x) => `US$${nf2.format(x)}`;
const tabla = (cab, filas) => {
  console.log(`| ${cab.join(' | ')} |`);
  console.log(`|${cab.map((_, i) => (i === 0 ? '---' : '---:')).join('|')}|`);
  for (const f of filas) console.log(`| ${f.join(' | ')} |`);
  console.log('');
};
const h = (t) => console.log(`\n## ${t}\n`);
const h3 = (t) => console.log(`\n### ${t}\n`);
const escLabel = (e) => `fx ${e.fx} / ${e.n} clientes`;

// ------------------------------------------------------------------
// MODELO
// ------------------------------------------------------------------
const infraTopeUsd = (k) => {
  const p = PLANES[k];
  return p.gb * R2_USD_GB + (p.visitas / 1e6) * VISITAS_USD_MILLON + p.correos * CORREO_USD;
};

// Costo de Stripe de un cobro de G pesos (IVA incluido), en pesos.
// credito=true: el IVA de la comision se acredita (no es costo). billing=false: sin el 0.7 %.
const stripeCobro = (G, { credito = false, billing = true, metodo = 'tarjeta', intl = 0 } = {}) => {
  let base;
  if (metodo === 'spei') base = SPEI_FIJO + (billing ? STRIPE_BILLING * G : 0);
  else if (metodo === 'oxxo') base = OXXO_PCT * G + OXXO_FIJO;
  else base = (STRIPE_PCT + intl) * G + STRIPE_FIJO + (billing ? STRIPE_BILLING * G : 0);
  return credito ? base : base * (1 + IVA);
};

// Costos fijos por mes (MXN)
const fijosMxn = (fx, { facturapi = true, pitr = false } = {}) =>
  FIJOS_USD_TOTAL * fx + (pitr ? PITR_USD * fx : 0) + (facturapi ? FACTURAPI_SIN_IVA : 0);

// Precio anual de un plan: el de la tabla si lo trae, si no 10 mensualidades.
const anualDe = (tabla_, k) => tabla_.anual?.[k] ?? tabla_.precios[k] * ANUAL_MESES;

// Margen de un plan en un escenario. Todo por mes (el anual se divide entre 12).
// ia: 'usd' (tope en dolares), 'gens' (tope en generaciones) o 'cero'.
function margen(tabla_, k, cad, { fx, n }, o = {}) {
  const { peor = true, credito = false, ia = 'usd', facturapi = true, pitr = false, billing = true, cupon = false, metodo = 'tarjeta', intl = 0 } = o;
  const P = tabla_.precios[k];
  const meses = cad === 'anual' ? 12 : 1;
  const A = anualDe(tabla_, k);
  const cargoBruto = cad === 'anual' ? A : P * (cupon ? 1 - CUPON.pct : 1);
  const ingreso = cargoBruto / (1 + IVA) / meses;
  const stripe = stripeCobro(cargoBruto, { credito, billing, metodo, intl }) / meses;
  const infra = infraTopeUsd(k) * (peor ? 1 : TIPICO_INFRA) * fx;
  let iaUsd;
  if (ia === 'cero') iaUsd = 0;
  else if (ia === 'gens') iaUsd = peor ? PLANES[k].ia_gens * IA_PEOR_GEN : Math.min(PLANES[k].ia_gens * IA_USO_TIPICO * IA_TIPICA_GEN, PLANES[k].ia_gens * IA_PEOR_GEN);
  else {
    const tope = tabla_.ia_usd[k];
    iaUsd = peor ? tope : Math.min(tope, PLANES[k].ia_gens * IA_USO_TIPICO * IA_TIPICA_GEN);
  }
  const iaMxn = iaUsd * fx;
  const timbre = TIMBRE_SIN_IVA / meses;
  // igual: cada cliente carga fijos/N. prop: la parte del plan = fijos x ingreso del plan / ingreso de la mezcla 60/30/10 con N clientes
  const ingresoLista = (cad === 'anual' ? A / 12 : P) / (1 + IVA);
  const netoMezcla = Object.entries(MEZCLA).reduce((a, [j, w]) => a + (w * tabla_.precios[j]) / (1 + IVA), 0);
  const fijo = (fijosMxn(fx, { facturapi, pitr }) / n) * ((o.fijos ?? MT) === 'prop' ? ingresoLista / netoMezcla : 1);
  const costo = stripe + infra + iaMxn + timbre + fijo;
  return { P, ingreso, stripe, infra, ia: iaMxn, timbre, fijo, costo, queda: ingreso - costo, m: (ingreso - costo) / ingreso };
}

// Precio mensual de lista minimo (entero) para llegar a 50 % en el escenario (anual = 10 x mensual)
function precioMinimo(k, cad, esc, iaUsd, o = {}) {
  for (let P = 50; P <= 5000; P++) {
    const t = { precios: { ...TABLAS[0].precios, [k]: P }, ia_usd: { [k]: iaUsd } }; // otros planes a precio vigente
    if (margen(t, k, cad, esc, o).m >= 0.5) return P;
  }
  return null;
}

// ------------------------------------------------------------------
// SALIDA
// ------------------------------------------------------------------
console.log('# Salida de scripts/pricing/margen-50.mjs');
console.log(`\nParametros: tipo de cambio ${FXS.join(' y ')} MXN/USD; clientes ${NS.join(' y ')}. Supuestos al 2026-10-01.`);

h('1. Definicion y supuestos');
console.log('margen = (ingreso sin IVA - Stripe - infraestructura al tope - presupuesto de IA - timbre CFDI - fijos prorrateados) / ingreso sin IVA');
console.log('Ingreso sin IVA = precio / 1.16. Fijos prorrateados por igual entre N clientes. Prueba dura: peor caso, IVA de la comision de Stripe NO acreditado, precio mensual de lista.\n');
tabla(
  ['Dato', 'Valor'],
  [
    ['Stripe tarjeta nacional', `${(STRIPE_PCT * 100).toFixed(1)} % + ${m2(STRIPE_FIJO)} (+ IVA)`],
    ['Stripe Billing', `${(STRIPE_BILLING * 100).toFixed(1)} % (+ IVA)`],
    ['Stripe SPEI', `${m2(SPEI_FIJO)} por transaccion (+ IVA)`],
    ['Stripe OXXO', `${(OXXO_PCT * 100).toFixed(0)} % + ${m2(OXXO_FIJO)} (no sirve con Billing)`],
    ['Disputa', `${m2(DISPUTA)} + IVA = ${m2(DISPUTA * 1.16)}`],
    ['Fijos de infraestructura', `${usd(FIJOS_USD_TOTAL)} al mes (${Object.entries(FIJOS_USD).map(([a, b]) => `${a} ${b}`).join(', ')})`],
    ['Facturapi para Stripe', `${m2(FACTURAPI_MXN_IVA_INCL)} al mes IVA incl. = ${m2(FACTURAPI_SIN_IVA)} sin IVA; timbre ${m2(TIMBRE_MXN_IVA_INCL)} IVA incl.`],
    ['PITR Supabase (opcional)', `${usd(PITR_USD)} al mes`],
    ['IA por generacion', `peor ${usd(IA_PEOR_GEN)}, tipica ${usd(IA_TIPICA_GEN)}; uso tipico = ${Math.round(IA_USO_TIPICO * 100)} % del tope de generaciones`],
    ['Infra tipica', `${Math.round(TIPICO_INFRA * 100)} % del tope`],
    ['Mezcla para vistas combinadas', `${Object.entries(MEZCLA).map(([a, b]) => `${PLANES[a].nombre} ${Math.round(b * 100)} %`).join(', ')}`],
    ['Cupon de conversion', `${Math.round(CUPON.pct * 100)} % por ${CUPON.meses} cargos mensuales`],
    ['Anual', `${ANUAL_MESES} meses pagados`],
  ],
);

h('2. Costos fijos y variables al tope');
tabla(
  ['Concepto', ...FXS.map((f) => `MXN/mes a ${f}`)],
  [
    ['Infraestructura fija (USD 61)', ...FXS.map((f) => m0(FIJOS_USD_TOTAL * f))],
    ['Facturapi sin IVA', ...FXS.map(() => m0(FACTURAPI_SIN_IVA))],
    ['Fijos del margen (infra + Facturapi)', ...FXS.map((f) => m0(fijosMxn(f)))],
    ['PITR (solo sensibilidad)', ...FXS.map((f) => m0(PITR_USD * f))],
    ...NS.map((n) => [`Fijos por cliente a ${n} clientes`, ...FXS.map((f) => m0(fijosMxn(f) / n))]),
  ],
);
tabla(
  ['Plan', 'GB R2', 'Visitas', 'Correos', 'Infra al tope USD', ...FXS.map((f) => `MXN a ${f}`), 'Tope IA gens', 'Peor caso IA con tope en gens USD'],
  Object.keys(PLANES).map((k) => [
    PLANES[k].nombre,
    PLANES[k].gb,
    nf0.format(PLANES[k].visitas),
    nf0.format(PLANES[k].correos),
    usd(infraTopeUsd(k)),
    ...FXS.map((f) => m2(infraTopeUsd(k) * f)),
    PLANES[k].ia_gens,
    usd(PLANES[k].ia_gens * IA_PEOR_GEN),
  ]),
);
console.log('Tope de IA en dolares recomendado el 1-oct: ' + Object.entries(IA_TOPE_USD_RECOMENDADO).map(([k, v]) => `${PLANES[k].nombre} ${usd(v)}`).join(', ') + '.\n');

h('3. Costo de Stripe por cobro y por plan (precios vigentes)');
const vig = TABLAS[0];
tabla(
  ['Cobro', 'Cliente paga', 'Sin IVA', 'Comision tarjeta (3.6 % + 3)', 'Billing 0.7 %', 'Total + IVA (sin acreditar)', '% del precio con IVA', 'Total acreditando IVA', '% del precio sin IVA'],
  [
    ...['esencial', 'profesional', 'negocio'].flatMap((k) => {
      const P = vig.precios[k];
      return [
        ['mensual', P],
        ['anual', P * ANUAL_MESES],
      ].map(([cad, G]) => [
        `${PLANES[k].nombre} ${cad}`,
        m0(G),
        m2(G / 1.16),
        m2(STRIPE_PCT * G + STRIPE_FIJO),
        m2(STRIPE_BILLING * G),
        m2(stripeCobro(G)),
        pc(stripeCobro(G) / G),
        m2(stripeCobro(G, { credito: true })),
        pc(stripeCobro(G, { credito: true }) / (G / 1.16)),
      ]);
    }),
  ],
);

h('4. Margen por tabla de precios');
for (const t of TABLAS) {
  h3(`Tabla ${t.id}: ${m0(t.precios.esencial)} / ${m0(t.precios.profesional)} / ${m0(t.precios.negocio)} mensual; anual ${m0(anualDe(t, 'esencial'))} / ${m0(anualDe(t, 'profesional'))} / ${m0(anualDe(t, 'negocio'))}`);
  console.log(`${t.nota}. Tope de IA en dolares: ${['esencial', 'profesional', 'negocio'].map((k) => `${PLANES[k].nombre} ${usd(t.ia_usd[k])}`).join(', ')}.\n`);
  for (const mt of METODOS) {
  MT = mt;
  console.log(`**Fijos ${ETQ[mt]}**\n`);
  const filas = (opts, soloMensual = false) =>
    ['esencial', 'profesional', 'negocio'].flatMap((k) =>
      (soloMensual ? ['mensual'] : ['mensual', 'anual']).map((cad) => [
        `${PLANES[k].nombre} ${cad}`,
        ...ESCENARIOS.map((e) => ok(margen(t, k, cad, e, opts).m)),
      ]),
    );
  const cab = ['Plan', ...ESCENARIOS.map(escLabel)];
  console.log('Peor caso, IA con tope en dolares, IVA de Stripe NO acreditado (la prueba dura):\n');
  tabla(cab, filas({}));
  console.log('Peor caso, IA con tope en dolares, IVA de Stripe acreditado:\n');
  tabla(cab, filas({ credito: true }));
  console.log('Peor caso, IA con tope en generaciones del catalogo (8 / 18 / 50, a US$0.53 cada una), IVA no acreditado:\n');
  tabla(cab, filas({ ia: 'gens' }, true));
  console.log('Vista tipica (infra al 40 %, IA al 50 % del tope de generaciones a US$0.15, IVA no acreditado):\n');
  tabla(cab, filas({ peor: false }));
  const k25 = ESCENARIOS.reduce((a, b) => (b.fx > a.fx || (b.fx === a.fx && b.n < a.n) ? b : a));
  console.log(`Desglose mensual en ${escLabel(k25)}, peor caso, mensual (MXN):\n`);
  tabla(
    ['Plan', 'Precio', 'Ingreso sin IVA', 'Stripe', 'Infra', 'IA', 'Timbre', 'Fijos', 'Queda', 'Margen'],
    ['esencial', 'profesional', 'negocio'].map((k) => {
      const r = margen(t, k, 'mensual', k25);
      return [PLANES[k].nombre, m0(r.P), m2(r.ingreso), m2(r.stripe), m2(r.infra), m2(r.ia), m2(r.timbre), m2(r.fijo), m2(r.queda), pc(r.m)];
    }),
  );
  }
}
MT = 'igual';

h('4b. Clientes minimos para llegar a 50 % (peor caso, IVA no acreditado, con Facturapi)');
console.log('Menor numero de clientes entre los que se reparten los fijos para que el plan llegue a 50 % (el tipo de cambio mueve el resultado).\n');
const nMin = (t, k, cad, fx, o = {}) => {
  for (let n = 1; n <= 2000; n++) if (margen(t, k, cad, { fx, n }, o).m >= 0.5) return n;
  return '>2000';
};
for (const mt of METODOS) {
MT = mt;
console.log(`Fijos ${ETQ[mt]}:\n`);
tabla(
  ['Tabla / plan / cadencia', ...FXS.map((f) => `fx ${f}`), ...FXS.map((f) => `fx ${f}, anual por SPEI o mensual con IVA acreditado`)],
  TABLAS.flatMap((t) =>
    ['esencial', 'profesional', 'negocio'].flatMap((k) =>
      ['mensual', 'anual'].map((cad) => [
        `${t.id} ${PLANES[k].nombre} ${cad}`,
        ...FXS.map((f) => nMin(t, k, cad, f)),
        ...FXS.map((f) => nMin(t, k, cad, f, cad === 'anual' ? { metodo: 'spei' } : { credito: true })),
      ]),
    ),
  ),
);

}
MT = 'igual';

h('5. Punto de equilibrio, mezcla y cupon por tabla');
for (const fx of FXS) {
  console.log(`Tipo de cambio ${fx}. Equilibrio = fijos / aporte por cliente (mensual, tarjeta, IVA no acreditado, mezcla 60/30/10).\n`);
  tabla(
    ['Tabla', 'Aporte tipico por cliente', 'Equilibrio tipico (clientes)', 'Aporte peor caso por cliente', 'Equilibrio peor caso', 'Equilibrio tipico sin Facturapi', ...NS.map((n) => `Margen mezcla tipico a ${n}`)],
    TABLAS.map((t) => {
      const aporte = (peor) =>
        Object.entries(MEZCLA).reduce((s, [k, w]) => {
          const r = margen(t, k, 'mensual', { fx, n: 1 }, { peor, facturapi: false });
          return s + w * (r.ingreso - r.stripe - r.infra - r.ia - r.timbre);
        }, 0);
      const mezclaMargen = (n) => {
        let ing = 0;
        let q = 0;
        for (const [k, w] of Object.entries(MEZCLA)) {
          const r = margen(t, k, 'mensual', { fx, n }, { peor: false });
          ing += w * r.ingreso;
          q += w * r.queda;
        }
        return q / ing;
      };
      const fAll = fijosMxn(fx);
      const fSin = fijosMxn(fx, { facturapi: false });
      return [
        t.id,
        m0(aporte(false)),
        (fAll / aporte(false)).toFixed(1),
        m0(aporte(true)),
        (fAll / aporte(true)).toFixed(1),
        (fSin / aporte(false)).toFixed(1),
        ...NS.map((n) => pc(mezclaMargen(n))),
      ];
    }),
  );
}
console.log('Cupon de conversion (20 % por 3 cargos mensuales). Ingreso que se deja de cobrar por cliente convertido, sin IVA y con IVA, y margen del peor caso durante esos meses.\n');
for (const mt of METODOS) {
MT = mt;
console.log(`Fijos ${ETQ[mt]}:\n`);
tabla(
  ['Tabla / plan', 'Descuento por cliente (con IVA, 3 meses)', 'Sin IVA', ...ESCENARIOS.map((e) => `Margen peor caso con cupon, ${escLabel(e)}`)],
  TABLAS.flatMap((t) =>
    ['esencial', 'profesional', 'negocio'].map((k) => [
      `${t.id} ${PLANES[k].nombre}`,
      m0(t.precios[k] * CUPON.pct * CUPON.meses),
      m0((t.precios[k] * CUPON.pct * CUPON.meses) / 1.16),
      ...ESCENARIOS.map((e) => pc(margen(t, k, 'mensual', e, { cupon: true }).m)),
    ]),
  ),
);
}
MT = 'igual';
console.log('El cupon no entra en la prueba dura (es un costo de adquisicion de 3 meses); la tabla muestra cuanto baja el margen mientras dura.\n');

h('6. Precio mensual minimo para llegar a 50 % (peor caso, IVA no acreditado, con Facturapi)');
console.log('Anual = 10 x mensual (el minimo anual es el precio mensual de lista que hace que el anual llegue a 50 %).\n');
const kk = ['esencial', 'profesional', 'negocio'];
for (const mt of METODOS) {
MT = mt;
console.log(`Fijos ${ETQ[mt]} (los otros planes se dejan al precio vigente):\n`);
const filasMin = [];
for (const k of kk) {
  for (const [lbl, iaU] of [['IA recomendada', IA_TOPE_USD_RECOMENDADO[k]], ['IA US$2', 2], ['sin IA', 0]]) {
    if (k === 'esencial' && lbl === 'IA US$2') continue;
    if (k !== 'esencial' && lbl === 'sin IA') continue;
    for (const cad of ['mensual', 'anual']) {
      filasMin.push([`${PLANES[k].nombre}, ${lbl}, ${cad}`, ...ESCENARIOS.map((e) => m0(precioMinimo(k, cad, e, iaU)))]);
    }
  }
}
tabla(['Plan / IA / cadencia', ...ESCENARIOS.map(escLabel)], filasMin);
}
MT = 'igual';

h('7. Palancas de Stripe: ahorro en pesos');
console.log('7.1 Anual contra 12 mensuales (tarjeta, Billing, IVA no acreditado). Costo de Stripe por cliente al ano:\n');
tabla(
  ['Plan', '12 cobros mensuales', 'Ingreso anual con IVA mensual', '1 cobro anual (10 meses)', 'Ingreso con IVA anual', 'Costo mensual % del ingreso', 'Costo anual % del ingreso', 'Solo la cuota fija: 11 cuotas de $3 + IVA ahorradas'],
  kk.map((k) => {
    const P = vig.precios[k];
    const mens = 12 * stripeCobro(P);
    const anu = stripeCobro(P * ANUAL_MESES);
    return [PLANES[k].nombre, m2(mens), m0(P * 12), m2(anu), m0(P * ANUAL_MESES), pc(mens / (P * 12)), pc(anu / (P * ANUAL_MESES)), m2(11 * STRIPE_FIJO * 1.16)];
  }),
);
console.log('7.2 Quitar Stripe Billing (0.7 %) con cobros propios con PaymentIntents. Ahorro por cobro (con IVA) y por cliente al ano:\n');
tabla(
  ['Plan', 'Ahorro por cobro mensual', 'Ahorro al ano (12 cobros)', 'Ahorro cobro anual', 'Ahorro a 100 clientes tipicos mezcla, MXN al mes'],
  kk.map((k) => {
    const P = vig.precios[k];
    const mensual = STRIPE_BILLING * P * (1 + IVA);
    const anual = STRIPE_BILLING * P * ANUAL_MESES * (1 + IVA);
    return [PLANES[k].nombre, m2(mensual), m2(mensual * 12), m2(anual), m0(100 * MEZCLA[k] * mensual)];
  }),
);
{
  const total = kk.reduce((s, k) => s + 100 * MEZCLA[k] * STRIPE_BILLING * vig.precios[k] * (1 + IVA), 0);
  console.log(`Con 100 clientes en la mezcla 60/30/10 pagando mensual: ${m0(total)} al mes (${m0(total * 12)} al ano) en total.\n`);
}
console.log('7.3 SPEI (customer_balance) para el pago anual con factura enviada (send_invoice). Sigue aplicando Billing 0.7 %:\n');
tabla(
  ['Plan', 'Cargo anual', 'Stripe con tarjeta', 'Stripe con SPEI', 'Ahorro por cliente al ano', 'OXXO (4 % + 3; sin Billing; tope $10,000)'],
  kk.map((k) => {
    const G = vig.precios[k] * ANUAL_MESES;
    const t = stripeCobro(G);
    const s = stripeCobro(G, { metodo: 'spei' });
    return [PLANES[k].nombre, m0(G), m2(t), m2(s), m2(t - s), G > 10000 ? 'excede $10,000' : m2(stripeCobro(G, { metodo: 'oxxo' }))];
  }),
);
console.log('7.4 Acreditar el IVA de la comision de Stripe (CFDI mensual de Stripe). Ahorro por cobro mensual y por cliente al ano:\n');
tabla(
  ['Plan', 'IVA de la comision por cobro mensual', 'Al ano (12 cobros)', 'Cobro anual', 'Ahorro como % del ingreso sin IVA (mensual)'],
  kk.map((k) => {
    const P = vig.precios[k];
    const iva = stripeCobro(P) - stripeCobro(P, { credito: true });
    const ivaA = stripeCobro(P * ANUAL_MESES) - stripeCobro(P * ANUAL_MESES, { credito: true });
    return [PLANES[k].nombre, m2(iva), m2(iva * 12), m2(ivaA), pc(iva / (P / 1.16))];
  }),
);
console.log('7.5 Tarjeta internacional (+0.5 %) y contracargo. Costo de una disputa contra el ingreso mensual sin IVA:\n');
tabla(
  ['Plan', '+0.5 % internacional por cobro (con IVA)', 'Disputa (150 + IVA)', 'Disputa / ingreso mensual sin IVA'],
  kk.map((k) => {
    const P = vig.precios[k];
    return [PLANES[k].nombre, m2(0.005 * P * 1.16), m2(DISPUTA * 1.16), pc((DISPUTA * 1.16) / (P / 1.16))];
  }),
);
console.log('7.6 Pasarelas para cobro recurrente con tarjeta nacional (comision + IVA 16 %, por cobro de precio con IVA incluido). Solo comparacion.\n');
tabla(
  ['Pasarela', 'Tarifa', ...[199, 449, 1199].map((g) => `Cobro ${m0(g)}`), 'Ahorro vs Stripe+Billing en $449', 'Fuente y fecha'],
  PASARELAS.map((p) => {
    const costo = (G) => (p.pct * G + p.fijo) * (1 + IVA);
    const base = (449 * (STRIPE_PCT + STRIPE_BILLING) + STRIPE_FIJO) * (1 + IVA);
    return [
      p.n,
      `${(p.pct * 100).toFixed(2)} % + ${m2(p.fijo)}`,
      ...[199, 449, 1199].map((g) => `${m2(costo(g))} (${pc(costo(g) / g)})`),
      m2(base - costo(449)),
      p.f,
    ];
  }),
);

{
  const mp = PASARELAS.find((x) => x.n.includes('10 dias'));
  const ahorro = kk.reduce((acc, k) => {
    const G = vig.precios[k];
    const st = (G * (STRIPE_PCT + STRIPE_BILLING) + STRIPE_FIJO) * (1 + IVA);
    const otro = (G * mp.pct + mp.fijo) * (1 + IVA);
    return acc + 100 * MEZCLA[k] * (st - otro);
  }, 0);
  console.log(`Ahorro de pasar a Mercado Pago (dinero a 10 dias) con 100 clientes en la mezcla 60/30/10 pagando mensual: ${m0(ahorro)} al mes (${m0(ahorro * 12)} al ano), sin contar el costo del proyecto de migracion.\n`);
}

h('8. Sensibilidades de la tabla A (peor caso, mensual)');
{
  const t = TABLAS.find((x) => x.id === 'A');
  const variantes = [
    ['Base (Facturapi, sin PITR, IVA no acreditado)', {}],
    ['Con IVA acreditado', { credito: true }],
    ['Sin Facturapi (CFDI manual en fase 1)', { facturapi: false }],
    ['Con PITR de Supabase', { pitr: true }],
    ['Sin Billing (hipotetico)', { billing: false }],
    ['10 % de cobros con tarjeta internacional (+0.5 %)', { intl: 0.005 * 0.1 }],
  ];
  for (const mt of METODOS) {
  MT = mt;
  console.log(`Fijos ${ETQ[mt]}:\n`);
  tabla(
    ['Variante', ...kk.flatMap((k) => ESCENARIOS.map((e) => `${PLANES[k].nombre}, ${escLabel(e)}`))],
    variantes.map(([n, o]) => [n, ...kk.flatMap((k) => ESCENARIOS.map((e) => pc(margen(t, k, 'mensual', e, o).m)))]),
  );
  }
  MT = 'igual';
}

h('9. Corporativo (a la medida): precio minimo para 50 % con IA de US$15');
tabla(
  ['Escenario', 'Precio mensual con IVA minimo (peor caso, IVA no acreditado)'],
  ESCENARIOS.map((e) => {
    const k = 'corporativo';
    for (let P = 100; P < 20000; P += 10) {
      const t = { precios: { [k]: P }, ia_usd: { [k]: IA_TOPE_USD_RECOMENDADO[k] } };
      if (margen(t, k, 'mensual', e).m >= 0.5) return [escLabel(e), m0(P)];
    }
    return [escLabel(e), 'n/d'];
  }),
);
