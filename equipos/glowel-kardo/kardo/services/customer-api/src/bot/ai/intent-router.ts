import type { ItemAvailabilityStatus } from "@kardo/contracts";

export interface CatalogItemContext {
  id: string;
  name: string;
  section: string | null;
  price: number | null;
  status: ItemAvailabilityStatus;
  quantity: number | null;
}

export type BotIntentResult =
  | {
      intent: "set_availability";
      changes: Array<{
        itemId: string;
        itemName: string;
        status: ItemAvailabilityStatus;
        quantity: number | null;
      }>;
      replySummary: string;
      transcript?: string;
    }
  | {
      intent: "update_prices";
      updates: Array<{
        itemId: string;
        itemName: string;
        newPrice: number;
      }>;
      replySummary: string;
      transcript?: string;
    }
  | {
      intent: "add_items";
      items: Array<{
        sectionName: string;
        name: string;
        price: number;
        description?: string;
      }>;
      replySummary: string;
      transcript?: string;
    }
  | {
      intent: "list_availability";
      transcript?: string;
    }
  | {
      intent: "show_menu";
      transcript?: string;
    }
  | {
      intent: "get_summary";
      transcript?: string;
    }
  | {
      intent: "show_qr";
      transcript?: string;
    }
  | {
      intent: "set_promo";
      promoText: string | null;
      replySummary: string;
      transcript?: string;
    }
  | {
      intent: "change_template";
      templateKey: "oscuro" | "tinta" | "terracota" | "editorial";
      replySummary: string;
      transcript?: string;
    }
  | {
      intent: "clarify";
      question: string;
      candidateItemIds: string[];
      transcript?: string;
    };

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  return JSON.parse(candidate) as Record<string, unknown>;
}

function buildSystemInstruction(
  businessName: string,
  experienceName: string,
  catalog: CatalogItemContext[],
): string {
  return `Eres el asistente operativo de "${businessName}" conectado al menú digital "${experienceName}" en Kardo.
El dueño del negocio te envía un mensaje de texto o una nota de voz en español mexicano coloquial para operar su negocio al instante sin abrir ningún panel web.

CATÁLOGO ACTUAL EN VIVO (usa SIEMPRE los "id" exactos de esta lista):
${JSON.stringify(catalog, null, 2)}

Devuelve ÚNICAMENTE un objeto JSON válido (sin bloques markdown) que cumpla con UNA de estas estructuras según la intención del dueño:

1. Si quiere marcar uno o varios platillos como agotados ("se acabó", "ya no hay", "apaga"), disponibles de nuevo ("ya salió", "ya hay", "prende", "activa"), ocultos ("esconde"), o indicar cuántas unidades quedan ("solo quedan 3 conchas"):
{
  "intent": "set_availability",
  "transcript": "texto transcrito si fue audio, o vacío",
  "replySummary": "frase corta confirmando el cambio en español",
  "changes": [
    {
      "itemId": "id-exacto-del-catalogo",
      "itemName": "Nombre del platillo",
      "status": "sold_out" | "available" | "hidden",
      "quantity": null
    }
  ]
}
Nota sobre quantity:
- Si dice "se acabó X" -> status: "sold_out", quantity: null
- Si dice "ya hay X" o "activa X" -> status: "available", quantity: null
- Si dice "quedan N de X" (con N > 0) -> status: "available", quantity: N

2. Si quiere cambiar el precio de uno o más platillos existentes ("sube el latte a 75", "pon los chilaquiles en 145", "baja el cold brew a 65"):
{
  "intent": "update_prices",
  "transcript": "texto transcrito si fue audio",
  "replySummary": "frase corta confirmando el nuevo precio",
  "updates": [
    {
      "itemId": "id-exacto-del-catalogo",
      "itemName": "Nombre del platillo",
      "newPrice": 75
    }
  ]
}

3. Si quiere agregar un platillo NUEVO que no existe en el catálogo ("agrega Pan de Muerto en Postres a 45 pesos"):
{
  "intent": "add_items",
  "transcript": "texto transcrito si fue audio",
  "replySummary": "frase corta confirmando qué se agregó",
  "items": [
    {
      "sectionName": "Postres",
      "name": "Pan de Muerto",
      "price": 45,
      "description": ""
    }
  ]
}

4. Si pregunta qué está agotado o quiere ver los botones de disponibilidad:
{ "intent": "list_availability", "transcript": "" }

5. Si pide ver el menú completo o lista de precios:
{ "intent": "show_menu", "transcript": "" }

6. Si pregunta cuántas visitas, escaneos, clientes o leads lleva hoy / resumen del negocio:
{ "intent": "get_summary", "transcript": "" }

7. Si pide el link o código QR de su negocio:
{ "intent": "show_qr", "transcript": "" }

8. Si quiere poner un anuncio, aviso o promoción en grande arriba del menú ("pon una promoción de 2x1 en Cold Brew", "pon aviso: hoy 20% de descuento", "anuncia que hay pan recién horneado") o quitar la promoción ("quita la promoción", "borra el anuncio"):
{
  "intent": "set_promo",
  "transcript": "texto transcrito si fue audio",
  "promoText": "¡2x1 en Cold Brew todo el día! (o null si pidió quitar la promoción)",
  "replySummary": "frase corta confirmando la promoción publicada"
}

9. Si quiere cambiar la plantilla, diseño, tema o colores del menú ("cambia la plantilla a oscuro", "pon diseño terracota", "pon tema claro editorial", "cambia el diseño a tinta profunda"):
{
  "intent": "change_template",
  "transcript": "texto transcrito si fue audio",
  "templateKey": "oscuro" | "tinta" | "terracota" | "editorial",
  "replySummary": "frase corta confirmando el nuevo diseño"
}
Nota sobre templateKey:
- "oscuro": oscuro, noche, dark, negro
- "tinta": tinta profunda, azul, degradado, moderno
- "terracota": terracota, café, cálido, crema, artesanal
- "editorial": editorial, papel, blanco, claro, minimalista

10. Si menciona algo ambiguo (ej. "se acabó el café" y hay varios cafés) o menciona un platillo que no encuentras en el catálogo:
{
  "intent": "clarify",
  "transcript": "texto transcrito si fue audio",
  "question": "Pregunta breve y amable para aclarar cuál platillo quiso decir",
  "candidateItemIds": ["id-1", "id-2"]
}`;
}

