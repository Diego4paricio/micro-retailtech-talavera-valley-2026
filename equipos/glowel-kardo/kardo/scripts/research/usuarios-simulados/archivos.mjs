// Files each persona has "on their phone or computer": a simple logo with the
// business name (same badge as scripts/dev/ai-eval/assets.mts), real photos
// from the website's sources and, in round 2, the PDFs and pictures they bring
// (a presentation, a portfolio, a photo of the printed menu, a class schedule).
// Writes .out/archivos/<persona>/ (gitignored).
//
//   node scripts/research/usuarios-simulados/archivos.mjs          # round 1
//   node scripts/research/usuarios-simulados/archivos.mjs ronda2   # round 2 (keeps round 1)
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const { chromium } = createRequire(path.join(root, "scripts/video/lib.mjs"))(
  "playwright-core",
);
const out = path.join(here, ".out/archivos");
const sources = path.join(root, "apps/website/scripts/media/fuentes");
const photos = path.join(sources, "hero-paginas");
const round = process.argv[2] === "ronda2" ? 2 : 1;

const serif = "Georgia, serif";
const sans = "'Helvetica Neue', Arial, sans-serif";
const round1 = {
  keys: ["lupe", "beto", "mariana", "paco", "laura", "diego"],
  logos: {
    mariana: { file: "logo-mariana-nails.png", mark: "MN", word: "Mariana Nails", primary: "#3D2C4A", accent: "#E8B4C8", shape: "arch", font: serif },
    paco: { file: "logo-cafe-la-esquina.png", mark: "LE", word: "Café La Esquina", primary: "#4A2C20", accent: "#D98C4A", shape: "circle", font: serif },
    laura: { file: "logo-despacho-rios.png", mark: "R", word: "Despacho Ríos", primary: "#1F3A5F", accent: "#8FB3D9", shape: "square", font: sans },
    diego: { file: "logo-nodo-digital.png", mark: "N", word: "Nodo Digital", primary: "#111827", accent: "#22D3EE", shape: "square", font: sans },
    diegoCliente: { dir: "diego", file: "logo-barberia-el-bigote.png", mark: "EB", word: "Barbería El Bigote", primary: "#111111", accent: "#C8102E", shape: "circle", font: "'Arial Rounded MT Bold', Arial, sans-serif" },
  },
  photos: {
    lupe: { "foto-enchiladas.jpg": "restaurante-enchiladas.jpg" },
    mariana: { "unas-1.jpg": "salon-unas.jpg", "mi-local.jpg": "salon-local.jpg" },
    paco: { "foto-cafe.jpg": "restaurante-cafe.jpg", "foto-concha.jpg": "restaurante-concha.jpg" },
    laura: { "foto-oficina.jpg": "despacho-oficina.jpg" },
  },
};

