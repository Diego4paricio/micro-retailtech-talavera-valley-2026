import {
  CatalogExperienceContentSchema,
  type ExperienceContentByType,
  MenuExperienceContentSchema,
} from "@kardo/contracts";
import { Value } from "@sinclair/typebox/value";

type MenuExperienceContent = ExperienceContentByType["menu"];
type CatalogExperienceContent = ExperienceContentByType["catalog"];

export type ExtractableExperienceType = "menu" | "catalog";

export type ExtractedExperienceResult =
  | { type: "menu"; content: MenuExperienceContent }
  | { type: "catalog"; content: CatalogExperienceContent };

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function slugId(raw: unknown, fallback: string, used: Set<string>): string {
  const base = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  const stem = base || fallback;
  let candidate = stem;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${stem.slice(0, 52)}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function safeText(raw: unknown, fallback: string, maxLen = 120): string {
  const text = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  return text.slice(0, maxLen);
}

function optionalText(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLen) : undefined;
}

function optionalPrice(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const num =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(num) || num < 0 || num > 10_000_000) return undefined;
  return Math.round(num * 100) / 100;
}

function normalizeCurrency(raw: unknown): string {
  const code = String(raw ?? "MXN")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "MXN";
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate);
}

function normalizeMenu(raw: Record<string, unknown>): MenuExperienceContent {
  const usedSectionIds = new Set<string>();
  const usedItemIds = new Set<string>();

  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sections = rawSections
    .slice(0, 20)
    .map((sec, sIdx) => {
      const s = (sec && typeof sec === "object" ? sec : {}) as Record<
        string,
        unknown
      >;
      const rawItems = Array.isArray(s.items) ? s.items : [];
      const items = rawItems
        .slice(0, 50)
        .map((it, iIdx) => {
          const item = (it && typeof it === "object" ? it : {}) as Record<
            string,
            unknown
          >;
          const name = safeText(item.name, "");
          if (!name) return null;
          const description = optionalText(item.description, 200);
          const price = optionalPrice(item.price);
          return {
            id: slugId(item.id ?? name, `item-${sIdx + 1}-${iIdx + 1}`, usedItemIds),
            name,
            ...(description ? { description } : {}),
            ...(price !== undefined ? { price } : {}),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (items.length === 0) return null;
      const name = safeText(s.name, `Sección ${sIdx + 1}`);
      return {
        id: slugId(s.id ?? name, `sec-${sIdx + 1}`, usedSectionIds),
        name,
        items,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (sections.length === 0) {
    throw new Error(
      "No se detectaron platillos o productos claros en la imagen. Intenta con una foto más cercana y bien iluminada.",
    );
  }

  const description = optionalText(raw.description, 500);
  const content: MenuExperienceContent = {
    title: safeText(raw.title, "Menú del día"),
    ...(description ? { description } : {}),
    currency: normalizeCurrency(raw.currency),
    sections,
  };

  if (!Value.Check(MenuExperienceContentSchema, content)) {
    throw new Error("La estructura extraída no cumple el formato de menú.");
  }
  return content;
}

function normalizeCatalog(
  raw: Record<string, unknown>,
): CatalogExperienceContent {
  const usedItemIds = new Set<string>();
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems
    .slice(0, 100)
    .map((it, idx) => {
      const item = (it && typeof it === "object" ? it : {}) as Record<
        string,
        unknown
      >;
      const name = safeText(item.name, "");
      if (!name) return null;
      const description = optionalText(item.description, 300);
      const price = optionalPrice(item.price);
      return {
        id: slugId(item.id ?? name, `prod-${idx + 1}`, usedItemIds),
        name,
        ...(description ? { description } : {}),
        ...(price !== undefined ? { price } : {}),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length === 0) {
    throw new Error(
      "No se detectaron productos claros en la imagen. Intenta con una foto más nítida.",
    );
  }

  const description = optionalText(raw.description, 500);
  const content: CatalogExperienceContent = {
    title: safeText(raw.title, "Catálogo de productos"),
    ...(description ? { description } : {}),
    currency: normalizeCurrency(raw.currency),
    items,
  };

  if (!Value.Check(CatalogExperienceContentSchema, content)) {
    throw new Error("La estructura extraída no cumple el formato de catálogo.");
  }
  return content;
}

export async function extractExperienceFromImage(input: {
  apiKey: string;
  model: string;
  imageBase64: string;
  mimeType: string;
  type: ExtractableExperienceType;
}): Promise<ExtractedExperienceResult> {
  const mimeType = ALLOWED_MIME_TYPES.has(input.mimeType)
    ? input.mimeType
    : "image/jpeg";

  const prompt =
    input.type === "menu"
      ? [
          "Eres un asistente que digitaliza menús de negocios mexicanos a partir de una foto (pizarrón, libreta, lona o menú impreso).",
          "Extrae TODOS los platillos, bebidas y precios visibles.",
          "Devuelve ÚNICAMENTE un objeto JSON válido con esta forma exacta:",
          '{ "title": string, "description"?: string, "currency": "MXN", "sections": [{ "name": string, "items": [{ "name": string, "description"?: string, "price"?: number }] }] }',
          "Reglas: si no hay secciones claras agrupa todo en una sección 'Menú'; los precios deben ser números sin símbolo '$'; si un producto no tiene precio visible omite 'price'; escribe en español natural y corrige faltas obvias de ortografía sin inventar productos.",
        ].join("\n")
      : [
          "Eres un asistente que digitaliza listas de precios o catálogos de micro-comercios mexicanos a partir de una foto (libreta, pizarrón, cartel o hoja impresa).",
          "Extrae TODOS los productos y precios visibles.",
          "Devuelve ÚNICAMENTE un objeto JSON válido con esta forma exacta:",
          '{ "title": string, "description"?: string, "currency": "MXN", "items": [{ "name": string, "description"?: string, "price"?: number }] }',
          "Reglas: los precios deben ser números sin símbolo '$'; si un producto no tiene precio visible omite 'price'; escribe en español natural sin inventar productos.",
        ].join("\n");

  const candidates = Array.from(
    new Set([input.model, "gemini-3.5-flash-lite", "gemini-3-flash-preview"]),
  );

  let response: Response | null = null;
  let lastError = "";
  for (const model of candidates) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType, data: input.imageBase64 } },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (res.ok) {
        response = res;
        break;
      }
      lastError = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
      if (res.status !== 503 && res.status !== 429 && res.status !== 404) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Timeout";
    }
  }

  if (!response) {
    throw new Error(`Gemini no pudo responder a tiempo (${lastError}).`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini no devolvió contenido legible para esta imagen.");
  }

  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("La respuesta de Gemini no fue un objeto JSON válido.");
  }

  const record = parsed as Record<string, unknown>;
  if (input.type === "menu") {
    return { type: "menu", content: normalizeMenu(record) };
  }
  return { type: "catalog", content: normalizeCatalog(record) };
}