export async function routeOwnerIntentWithGemini(input: {
  apiKey: string;
  model?: string;
  businessName: string;
  experienceName: string;
  catalog: CatalogItemContext[];
  text?: string;
  voice?: { mimeType: string; base64: string };
}): Promise<BotIntentResult> {
  const primaryModel = input.model?.trim() || "gemini-3.5-flash-lite";
  const candidateModels = Array.from(
    new Set([primaryModel, "gemini-3-flash-preview"]),
  );

  const systemPrompt = buildSystemInstruction(
    input.businessName,
    input.experienceName,
    input.catalog,
  );

  const parts: Array<Record<string, unknown>> = [{ text: systemPrompt }];
  if (input.voice) {
    parts.push({
      inlineData: {
        mimeType: input.voice.mimeType || "audio/ogg",
        data: input.voice.base64,
      },
    });
    parts.push({
      text: "Escucha la nota de voz del dueño del negocio, transcribe lo que dijo en el campo 'transcript' y devuelve el JSON de intención.",
    });
  } else if (input.text) {
    parts.push({
      text: `Mensaje del dueño: "${input.text}"`,
    });
  }

  let rawText = "";
  let lastError = "";

  for (const model of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(input.apiKey)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18_000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        lastError = `HTTP ${response.status}: ${body.slice(0, 200)}`;
        continue;
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      rawText =
        payload.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("") ?? "";

      if (rawText.trim()) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!rawText.trim()) {
    throw new Error(`Gemini no devolvió respuesta (${lastError}).`);
  }

  const parsed = extractJsonObject(rawText);
  return normalizeIntentResult(parsed, input.catalog);
}