// Round 2: Doña Rosa, Don Chema and Ing. Raúl (very little tech) bring no logo.
const round2 = {
  keys: ["rosa", "javier", "fernanda", "ernesto", "paola", "carmen", "tono", "ivan", "sofia", "ricardo", "marisol", "luis", "ana", "diego2", "mateo", "chema", "lucia", "karla", "raul", "paty", "piloto2"],
  logos: {
    javier: { file: "logo-panaderia-san-javier.png", mark: "SJ", word: "Panadería San Javier", primary: "#7A4A1E", accent: "#F2C46D", shape: "circle", font: serif },
    fernanda: { file: "logo-floreria-azahar.png", mark: "A", word: "Florería Azahar", primary: "#2F4A3A", accent: "#F4C7C3", shape: "arch", font: serif },
    ernesto: { file: "logo-garza-asociados.png", mark: "G", word: "Garza y Asociados", primary: "#14213D", accent: "#C9A227", shape: "square", font: serif },
    paola: { file: "logo-sonrisa-maya.png", mark: "SM", word: "Sonrisa Maya", primary: "#0E7C86", accent: "#BDEBEA", shape: "circle", font: sans },
    carmen: { file: "logo-carmen-nails.png", mark: "C", word: "Carmen Nails & Lashes", primary: "#B83280", accent: "#FBD3E9", shape: "arch", font: serif },
    tono: { file: "logo-barberia-el-tono.png", mark: "T", word: "Barbería El Toño", primary: "#1A1A1A", accent: "#E63946", shape: "circle", font: "'Arial Black', Arial, sans-serif" },
    ivan: { file: "logo-mezcaleria-la-tuna.png", mark: "LT", word: "Mezcalería La Tuna", primary: "#5B2333", accent: "#E9A23B", shape: "circle", font: serif },
    sofia: { file: "logo-boutique-sofia.png", mark: "S", word: "Boutique Sofía", primary: "#2B2B2B", accent: "#D4A5A5", shape: "arch", font: serif },
    ricardo: { file: "logo-lozano-bienes-raices.png", mark: "L", word: "Lozano Bienes Raíces", primary: "#0B3954", accent: "#7FD1B9", shape: "square", font: sans },
    marisol: { file: "logo-casa-jacarandas.png", mark: "CJ", word: "Casa Jacarandas", primary: "#5E3A87", accent: "#C8A2E8", shape: "arch", font: serif },
    luis: { file: "logo-academia-bright.png", mark: "B", word: "Academia Bright", primary: "#1D4ED8", accent: "#FACC15", shape: "square", font: sans },
    ana: { file: "logo-los-arcos.png", mark: "LA", word: "Salón Los Arcos", primary: "#7C2D12", accent: "#FDBA74", shape: "arch", font: serif },
    diego2: { file: "logo-agencia-brinco.png", mark: "B", word: "Agencia Brinco", primary: "#111827", accent: "#A3E635", shape: "square", font: sans },
    diego2Taqueria: { dir: "diego2", file: "logo-taqueria-el-pastorcito.png", mark: "EP", word: "Taquería El Pastorcito", primary: "#B91C1C", accent: "#FCD34D", shape: "circle", font: "'Arial Black', Arial, sans-serif" },
    diego2Gym: { dir: "diego2", file: "logo-gimnasio-fuerza-norte.png", mark: "FN", word: "Gimnasio Fuerza Norte", primary: "#0F172A", accent: "#F97316", shape: "square", font: "'Arial Black', Arial, sans-serif" },
    diego2Dentista: { dir: "diego2", file: "logo-dental-del-valle.png", mark: "DV", word: "Dental del Valle", primary: "#0369A1", accent: "#BAE6FD", shape: "circle", font: sans },
    mateo: { file: "logo-mateo-rivas.png", mark: "MR", word: "Mateo Rivas Fotografía", primary: "#18181B", accent: "#E4E4E7", shape: "circle", font: sans },
    lucia: { file: "logo-grano-fino.png", mark: "GF", word: "Café Grano Fino", primary: "#3F2A1E", accent: "#C8B6A6", shape: "circle", font: serif },
    karla: { file: "logo-prana-yoga.png", mark: "P", word: "Prana Yoga Estudio", primary: "#4D7C0F", accent: "#ECFCCB", shape: "arch", font: serif },
    paty: { file: "logo-la-guera-paty.png", mark: "GP", word: "La Güera Paty", primary: "#C2410C", accent: "#FEF08A", shape: "circle", font: "'Arial Rounded MT Bold', Arial, sans-serif" },
    piloto2: { file: "logo-papeleria-el-piloto.png", mark: "P", word: "Papelería El Piloto", primary: "#1E3A8A", accent: "#93C5FD", shape: "square", font: sans },
  },
  photos: {
    rosa: { "foto-enchiladas.jpg": "hero-paginas/restaurante-enchiladas.jpg", "foto-chilaquiles.jpg": "hero-paginas/restaurante-chilaquiles.png" },
    javier: { "foto-conchas.jpg": "hero-paginas/restaurante-concha.jpg" },
    fernanda: { "ramo-novia.jpg": "hero-paginas/floreria-ramo.png", "rosas-rojas.jpg": "hero-paginas/floreria-rosas.jpg", "suculenta.jpg": "hero-paginas/floreria-suculenta.jpg" },
    ernesto: { "foto-oficina.jpg": "hero-paginas/despacho-oficina.jpg" },
    carmen: { "unas-gelish.jpg": "hero-paginas/salon-unas.jpg", "mi-local.jpg": "hero-paginas/salon-local.jpg" },
    sofia: { "foto-tienda.jpg": "negocio-tienda.png" },
    ricardo: { "casa-fachada.jpg": "hero-paginas/inmobiliaria-casa.png", "casa-cocina.jpg": "hero-paginas/inmobiliaria-cocina.jpg", "casa-sala.jpg": "hero-paginas/inmobiliaria-sala.jpg" },
    marisol: { "foto-hotel.jpg": "negocio-hotel.png" },
    luis: { "foto-salon-de-clases.jpg": "negocio-escuela.png" },
    ana: { "foto-salon.jpg": "negocio-eventos.png" },
    mateo: { "foto-boda.jpg": "hero-paginas/floreria-ramo.png", "foto-interiores.jpg": "hero-paginas/inmobiliaria-sala.jpg", "foto-producto.jpg": "hero-paginas/restaurante-cafe.jpg" },
    lucia: { "foto-capuchino.jpg": "hero-paginas/restaurante-cafe.jpg", "foto-pan.jpg": "hero-paginas/restaurante-concha.jpg" },
    paty: { "foto-tacos.jpg": "hero-paginas/restaurante-enchiladas.jpg" },
  },
};
const set = round === 2 ? round2 : round1;

