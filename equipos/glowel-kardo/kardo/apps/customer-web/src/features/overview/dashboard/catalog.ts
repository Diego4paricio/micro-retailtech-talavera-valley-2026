import type {
  ConfigField,
  WidgetConfig,
  WidgetDefinition,
  WidgetType,
} from "./types.js";

/** Indicators a KPI card can show; all come from `summary.kpis`. */
export const kpiMetrics = [
  { value: "taps", label: "Accesos" },
  { value: "clicks", label: "Clics en acciones" },
  { value: "leads", label: "Solicitudes" },
  { value: "conversionRate", label: "Tasa de conversión" },
  { value: "interactionRate", label: "Interacción" },
  { value: "dailyAverage", label: "Promedio diario" },
  { value: "activeTouchpoints", label: "QR y etiquetas activos" },
  { value: "reachedTouchpoints", label: "QR y etiquetas con accesos" },
  { value: "peakHour", label: "Hora pico" },
  { value: "topChannel", label: "Canal principal" },
  { value: "peakDay", label: "Mejor día" },
] as const;
export type KpiMetric = (typeof kpiMetrics)[number]["value"];

export const kpiDefinitions: Record<KpiMetric, string> = {
  taps: "Aperturas por NFC, QR y URL directa. Si alguien abre dos veces, cuenta dos.",
  clicks: "Veces que alguien tocó un botón o enlace dentro de una página.",
  leads: "Formularios de contacto recibidos con consentimiento.",
  conversionRate:
    "Solicitudes entre accesos: cuántas aperturas terminan en contacto.",
  interactionRate: "Clics entre accesos: qué tanto se usa lo que ven al abrir.",
  dailyAverage: "Accesos por día en el periodo.",
  activeTouchpoints: "QR y etiquetas con una página publicada.",
  reachedTouchpoints: "QR y etiquetas activos que alguien abrió en el periodo.",
  peakHour: "La hora del día con más accesos en el periodo.",
  topChannel: "El canal por el que llega la mayoría de los accesos.",
  peakDay: "El día del periodo con más accesos.",
};

const seriesMetrics = [
  { value: "taps", label: "Accesos" },
  { value: "clicks", label: "Clics" },
  { value: "leads", label: "Solicitudes" },
] as const;

const metricLabel = (value: unknown) =>
  seriesMetrics.find((item) => item.value === value)?.label ?? "Accesos";

const metricField: ConfigField = {
  key: "metric",
  label: "Métrica",
  kind: "select",
  options: seriesMetrics,
};

const rankingDimensions = [
  { value: "touchpoints", label: "QR y etiquetas" },
  { value: "experiences", label: "Páginas" },
  { value: "groups", label: "Grupos" },
] as const;