function normalizeIntentResult(
  raw: Record<string, unknown>,
  catalog: CatalogItemContext[],
): BotIntentResult {
  const knownById = new Map(catalog.map((it) => [it.id, it]));
  const intent = String(raw.intent ?? "clarify");
  const transcript =
    typeof raw.transcript === "string" && raw.transcript.trim()
      ? raw.transcript.trim()
      : undefined;

  if (intent === "set_availability" && Array.isArray(raw.changes)) {
    const validChanges = raw.changes
      .map((c) => {
        const item = (c && typeof c === "object" ? c : {}) as Record<
          string,
          unknown
        >;
        const itemId = String(item.itemId ?? "");
        const match = knownById.get(itemId);
        if (!match) return null;
        const statusRaw = String(item.status ?? "sold_out");
        const status: ItemAvailabilityStatus =
          statusRaw === "available" ||
          statusRaw === "sold_out" ||
          statusRaw === "hidden"
            ? statusRaw
            : "sold_out";
        const qtyRaw = item.quantity;
        const quantity =
          typeof qtyRaw === "number" &&
          Number.isInteger(qtyRaw) &&
          qtyRaw >= 0 &&
          qtyRaw <= 9999
            ? qtyRaw
            : null;
        return {
          itemId: match.id,
          itemName: match.name,
          status,
          quantity,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (validChanges.length > 0) {
      return {
        intent: "set_availability",
        changes: validChanges,
        replySummary:
          typeof raw.replySummary === "string" && raw.replySummary.trim()
            ? raw.replySummary.trim()
            : "Disponibilidad actualizada en vivo.",
        ...(transcript ? { transcript } : {}),
      };
    }
  }

  if (intent === "update_prices" && Array.isArray(raw.updates)) {
    const validUpdates = raw.updates
      .map((u) => {
        const item = (u && typeof u === "object" ? u : {}) as Record<
          string,
          unknown
        >;
        const itemId = String(item.itemId ?? "");
        const match = knownById.get(itemId);
        const priceNum = Number(item.newPrice);
        if (!match || !Number.isFinite(priceNum) || priceNum < 0) return null;
        return {
          itemId: match.id,
          itemName: match.name,
          newPrice: Math.round(priceNum * 100) / 100,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (validUpdates.length > 0) {
      return {
        intent: "update_prices",
        updates: validUpdates,
        replySummary:
          typeof raw.replySummary === "string" && raw.replySummary.trim()
            ? raw.replySummary.trim()
            : "Precios actualizados y publicados.",
        ...(transcript ? { transcript } : {}),
      };
    }
  }

  if (intent === "add_items" && Array.isArray(raw.items)) {
    const validItems = raw.items
      .map((it) => {
        const obj = (it && typeof it === "object" ? it : {}) as Record<
          string,
          unknown
        >;
        const name = String(obj.name ?? "").trim();
        const sectionName = String(obj.sectionName ?? "General").trim();
        const price = Number(obj.price);
        if (!name || !Number.isFinite(price) || price < 0) return null;
        const description =
          typeof obj.description === "string" && obj.description.trim()
            ? obj.description.trim()
            : undefined;
        return {
          sectionName: sectionName || "General",
          name,
          price: Math.round(price * 100) / 100,
          ...(description ? { description } : {}),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (validItems.length > 0) {
      return {
        intent: "add_items",
        items: validItems,
        replySummary:
          typeof raw.replySummary === "string" && raw.replySummary.trim()
            ? raw.replySummary.trim()
            : "Platillo agregado y publicado.",
        ...(transcript ? { transcript } : {}),
      };
    }
  }

  if (intent === "list_availability") {
    return {
      intent: "list_availability",
      ...(transcript ? { transcript } : {}),
    };
  }
  if (intent === "show_menu") {
    return {
      intent: "show_menu",
      ...(transcript ? { transcript } : {}),
    };
  }
  if (intent === "get_summary") {
    return {
      intent: "get_summary",
      ...(transcript ? { transcript } : {}),
    };
  }
  if (intent === "show_qr") {
    return {
      intent: "show_qr",
      ...(transcript ? { transcript } : {}),
    };
  }

  if (intent === "set_promo") {
    const rawPromo = raw.promoText;
    const promoText =
      typeof rawPromo === "string" && rawPromo.trim() ? rawPromo.trim() : null;
    return {
      intent: "set_promo",
      promoText,
      replySummary:
        typeof raw.replySummary === "string" && raw.replySummary.trim()
          ? raw.replySummary.trim()
          : promoText
            ? "Promoción destacada publicada en tu menú QR."
            : "Promoción retirada del menú QR.",
      ...(transcript ? { transcript } : {}),
    };
  }

  if (intent === "change_template") {
    const keyRaw = String(raw.templateKey ?? "tinta").toLowerCase();
    const templateKey: "oscuro" | "tinta" | "terracota" | "editorial" =
      keyRaw === "oscuro" ||
      keyRaw === "tinta" ||
      keyRaw === "terracota" ||
      keyRaw === "editorial"
        ? keyRaw
        : "tinta";
    return {
      intent: "change_template",
      templateKey,
      replySummary:
        typeof raw.replySummary === "string" && raw.replySummary.trim()
          ? raw.replySummary.trim()
          : "Plantilla del menú actualizada en vivo.",
      ...(transcript ? { transcript } : {}),
    };
  }

  const candidateItemIds = Array.isArray(raw.candidateItemIds)
    ? raw.candidateItemIds
        .map((id) => String(id))
        .filter((id) => knownById.has(id))
        .slice(0, 6)
    : [];

  return {
    intent: "clarify",
    question:
      typeof raw.question === "string" && raw.question.trim()
        ? raw.question.trim()
        : "¿Cuál platillo del menú quieres modificar? Puedes tocar uno de los botones de abajo:",
    candidateItemIds,
    ...(transcript ? { transcript } : {}),
  };
}