if (round === 1) fs.rmSync(out, { recursive: true, force: true });
for (const key of set.keys) {
  fs.rmSync(path.join(out, key), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, key), { recursive: true });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });

// Photos: JPEGs are copied; big PNGs go through the browser as a 1400 px JPEG.
const dataUri = (file) =>
  `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${fs.readFileSync(file).toString("base64")}`;
for (const [key, files] of Object.entries(set.photos))
  for (const [name, source] of Object.entries(files)) {
    const from = round === 1 ? path.join(photos, source) : path.join(sources, source);
    const to = path.join(out, key, name);
    if (from.endsWith(".jpg")) {
      fs.copyFileSync(from, to);
      continue;
    }
    await page.setViewportSize({ width: 1400, height: 1050 });
    await page.setContent(`<body style="margin:0"><img src="${dataUri(from)}" style="width:1400px;height:1050px;object-fit:cover;display:block"></body>`);
    await page.screenshot({ path: to, type: "jpeg", quality: 82 });
  }

await page.setViewportSize({ width: 512, height: 512 });
for (const [key, logo] of Object.entries(set.logos)) {
  const radius = logo.shape === "circle" ? "50%" : logo.shape === "arch" ? "150px 150px 24px 24px" : "56px";
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:512px;height:512px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;font-family:${logo.font}">
  <div style="width:300px;height:300px;border-radius:${radius};background:${logo.primary};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 10px ${logo.accent}">
    <span style="color:#fff;font-size:${logo.mark.length > 1 ? 120 : 160}px;font-weight:700;letter-spacing:2px">${logo.mark}</span>
  </div>
  <span style="color:${logo.primary};font-size:${logo.word.length > 18 ? 32 : logo.word.length > 14 ? 38 : 44}px;font-weight:700;text-align:center">${logo.word}</span>
</div></body></html>`);
  await page.screenshot({ path: path.join(out, logo.dir ?? key, logo.file), omitBackground: true });
}

if (round === 2) {
  const photo = (key, name) => dataUri(path.join(out, key, name));
  const css = `*{box-sizing:border-box}body{margin:0;font-family:'Helvetica Neue',Arial,sans-serif;color:#1c1917}
    .page{width:100%;height:100vh;padding:56px 64px;display:flex;flex-direction:column;gap:20px;page-break-after:always;position:relative}
    h1{font-size:44px;margin:0}h2{font-size:30px;margin:0}p{font-size:17px;line-height:1.5;margin:0}
    .cover{justify-content:flex-end;color:#fff;background-size:cover;background-position:center}
    .cover::before{content:"";position:absolute;inset:0;background:linear-gradient(transparent 30%,rgba(0,0,0,.65))}
    .cover>*{position:relative}.img{width:100%;height:330px;object-fit:cover;border-radius:12px}
    table{border-collapse:collapse;width:100%;font-size:17px}td{padding:10px 0;border-bottom:1px solid #e7e5e4}td:last-child{text-align:right;font-weight:700}
    .foot{margin-top:auto;font-size:14px;color:#78716c}`;
  const cover = (img, title, line) =>
    `<section class="page cover" style="background-image:url('${img}')"><h1>${title}</h1><p>${line}</p></section>`;
  const sheet = (title, body, foot) => `<section class="page"><h2>${title}</h2>${body}<p class="foot">${foot}</p></section>`;
  const rows = (items) => `<table>${items.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>`;
  const pdfs = {
    fernanda: {
      file: "catalogo-arreglos-azahar.pdf",
      pages: [
        cover(photo("fernanda", "ramo-novia.jpg"), "Florería Azahar", "Catálogo de arreglos · Querétaro"),
        sheet("Ramos", `<img class="img" src="${photo("fernanda", "rosas-rojas.jpg")}">${rows([["Ramo de 12 rosas rojas", "$650"], ["Ramo de 24 rosas", "$1,150"], ["Ramo de novia (consultar)", "desde $1,800"], ["Ramo de girasoles", "$480"]])}`, "Entrega a domicilio en Querétaro capital: $90"),
        sheet("Arreglos y plantas", `<img class="img" src="${photo("fernanda", "suculenta.jpg")}">${rows([["Caja de rosas y chocolates", "$890"], ["Arreglo para oficina", "$720"], ["Suculenta en maceta de barro", "$220"], ["Orquídea blanca", "$780"]])}`, "Pedidos por WhatsApp 442 318 2290"),
      ],
    },
    ricardo: {
      file: "presentacion-propiedades-lozano.pdf",
      pages: [
        cover(photo("ricardo", "casa-fachada.jpg"), "Lozano Bienes Raíces", "Propiedades en venta · Cancún, otoño 2026"),
        sheet("Casa Residencial Aqua, SM 16", `<img class="img" src="${photo("ricardo", "casa-sala.jpg")}">${rows([["Precio", "$6,850,000 MXN"], ["Recámaras", "3 con baño propio"], ["Construcción", "240 m²"], ["Amenidades", "Alberca, gimnasio, seguridad 24 h"]])}`, "Crédito bancario e Infonavit · Agenda tu visita"),
        sheet("Departamento Puerto Cancún", `<img class="img" src="${photo("ricardo", "casa-cocina.jpg")}">${rows([["Precio", "$4,200,000 MXN"], ["Recámaras", "2"], ["Construcción", "118 m²"], ["Entrega", "Inmediata"]])}`, "Ricardo Lozano · 998 214 5530"),
        sheet("Cómo compramos contigo", `<p>1. Te escuchamos y elegimos opciones a tu medida.</p><p>2. Visitas guiadas, en persona o por videollamada.</p><p>3. Te acompañamos con el crédito, la notaría y la entrega.</p>`, "Lozano Bienes Raíces · Av. Bonampak 120, Cancún"),
      ],
    },
    luis: {
      file: "presentacion-academia-bright.pdf",
      pages: [
        cover(photo("luis", "foto-salon-de-clases.jpg"), "Academia de Inglés Bright", "Inglés para niños, jóvenes y adultos · León, Gto."),
        sheet("Nuestros cursos", rows([["Kids (6 a 11 años), sábados", "$850 al mes"], ["Teens (12 a 17), lunes y miércoles", "$950 al mes"], ["Adultos, martes y jueves 7 pm", "$1,100 al mes"], ["Preparación TOEFL, 8 semanas", "$4,800"]]), "Inscripción: $400 · Grupos de máximo 12 alumnos"),
        sheet("Por qué Bright", `<p>Maestros certificados con más de 10 años de experiencia.</p><p>Clase muestra gratis antes de inscribirte.</p><p>Examen de ubicación sin costo.</p>`, "Blvd. Campestre 410, León · 477 390 1122"),
      ],
    },
    ana: {
      file: "paquetes-salon-los-arcos.pdf",
      pages: [
        cover(photo("ana", "foto-salon.jpg"), "Salón de Fiestas Los Arcos", "Paquetes 2026 · Tlaquepaque, Jalisco"),
        sheet("Paquetes", rows([["Paquete Básico, 100 personas, 5 horas", "$28,000"], ["Paquete Plata, 150 personas, banquete 3 tiempos", "$52,000"], ["Paquete Oro, 200 personas, banquete y DJ", "$78,000"], ["Hora extra", "$3,500"]]), "Precios con IVA · Apartado del 30 %"),
        sheet("Incluye", `<p>Mobiliario, mantelería y loza.</p><p>Meseros y capitán de meseros.</p><p>Estacionamiento para 60 autos.</p><p>Jardín para ceremonia (paquetes Plata y Oro).</p>`, "Cotiza por WhatsApp 33 1456 7788"),
      ],
    },
    mateo: {
      file: "portafolio-mateo-rivas.pdf",
      pages: [
        cover(photo("mateo", "foto-boda.jpg"), "Mateo Rivas", "Fotografía de bodas, producto e interiores"),
        sheet("Bodas", `<img class="img" src="${photo("mateo", "foto-boda.jpg")}"><p>Cobertura completa desde $14,000. Entrega en 3 semanas.</p>`, "mateorivas.foto en Instagram"),
        sheet("Producto e interiores", `<img class="img" src="${photo("mateo", "foto-producto.jpg")}"><img class="img" style="height:240px" src="${photo("mateo", "foto-interiores.jpg")}">`, "Sesión de producto desde $2,500 · Interiores desde $3,800"),
      ],
    },
  };
  const pdfPage = await browser.newPage();
  for (const [key, pdf] of Object.entries(pdfs)) {
    await pdfPage.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${pdf.pages.join("")}</body></html>`);
    await pdfPage.pdf({ path: path.join(out, key, pdf.file), format: "Letter", landscape: true, printBackground: true });
  }

  // Iván's printed menu, photographed on the table; Karla's class schedule.
  const picture = async (key, name, html, width, height) => {
    await page.setViewportSize({ width, height });
    await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`);
    await page.screenshot({ path: path.join(out, key, name), type: "jpeg", quality: 84 });
  };
  const carta = [
    ["Mezcales", [["Espadín joven", "$90"], ["Tobalá", "$160"], ["Cuishe", "$140"], ["Tepextate", "$180"], ["Ensamble de la casa", "$120"]]],
    ["Para acompañar", [["Tlayuda con tasajo", "$145"], ["Chapulines con limón", "$70"], ["Quesillo con chile de agua", "$95"], ["Tostadas de chileajo", "$85"]]],
    ["Cervezas", [["Artesanal oaxaqueña", "$75"], ["Michelada", "$80"]]],
  ];
  await picture(
    "ivan",
    "foto-carta.jpg",
    `<div style="width:1100px;height:1400px;background:#6b4f3a;display:flex;align-items:center;justify-content:center">
      <div style="width:820px;padding:56px 64px;background:#f4ead8;transform:rotate(-0.8deg);box-shadow:0 30px 60px rgba(0,0,0,.45);font-family:Georgia,serif;color:#3b2416">
        <h1 style="text-align:center;font-size:52px;margin:0 0 6px">Mezcalería La Tuna</h1>
        <p style="text-align:center;font-size:20px;margin:0 0 30px;font-style:italic">Oaxaca de Juárez</p>
        ${carta.map(([title, items]) => `<h2 style="font-size:30px;border-bottom:2px solid #3b2416;margin:26px 0 10px">${title}</h2>${items.map(([a, b]) => `<div style="display:flex;justify-content:space-between;font-size:24px;padding:6px 0"><span>${a}</span><span>${b}</span></div>`).join("")}`).join("")}
      </div></div>`,
    1100,
    1400,
  );
  const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const classes = [
    ["7:00", "Vinyasa", "Hatha", "Vinyasa", "Hatha", "Vinyasa", "Yoga en familia 9:00"],
    ["13:00", "", "Yin", "", "Yin", "", ""],
    ["19:00", "Hatha", "Vinyasa", "Restaurativo", "Vinyasa", "Hatha", ""],
  ];
  await picture(
    "karla",
    "horario-clases.jpg",
    `<div style="width:1080px;height:1350px;background:#f7f5ee;font-family:'Helvetica Neue',Arial,sans-serif;color:#2f3e1b;padding:70px;box-sizing:border-box">
      <h1 style="font-size:58px;margin:0">Horario de clases</h1><p style="font-size:26px;margin:8px 0 40px">Prana Yoga Estudio · Tijuana</p>
      <table style="width:100%;border-collapse:collapse;font-size:24px">
        <tr>${["", ...days].map((day) => `<th style="text-align:left;padding:14px 8px;border-bottom:3px solid #4d7c0f">${day}</th>`).join("")}</tr>
        ${classes.map((row) => `<tr>${row.map((cell, i) => `<td style="padding:22px 8px;border-bottom:1px solid #d9d4c3;${i === 0 ? "font-weight:700" : ""}">${cell}</td>`).join("")}</tr>`).join("")}
      </table>
      <p style="font-size:26px;margin-top:50px">Clase de prueba gratis · Mensualidad $1,200 · Clase suelta $180</p></div>`,
    1080,
    1350,
  );
}

await browser.close();
for (const key of set.keys)
  console.log(key, fs.readdirSync(path.join(out, key)).join(", ") || "(nada)");