export const widgetCatalog: Record<WidgetType, WidgetDefinition> = {
  kpi: {
    type: "kpi",
    name: "Indicador",
    description: "Una cifra clave con su cambio y su tendencia diaria.",
    help: "La cifra es el total del periodo elegido arriba. El porcentaje compara contra el periodo anterior de la misma duración (verde sube, terracota baja) y la línea dibuja cómo se movió día a día. Toca o pasa el cursor por (i) junto al nombre para ver cómo se calcula cada indicador.",
    category: "indicadores",
    frame: "bare",
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 6, h: 3 },
    defaultConfig: { metric: "taps", sparkline: true },
    fields: [
      {
        key: "metric",
        label: "Indicador",
        kind: "select",
        options: kpiMetrics,
      },
      {
        key: "sparkline",
        label: "Mostrar la línea de tendencia",
        kind: "toggle",
      },
    ],
    title: (config) =>
      kpiMetrics.find((item) => item.value === config.metric)?.label ??
      "Indicador",
  },
  trend: {
    type: "trend",
    name: "Tendencia diaria",
    description: "Cómo evolucionan accesos, clics o solicitudes día a día.",
    help: "Cada punto es un día del periodo. La línea punteada es el periodo anterior, día por día, para ver si vas arriba o abajo. Pasa el cursor por la gráfica para ver el valor exacto y su cambio.",
    category: "tendencias",
    frame: "titled",
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 4, h: 4 },
    maxSize: { w: 12, h: 8 },
    defaultConfig: { metric: "taps", chart: "area", compare: true },
    fields: [
      metricField,
      {
        key: "chart",
        label: "Gráfica",
        kind: "select",
        options: [
          { value: "area", label: "Área" },
          { value: "bars", label: "Barras" },
          { value: "line", label: "Línea" },
        ],
      },
      {
        key: "compare",
        label: "Comparar con el periodo anterior",
        kind: "toggle",
      },
    ],
    title: (config) => `${metricLabel(config.metric)} por día`,
  },
  channels: {
    type: "channels",
    name: "Reparto por canal",
    description: "Por dónde llegan las personas: NFC, QR o URL directa.",
    help: "Reparte los accesos del periodo según cómo llegaron: tocando la etiqueta NFC, escaneando el QR (incluye el QR de respaldo de tus etiquetas NFC) o abriendo la URL directa. Te dice qué formato físico usan más tus clientes.",
    category: "canales",
    frame: "titled",
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 7 },
    defaultConfig: { chart: "donut" },
    fields: [
      {
        key: "chart",
        label: "Gráfica",
        kind: "select",
        options: [
          { value: "donut", label: "Dona" },
          { value: "bars", label: "Barras" },
        ],
      },
    ],
    title: () => "Reparto por canal",
  },
  channelTrend: {
    type: "channelTrend",
    name: "Canales por día",
    description: "Si cambia la mezcla de NFC, QR y URL con los días.",
    help: "Barras apiladas por día: cada color es un canal (NFC, QR o URL directa). Sirve para ver si un cambio en tus objetos físicos (por ejemplo, poner QR nuevos) movió la mezcla.",
    category: "canales",
    frame: "titled",
    defaultSize: { w: 8, h: 5 },
    minSize: { w: 4, h: 4 },
    maxSize: { w: 12, h: 8 },
    defaultConfig: {},
    fields: [],
    title: () => "Canales por día",
  },
  channelInteraction: {
    type: "channelInteraction",
    name: "Interacción por canal",
    description: "Qué canal genera más clics por cada acceso.",
    help: "Compara, por canal, cuántos accesos hubo y cuántos clics generaron dentro de la página. La tasa es clics entre accesos: qué canal trae a las personas más interesadas.",
    category: "canales",
    frame: "titled",
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 7 },
    defaultConfig: {},
    fields: [],
    title: () => "Interacción por canal",
  },
  heatmap: {
    type: "heatmap",
    name: "Actividad por día y hora",
    description: "Qué días y horarios concentran los accesos.",
    help: "Cada cuadro es una hora de un día de la semana; entre más oscuro, más accesos. Úsalo para decidir horarios de promociones o cuándo revisar tus QR y etiquetas. Las horas están en tu zona horaria.",
    category: "actividad",
    frame: "titled",
    defaultSize: { w: 12, h: 5 },
    minSize: { w: 6, h: 4 },
    maxSize: { w: 12, h: 7 },
    defaultConfig: {},
    fields: [],
    title: () => "Actividad por día y hora",
  },
  hours24: {
    type: "hours24",
    name: "Últimas 24 horas",
    description: "Accesos por hora desde ayer a esta hora.",
    help: "Accesos por hora desde ayer a esta misma hora; la última barra es la hora actual. Útil para ver la actividad del día sin esperar al cierre.",
    category: "actividad",
    frame: "titled",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 6 },
    defaultConfig: {},
    fields: [],
    title: () => "Últimas 24 horas",
  },
  hourOfDay: {
    type: "hourOfDay",
    name: "Horario del periodo",
    description: "A qué hora del día llegan más accesos en el periodo.",
    help: "Suma los accesos del periodo por hora del día, sin importar el día de la semana. Muestra tus horas pico en general.",
    category: "actividad",
    frame: "titled",
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 6 },
    defaultConfig: {},
    fields: [],
    title: () => "Accesos por hora del día",
  },
  weekday: {
    type: "weekday",
    name: "Días de la semana",
    description: "Qué día de la semana se usan más tus QR y etiquetas.",
    help: "Suma los accesos del periodo por día de la semana (lunes primero). Muestra qué días se usan más tus QR y etiquetas.",
    category: "actividad",
    frame: "titled",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 6 },
    defaultConfig: {},
    fields: [],
    title: () => "Accesos por día de la semana",
  },
  ranking: {
    type: "ranking",
    name: "Ranking",
    description: "Los QR y etiquetas, páginas o grupos que más rinden.",
    help: "Ordena tus QR y etiquetas, páginas o grupos por la métrica que elijas. La barra muestra cada uno contra el primero; conversión es solicitudes entre accesos.",
    category: "rendimiento",
    frame: "titled",
    defaultSize: { w: 6, h: 5 },
    minSize: { w: 4, h: 4 },
    maxSize: { w: 12, h: 9 },
    defaultConfig: { dimension: "touchpoints", metric: "taps", limit: "5" },
    fields: [
      {
        key: "dimension",
        label: "Qué comparar",
        kind: "select",
        options: rankingDimensions,
      },
      {
        key: "metric",
        label: "Ordenar por",
        kind: "select",
        options: [
          ...seriesMetrics,
          { value: "conversion", label: "Conversión" },
        ],
      },
      {
        key: "limit",
        label: "Mostrar",
        kind: "select",
        options: [
          { value: "5", label: "Top 5" },
          { value: "10", label: "Top 10" },
        ],
      },
    ],
    title: (config) =>
      `${rankingDimensions.find((item) => item.value === config.dimension)?.label ?? "QR y etiquetas"} con más ${
        config.metric === "conversion"
          ? "conversión"
          : metricLabel(config.metric).toLowerCase()
      }`,
  },
  funnel: {
    type: "funnel",
    name: "Embudo",
    description: "Cuántas aperturas terminan en clic y en solicitud.",
    help: "De cada 100 aperturas, cuántas terminan en un clic y cuántas en una solicitud (formulario enviado). Si la caída entre pasos es grande, revisa el contenido de tus páginas.",
    category: "rendimiento",
    frame: "titled",
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 7 },
    defaultConfig: {},
    fields: [],
    title: () => "De acceso a solicitud",
  },
  experienceTypes: {
    type: "experienceTypes",
    name: "Tipos de página",
    description: "Qué formatos (menú, perfil, formulario…) se abren más.",
    help: "Agrupa la actividad por tipo de página (menú, perfil, formulario, enlaces…) para ver qué formato funciona mejor con tus clientes.",
    category: "rendimiento",
    frame: "titled",
    defaultSize: { w: 4, h: 5 },
    minSize: { w: 3, h: 4 },
    maxSize: { w: 8, h: 7 },
    defaultConfig: { metric: "taps" },
    fields: [metricField],
    title: (config) => `${metricLabel(config.metric)} por tipo de página`,
  },
  silent: {
    type: "silent",
    name: "Sin accesos",
    description:
      "QR, etiquetas y links que no recibieron accesos en el periodo.",
    help: "QR, etiquetas y links que no recibieron accesos en el periodo. Revisa si la etiqueta, el QR o el link siguen en su lugar, si se ven bien o si conviene moverlos.",
    category: "rendimiento",
    frame: "titled",
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 8, h: 8 },
    defaultConfig: {},
    fields: [],
    title: () => "Sin accesos",
  },
};

export function widgetTitle(type: WidgetType, config: WidgetConfig): string {
  return widgetCatalog[type].title(config);
}
