import type {
  AvailabilityExperience,
  ExperienceContent,
  ExperienceContentByType,
  ExperienceTheme,
  ItemAvailabilityChange,
} from "@kardo/contracts";
import type {
  IncomingBotEvent,
  InlineKeyboard,
  MessagingChannelAdapter,
} from "../adapters/types.js";
import {
  type CatalogItemContext,
  routeOwnerIntentWithGemini,
} from "../ai/intent-router.js";
import type { BotConfig } from "../config.js";
import type {
  ActiveWorkspaceContext,
  KardoApiClient,
} from "../kardo/api-client.js";
import type { BotStateStore } from "./state.js";

type MenuContent = ExperienceContentByType["menu"];
type CatalogContent = ExperienceContentByType["catalog"];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugId(raw: string, used: Set<string>): string {
  const stem =
    raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item";
  let candidate = stem;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${stem}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function buildCatalogContext(
  availExp: AvailabilityExperience | null,
): CatalogItemContext[] {
  if (!availExp) return [];
  const items: CatalogItemContext[] = [];
  for (const sec of availExp.sections) {
    for (const it of sec.items) {
      items.push({
        id: it.id,
        name: it.name,
        section: sec.name,
        price: it.price ?? null,
        status: it.status,
        quantity: it.quantity,
      });
    }
  }
  return items;
}

function statusBadge(
  status: "available" | "sold_out" | "hidden",
  quantity: number | null,
): string {
  if (status === "sold_out" || quantity === 0) return "🔴 AGOTADO";
  if (status === "hidden") return "⚫ Oculto";
  if (quantity !== null && quantity > 0) return `🟡 Quedan ${quantity}`;
  return "🟢 Disponible";
}

type PhotoTemplateKey = "oscuro" | "tinta" | "terracota" | "editorial";

const PHOTO_TEMPLATE_THEMES: Record<
  PhotoTemplateKey,
  { label: string; theme: ExperienceTheme }
> = {
  oscuro: {
    label: "Kardo oscuro",
    theme: {
      background: { kind: "solid", color: "#08293d" },
      surface: "dark",
      accent: "#8ce0dc",
      buttonStyle: "pill",
      font: "sans",
    },
  },
  tinta: {
    label: "Tinta profunda",
    theme: {
      background: { kind: "gradient", color: "#08293d", colorTo: "#0d637d", angle: 160 },
      surface: "dark",
      accent: "#8ce0dc",
      buttonStyle: "outline",
      font: "sans",
    },
  },
  terracota: {
    label: "Terracota",
    theme: {
      background: { kind: "solid", color: "#f3f0e8" },
      surface: "light",
      accent: "#b5533c",
      buttonStyle: "rounded",
      font: "serif",
    },
  },
  editorial: {
    label: "Papel editorial",
    theme: {
      background: { kind: "solid", color: "#fffefa" },
      surface: "light",
      accent: "#08293d",
      buttonStyle: "rounded",
      font: "serif",
    },
  },
};

function pickTemplateTheme(
  caption?: string,
  existingTheme?: ExperienceTheme,
): { label: string; theme: ExperienceTheme } {
  const lower = (caption ?? "").toLowerCase();
  if (lower.includes("terracota") || lower.includes("cafe") || lower.includes("café")) {
    return PHOTO_TEMPLATE_THEMES.terracota;
  }
  if (lower.includes("editorial") || lower.includes("papel") || lower.includes("claro")) {
    return PHOTO_TEMPLATE_THEMES.editorial;
  }
  if (lower.includes("tinta") || lower.includes("degradado")) {
    return PHOTO_TEMPLATE_THEMES.tinta;
  }
  if (lower.includes("oscuro") || lower.includes("dark")) {
    return PHOTO_TEMPLATE_THEMES.oscuro;
  }
  if (existingTheme) {
    return { label: "Plantilla actual", theme: existingTheme };
  }
  return PHOTO_TEMPLATE_THEMES.tinta;
}

export class BotOrchestrator {
  constructor(
    private readonly config: BotConfig,
    private readonly adapter: MessagingChannelAdapter,
    private readonly api: KardoApiClient,
    private readonly state: BotStateStore,
  ) {}

  public async handleEvent(event: IncomingBotEvent): Promise<void> {
    try {
      if (event.callbackQuery) {
        await this.handleCallbackQuery(event);
        return;
      }

      if (event.photo) {
        await this.handlePhotoUpload(event);
        return;
      }

      if (event.voice) {
        await this.handleNaturalInput(event);
        return;
      }

      if (event.text) {
        const trimmed = event.text.trim();
        if (trimmed.startsWith("/")) {
          await this.handleSlashCommand(event, trimmed);
          return;
        }
        await this.handleNaturalInput(event);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[BotOrchestrator] Error:", msg);
      const isDbTimeout =
        msg.includes("500") ||
        msg.includes("CONNECT_TIMEOUT") ||
        msg.includes("6543");
      const hint = isDbTimeout
        ? "\n\n💡 <i>Tip: Si tu Mac está en el Wi-Fi que bloquea el puerto 6543 de Supabase, conéctala al Hotspot de tu celular y vuelve a mandar el mensaje.</i>"
        : "";
      await this.adapter.sendMessage(
        event.chatId,
        `⚠️ <b>Ocurrió un error al procesar tu solicitud:</b>\n<code>${escapeHtml(msg.slice(0, 260))}</code>${hint}`,
      );
    }
  }

  private async getContext(chatId: string): Promise<ActiveWorkspaceContext> {
    const session = this.state.get(chatId);
    return this.api.resolveActiveContext(session.preferredExperienceId);
  }

  private async handleSlashCommand(
    event: IncomingBotEvent,
    rawCommand: string,
  ): Promise<void> {
    const cmd = (rawCommand.split(/\s+/)[0] ?? "")
      .toLowerCase()
      .replace(/@.*$/, "");

    switch (cmd) {
      case "/start":
      case "/ayuda":
      case "/help":
        await this.sendWelcome(event.chatId, event.senderName);
        return;
      case "/disponibilidad":
      case "/agotados":
        await this.sendAvailabilityBoard(event.chatId);
        return;
      case "/menu":
      case "/catalogo":
        await this.sendCurrentMenu(event.chatId);
        return;
      case "/qr":
        await this.sendQrInfo(event.chatId);
        return;
      case "/resumen":
        await this.sendSummary(event.chatId);
        return;
      case "/plantilla":
      case "/diseno":
      case "/diseño":
        await this.sendTemplatePicker(event.chatId);
        return;
      case "/promo":
      case "/promocion":
      case "/promoción":
        await this.sendPromoPicker(event.chatId);
        return;
      default:
        await this.handleNaturalInput(event);
    }
  }

  private async sendWelcome(
    chatId: string,
    senderName?: string,
  ): Promise<void> {
    await this.adapter.sendTyping(chatId);
    const ctx = await this.getContext(chatId);
    const greeting = senderName ? `¡Hola, <b>${escapeHtml(senderName)}</b>!` : "¡Hola!";
    const expName = ctx.activeExperience?.name ?? "Sin menú activo";
    const tpName = ctx.primaryTouchpoint?.operationalName ?? "QR";

    const text = [
      `${greeting} Soy el asistente de operación en vivo de <b>${escapeHtml(ctx.workspace.name)}</b> ☕️`,
      "",
      `📄 <b>Menú activo:</b> ${escapeHtml(expName)}`,
      `📍 <b>Touchpoint QR:</b> ${escapeHtml(tpName)}`,
      "",
      "<b>¿Qué puedes hacer desde este chat sin abrir el panel?</b>",
      "1️⃣ <b>Disponibilidad al instante:</b> Escribe o manda 🎙️ nota de voz diciendo <i>\"Se acabó el Cold Brew\"</i> o <i>\"Solo quedan 3 órdenes de chilaquiles\"</i>.",
      "2️⃣ <b>Botones de 1 toque:</b> Toca <b>📦 Disponibilidad</b> abajo para prender o apagar platillos con un dedo.",
      "3️⃣ <b>Cambiar precios o agregar platillos:</b> Di <i>\"Sube el Latte de Olla a 75\"</i> o <i>\"Agrega Pan de Muerto en Postres a 45\"</i>.",
      "4️⃣ <b>Promoción en grande o cambiar plantilla:</b> Di <i>\"Pon promoción: 2x1 en Cold Brew hoy\"</i> o toca <b>🎨 Plantilla / 🔥 Promo</b> abajo.",
      "5️⃣ <b>Foto → Menú con IA:</b> Mándame una 📸 <b>foto</b> de tu pizarrón o carta impresa y la publico directo en tu QR.",
    ].join("\n");

    const keyboard: InlineKeyboard = [
      [
        { label: "📦 Disponibilidad (1-Toque)", callbackData: "cmd:avail" },
        { label: "📋 Ver Menú", callbackData: "cmd:menu" },
      ],
      [
        { label: "🔥 Promo en Grande", callbackData: "cmd:promo" },
        { label: "🎨 Cambiar Plantilla", callbackData: "cmd:templates" },
      ],
      [
        { label: "📊 Resumen de Hoy", callbackData: "cmd:summary" },
        ...(ctx.publicQrUrl
          ? [{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]
          : [{ label: "🔗 Ver QR", callbackData: "cmd:qr" }]),
      ],
    ];

    await this.adapter.sendMessage(chatId, text, keyboard);
  }

  private buildAvailabilityBoardPayload(
    chatId: string,
    ctx: ActiveWorkspaceContext,
  ): { text: string; keyboard: InlineKeyboard } {
    const availExp = ctx.availabilityExp;
    if (!availExp) {
      return {
        text: "⚠️ Aún no tienes un menú o catálogo activo. Mándame una 📸 <b>foto de tu menú</b> para crearlo y publicarlo automáticamente.",
        keyboard: [],
      };
    }

    const catalog = buildCatalogContext(availExp);
    this.state.setItemIndexMap(
      chatId,
      catalog.map((c) => c.id),
    );

    const soldOutCount = catalog.filter(
      (c) => c.status === "sold_out" || c.quantity === 0,
    ).length;

    const lines = [
      `📦 <b>Disponibilidad en Vivo · ${escapeHtml(availExp.name)}</b>`,
      `<i>Toca cualquier platillo para marcarlo como 🔴 AGOTADO o 🟢 DISPONIBLE al instante en tu QR (${soldOutCount} agotados de ${catalog.length}).</i>`,
    ];

    const keyboard: InlineKeyboard = [];
    catalog.forEach((item, idx) => {
      const isSoldOut = item.status === "sold_out" || item.quantity === 0;
      const icon = isSoldOut
        ? "🔴"
        : item.quantity !== null
          ? `🟡 (${item.quantity})`
          : "🟢";
      const priceLabel =
        item.price !== null ? ` · $${item.price}` : "";
      const stateSuffix = isSoldOut ? " [AGOTADO]" : "";
      keyboard.push([
        {
          label: `${icon} ${item.name}${priceLabel}${stateSuffix}`,
          callbackData: `t:${idx}`,
        },
      ]);
    });

    const bottomRow = [
      ...(soldOutCount > 0
        ? [{ label: "✅ Activar todos", callbackData: "cmd:all_avail" }]
        : []),
      ...(ctx.publicQrUrl
        ? [{ label: "🌐 Ver QR en Vivo", url: ctx.publicQrUrl }]
        : []),
    ];
    if (bottomRow.length > 0) {
      keyboard.push(bottomRow);
    }

    return { text: lines.join("\n"), keyboard };
  }

  private async sendAvailabilityBoard(
    chatId: string,
    editMessageId?: number | string,
  ): Promise<void> {
    if (!editMessageId) {
      await this.adapter.sendTyping(chatId);
    }
    const ctx = await this.getContext(chatId);
    const { text, keyboard } = this.buildAvailabilityBoardPayload(chatId, ctx);
    if (editMessageId !== undefined) {
      await this.adapter.editMessage(chatId, editMessageId, text, keyboard);
    } else {
      await this.adapter.sendMessage(chatId, text, keyboard);
    }
  }

  private async sendCurrentMenu(chatId: string): Promise<void> {
    await this.adapter.sendTyping(chatId);
    const ctx = await this.getContext(chatId);
    const availExp = ctx.availabilityExp;
    if (!availExp) {
      await this.adapter.sendMessage(
        chatId,
        "Aún no hay un menú publicado. Mándame una 📸 foto de tu menú o lista de precios para crearlo.",
      );
      return;
    }

    const lines: string[] = [
      `📋 <b>${escapeHtml(availExp.name)}</b> (${escapeHtml(availExp.currency)})`,
      `📍 QR: <b>${escapeHtml(ctx.primaryTouchpoint?.operationalName ?? "Mesa 1")}</b>`,
      "",
    ];

    for (const sec of availExp.sections) {
      if (sec.name) {
        lines.push(`<b>── ${escapeHtml(sec.name)} ──</b>`);
      }
      for (const it of sec.items) {
        const priceStr = it.price !== undefined ? `<b>$${it.price}</b>` : "";
        const badge = statusBadge(it.status, it.quantity);
        lines.push(`• ${escapeHtml(it.name)} ${priceStr} — ${badge}`);
      }
      lines.push("");
    }

    const keyboard: InlineKeyboard = [
      [
        { label: "📦 Cambiar disponibilidad (1-Toque)", callbackData: "cmd:avail" },
      ],
      [
        { label: "🔥 Promo en Grande", callbackData: "cmd:promo" },
        { label: "🎨 Cambiar Plantilla", callbackData: "cmd:templates" },
      ],
      ...(ctx.publicQrUrl
        ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
        : []),
    ];

    await this.adapter.sendMessage(chatId, lines.join("\n").trim(), keyboard);
  }

  private async sendTemplatePicker(chatId: string): Promise<void> {
    const ctx = await this.getContext(chatId);
    const text = [
      `🎨 <b>Cambiar Plantilla en Vivo · ${escapeHtml(ctx.activeExperience?.name ?? "Menú")}</b>`,
      "<i>Toca un estilo para aplicarlo y publicarlo al instante en tu QR (o pídelo por voz):</i>",
    ].join("\n");

    const keyboard: InlineKeyboard = [
      [
        { label: "🌊 Tinta Profunda (Degradado)", callbackData: "tpl:tinta" },
        { label: "🌙 Kardo Oscuro", callbackData: "tpl:oscuro" },
      ],
      [
        { label: "🏺 Terracota Café", callbackData: "tpl:terracota" },
        { label: "📜 Papel Editorial (Claro)", callbackData: "tpl:editorial" },
      ],
      ...(ctx.publicQrUrl
        ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
        : []),
    ];

    await this.adapter.sendMessage(chatId, text, keyboard);
  }

  private async sendPromoPicker(chatId: string): Promise<void> {
    const ctx = await this.getContext(chatId);
    const text = [
      `🔥 <b>Promoción Destacada en Vivo · ${escapeHtml(ctx.activeExperience?.name ?? "Menú")}</b>`,
      "<i>Toca una promoción rápida para mostrarla en GRANDE arriba de tu menú QR, o escribe/manda audio con cualquier promoción personalizada (ej. \"Pon promoción: 2x1 en Latte\"):</i>",
    ].join("\n");

    const keyboard: InlineKeyboard = [
      [
        {
          label: "🔥 ¡2x1 en Cold Brew por los próximos 30 min!",
          callbackData: "prm:1",
        },
      ],
      [
        {
          label: "🎉 ¡20% de descuento mencionando el Hackathon!",
          callbackData: "prm:2",
        },
      ],
      [
        {
          label: "🥐 Combo Mañanero: Café + Rol de Canela $95",
          callbackData: "prm:3",
        },
      ],
      [
        { label: "🗑️ Quitar promoción activa", callbackData: "prm:clear" },
        ...(ctx.publicQrUrl
          ? [{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]
          : []),
      ],
    ];

    await this.adapter.sendMessage(chatId, text, keyboard);
  }

  private async applyTemplateChange(
    chatId: string,
    templateKey: PhotoTemplateKey,
    voiceHeader = "",
  ): Promise<void> {
    const ctx = await this.getContext(chatId);
    const activeExp = ctx.activeExperience;
    if (!activeExp) {
      await this.adapter.sendMessage(
        chatId,
        "⚠️ Primero necesitas un menú activo para cambiar su plantilla.",
      );
      return;
    }

    const chosen = PHOTO_TEMPLATE_THEMES[templateKey] ?? PHOTO_TEMPLATE_THEMES.tinta;
    const previousContent = structuredClone(activeExp.content);
    this.state.setUndo(chatId, {
      kind: "experience_content",
      workspaceId: ctx.workspace.id,
      experienceId: activeExp.id,
      previousName: activeExp.name,
      previousContent,
      description: `Restaurar diseño anterior de "${activeExp.name}"`,
    });

    const nextContent = structuredClone(activeExp.content) as Record<
      string,
      unknown
    >;
    nextContent.theme = chosen.theme;
    // Clear Studio custom block layout so the selected theme renders immediately
    delete nextContent.design;

    await this.api.updateExperience(ctx.workspace.id, activeExp.id, {
      name: activeExp.name,
      content: nextContent as unknown as ExperienceContent,
    });
    await this.api.publishExperience(ctx.workspace.id, activeExp.id);

    const reply = [
      `${voiceHeader}🎨 <b>¡Plantilla actualizada en vivo en tu QR!</b>`,
      `Nuevo diseño activo: <b>${escapeHtml(chosen.label)}</b>`,
    ].join("\n");

    const keyboard: InlineKeyboard = [
      [
        { label: "↩️ Deshacer", callbackData: "undo" },
        { label: "🎨 Otra Plantilla", callbackData: "cmd:templates" },
      ],
      ...(ctx.publicQrUrl
        ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
        : []),
    ];

    await this.adapter.sendMessage(chatId, reply, keyboard);
  }

  private async applyPromoBanner(
    chatId: string,
    promoText: string | null,
    voiceHeader = "",
  ): Promise<void> {
    const ctx = await this.getContext(chatId);
    const activeExp = ctx.activeExperience;
    if (!activeExp) {
      await this.adapter.sendMessage(
        chatId,
        "⚠️ Primero necesitas un menú activo para publicar una promoción.",
      );
      return;
    }

    const previousContent = structuredClone(activeExp.content);
    this.state.setUndo(chatId, {
      kind: "experience_content",
      workspaceId: ctx.workspace.id,
      experienceId: activeExp.id,
      previousName: activeExp.name,
      previousContent,
      description: promoText
        ? `Quitar promoción "${promoText}"`
        : "Restaurar promoción anterior",
    });

    const nextContent = structuredClone(activeExp.content) as Record<
      string,
      unknown
    >;
    if (promoText && promoText.trim()) {
      const clean = promoText.trim().replace(/^🔥\s*/, "");
      nextContent.description = `🔥 ${clean}`;
    } else {
      delete nextContent.description;
    }

    await this.api.updateExperience(ctx.workspace.id, activeExp.id, {
      name: activeExp.name,
      content: nextContent as unknown as ExperienceContent,
    });
    await this.api.publishExperience(ctx.workspace.id, activeExp.id);

    const reply = promoText
      ? [
          `${voiceHeader}🔥 <b>¡Promoción en grande publicada arriba de tu menú QR!</b>`,
          "",
          `📣 <b>"${escapeHtml(promoText.replace(/^🔥\s*/, ""))}"</b>`,
        ].join("\n")
      : `${voiceHeader}✅ <b>Promoción retirada de tu menú QR en vivo.</b>`;

    const keyboard: InlineKeyboard = [
      [
        { label: "↩️ Deshacer", callbackData: "undo" },
        { label: "🗑️ Quitar Promo", callbackData: "prm:clear" },
      ],
      ...(ctx.publicQrUrl
        ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
        : []),
    ];

    await this.adapter.sendMessage(chatId, reply, keyboard);
  }

  private async sendQrInfo(chatId: string): Promise<void> {
    await this.adapter.sendTyping(chatId);
    const ctx = await this.getContext(chatId);

    const lines = [
      `🔗 <b>Touchpoints QR de ${escapeHtml(ctx.workspace.name)}</b>`,
      "",
    ];

    for (const tp of ctx.touchpoints) {
      const url = `${this.config.publicResolverUrl}/t/${tp.publicId}`;
      const liveName = tp.live?.experienceName ?? "Sin página asignada";
      const statusIcon = tp.status === "active" ? "🟢" : "⏸️";
      lines.push(
        `${statusIcon} <b>${escapeHtml(tp.operationalName)}</b> (${escapeHtml(liveName)})\n👉 <a href="${escapeHtml(url)}">${escapeHtml(url)}</a>\n`,
      );
    }

    const keyboard: InlineKeyboard = ctx.publicQrUrl
      ? [[{ label: "🌐 Abrir QR Principal", url: ctx.publicQrUrl }]]
      : [];

    await this.adapter.sendMessage(chatId, lines.join("\n").trim(), keyboard);
  }

  private async sendSummary(chatId: string): Promise<void> {
    await this.adapter.sendTyping(chatId);
    const ctx = await this.getContext(chatId);
    const [summary, leadsPage] = await Promise.all([
      this.api.getAnalyticsSummary(ctx.workspace.id),
      this.api.listLeads(ctx.workspace.id),
    ]);

    const catalog = buildCatalogContext(ctx.availabilityExp);
    const soldOutItems = catalog.filter(
      (c) => c.status === "sold_out" || c.quantity === 0,
    );

    const newLeads = leadsPage.items.filter((l) => l.status === "new");

    const lines = [
      `📊 <b>Resumen Operativo · ${escapeHtml(ctx.workspace.name)}</b>`,
      "",
      `🟢 <b>QRs activos:</b> ${summary.activeTouchpoints}`,
      `📱 <b>Escaneos / visitas (7 días):</b> ${summary.totals.taps} (QR: ${summary.totals.channels.qr}, NFC: ${summary.totals.channels.nfc})`,
      `👆 <b>Clics en botones:</b> ${summary.totals.clicks}`,
      `📬 <b>Contactos / Leads:</b> ${leadsPage.items.length} totales (${newLeads.length} por atender)`,
      "",
      `🍽️ <b>Menú en vivo:</b> ${escapeHtml(ctx.activeExperience?.name ?? "N/A")}`,
      `📦 <b>Platillos agotados hoy:</b> ${
        soldOutItems.length === 0
          ? "Ninguno (todo disponible ✅)"
          : soldOutItems.map((i) => escapeHtml(i.name)).join(", ")
      }`,
    ];

    if (newLeads.length > 0) {
      lines.push("", "<b>Últimos contactos por atender:</b>");
      for (const lead of newLeads.slice(0, 3)) {
        lines.push(
          `• <b>${escapeHtml(lead.name ?? lead.email)}</b> (${escapeHtml(lead.email)})${lead.message ? `: <i>"${escapeHtml(lead.message.slice(0, 80))}"</i>` : ""}`,
        );
      }
    }

    const keyboard: InlineKeyboard = [
      [
        { label: "📦 Disponibilidad (1-Toque)", callbackData: "cmd:avail" },
        { label: "📋 Ver Menú", callbackData: "cmd:menu" },
      ],
      ...(ctx.publicQrUrl
        ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
        : []),
    ];

    await this.adapter.sendMessage(chatId, lines.join("\n"), keyboard);
  }

  private async handleCallbackQuery(event: IncomingBotEvent): Promise<void> {
    const cq = event.callbackQuery;
    if (!cq) return;
    const chatId = event.chatId;
    const data = cq.data;

    if (data === "cmd:avail") {
      await this.adapter.answerCallback(cq.id, "Cargando disponibilidad...");
      await this.sendAvailabilityBoard(chatId);
      return;
    }

    if (data === "cmd:menu") {
      await this.adapter.answerCallback(cq.id, "Cargando menú...");
      await this.sendCurrentMenu(chatId);
      return;
    }

    if (data === "cmd:summary") {
      await this.adapter.answerCallback(cq.id, "Consultando métricas...");
      await this.sendSummary(chatId);
      return;
    }

    if (data === "cmd:qr") {
      await this.adapter.answerCallback(cq.id);
      await this.sendQrInfo(chatId);
      return;
    }

    if (data === "cmd:templates") {
      await this.adapter.answerCallback(cq.id, "Elige una plantilla...");
      await this.sendTemplatePicker(chatId);
      return;
    }

    if (data === "cmd:promo") {
      await this.adapter.answerCallback(cq.id, "Promociones en vivo...");
      await this.sendPromoPicker(chatId);
      return;
    }

    if (data.startsWith("tpl:")) {
      const key = data.slice(4) as PhotoTemplateKey;
      await this.adapter.answerCallback(cq.id, "🎨 Aplicando plantilla en vivo...");
      await this.applyTemplateChange(chatId, key);
      return;
    }

    if (data.startsWith("prm:")) {
      const code = data.slice(4);
      const presets: Record<string, string | null> = {
        "1": "¡2x1 en Cold Brew por los próximos 30 minutos!",
        "2": "¡20% de descuento hoy mencionando el Hackathon!",
        "3": "Combo Mañanero: Café + Rol de Canela por $95",
        clear: null,
      };
      const promoText = code in presets ? (presets[code] ?? null) : null;
      await this.adapter.answerCallback(
        cq.id,
        promoText ? "🔥 Publicando promoción en QR..." : "Quitando promoción...",
      );
      await this.applyPromoBanner(chatId, promoText);
      return;
    }

    if (data === "cmd:all_avail") {
      const ctx = await this.getContext(chatId);
      const availExp = ctx.availabilityExp;
      if (!availExp) {
        await this.adapter.answerCallback(cq.id, "No hay menú activo");
        return;
      }
      const catalog = buildCatalogContext(availExp);
      const toRestore = catalog.filter(
        (c) => c.status !== "available" || c.quantity !== null,
      );
      if (toRestore.length === 0) {
        await this.adapter.answerCallback(
          cq.id,
          "Todos los platillos ya están disponibles",
        );
        return;
      }

      this.state.setUndo(chatId, {
        kind: "availability",
        workspaceId: ctx.workspace.id,
        experienceId: availExp.experienceId,
        previousItems: toRestore.map((c) => ({
          itemId: c.id,
          status: c.status,
          quantity: c.quantity,
        })),
        description: "Restaurar estado previo de disponibilidad",
      });

      await this.api.saveAvailability(
        ctx.workspace.id,
        availExp.experienceId,
        toRestore.map((c) => ({
          itemId: c.id,
          status: "available",
          quantity: null,
        })),
      );

      await this.adapter.answerCallback(
        cq.id,
        "✅ Todos los platillos activados en el QR",
      );
      await this.sendAvailabilityBoard(chatId, cq.messageId);
      return;
    }

    if (data === "undo") {
      await this.handleUndo(chatId, cq.id);
      return;
    }

    if (data.startsWith("t:")) {
      const idx = Number(data.slice(2));
      const ctx = await this.getContext(chatId);
      const availExp = ctx.availabilityExp;
      if (!availExp || !Number.isInteger(idx) || idx < 0) {
        await this.adapter.answerCallback(cq.id, "Platillo no encontrado");
        return;
      }

      const catalog = buildCatalogContext(availExp);
      const mappedId = this.state.getItemIdByIndex(chatId, idx);
      const target =
        (mappedId ? catalog.find((c) => c.id === mappedId) : undefined) ??
        catalog[idx];

      if (!target) {
        await this.adapter.answerCallback(cq.id, "Platillo no encontrado");
        return;
      }

      const currentlySoldOut =
        target.status === "sold_out" || target.quantity === 0;
      const nextStatus = currentlySoldOut ? "available" : "sold_out";

      this.state.setUndo(chatId, {
        kind: "availability",
        workspaceId: ctx.workspace.id,
        experienceId: availExp.experienceId,
        previousItems: [
          {
            itemId: target.id,
            status: target.status,
            quantity: target.quantity,
          },
        ],
        description: `${target.name} → ${target.status}`,
      });

      await this.api.saveAvailability(ctx.workspace.id, availExp.experienceId, [
        {
          itemId: target.id,
          status: nextStatus,
          quantity: null,
        },
      ]);

      const toast =
        nextStatus === "sold_out"
          ? `🔴 ${target.name}: AGOTADO en vivo`
          : `🟢 ${target.name}: DISPONIBLE en vivo`;
      await this.adapter.answerCallback(cq.id, toast);

      if (cq.messageId !== undefined) {
        await this.sendAvailabilityBoard(chatId, cq.messageId);
      }
      return;
    }

    await this.adapter.answerCallback(cq.id);
  }

  private async handleUndo(
    chatId: string,
    callbackId: string,
  ): Promise<void> {
    const undo = this.state.popUndo(chatId);
    if (!undo) {
      await this.adapter.answerCallback(
        callbackId,
        "No hay cambios recientes por deshacer",
      );
      return;
    }

    await this.adapter.answerCallback(callbackId, "↩️ Deshaciendo cambio...");

    if (undo.kind === "availability") {
      await this.api.saveAvailability(
        undo.workspaceId,
        undo.experienceId,
        undo.previousItems,
      );
      await this.adapter.sendMessage(
        chatId,
        `↩️ <b>Cambio revertido en vivo:</b> ${escapeHtml(undo.description)}`,
      );
      return;
    }

    if (undo.kind === "experience_content") {
      await this.api.updateExperience(undo.workspaceId, undo.experienceId, {
        name: undo.previousName,
        content: undo.previousContent,
      });
      await this.api.publishExperience(undo.workspaceId, undo.experienceId);
      await this.adapter.sendMessage(
        chatId,
        `↩️ <b>Menú revertido y republicado en el QR:</b> ${escapeHtml(undo.description)}`,
      );
    }
  }

  private async handlePhotoUpload(event: IncomingBotEvent): Promise<void> {
    const photo = event.photo;
    if (!photo) return;
    const chatId = event.chatId;

    const statusMsgId = await this.adapter.sendMessage(
      chatId,
      "📸 <b>Foto recibida.</b> Extrayendo platillos y precios con Gemini IA...",
    );

    const ctx = await this.getContext(chatId);
    const captionLower = (photo.caption ?? "").toLowerCase();
    const scanType: "menu" | "catalog" = captionLower.includes("catalog") ||
      captionLower.includes("catálogo")
      ? "catalog"
      : "menu";

    const extracted = await this.api.extractFromImage(ctx.workspace.id, {
      type: scanType,
      imageBase64: photo.base64,
      mimeType: photo.mimeType,
    });

    const cleanTitle =
      extracted.content.title.trim() ||
      (scanType === "menu" ? "Menú del Día" : "Catálogo");

    let targetExpId: string;
    const existingMenuExp = ctx.activeExperience;
    const existingTheme =
      existingMenuExp && "theme" in existingMenuExp.content
        ? (existingMenuExp.content as { theme?: ExperienceTheme }).theme
        : undefined;
    const chosenTemplate = pickTemplateTheme(photo.caption, existingTheme);
    const styledContent = {
      ...extracted.content,
      theme: chosenTemplate.theme,
    } as ExperienceContent;

    if (existingMenuExp && existingMenuExp.type === extracted.type) {
      this.state.setUndo(chatId, {
        kind: "experience_content",
        workspaceId: ctx.workspace.id,
        experienceId: existingMenuExp.id,
        previousName: existingMenuExp.name,
        previousContent: existingMenuExp.content,
        description: `Restaurar menú "${existingMenuExp.name}"`,
      });

      const updated = await this.api.updateExperience(
        ctx.workspace.id,
        existingMenuExp.id,
        {
          name: cleanTitle,
          content: styledContent,
        },
      );
      targetExpId = updated.id;

      if (
        ctx.primaryTouchpoint &&
        !updated.targets?.touchpointIds?.includes(ctx.primaryTouchpoint.id)
      ) {
        await this.api.setExperienceTargets(ctx.workspace.id, targetExpId, {
          touchpointIds: [ctx.primaryTouchpoint.id],
          groupIds: updated.targets?.groupIds ?? [],
        });
      }
    } else {
      const created = await this.api.createExperience(ctx.workspace.id, {
        name: cleanTitle,
        type: extracted.type,
        targets: {
          touchpointIds: ctx.primaryTouchpoint ? [ctx.primaryTouchpoint.id] : [],
          groupIds: [],
        },
        content: styledContent,
      } as Parameters<KardoApiClient["createExperience"]>[1]);
      targetExpId = created.id;
    }

    this.state.setPreferredExperience(chatId, targetExpId);
    await this.api.publishExperience(ctx.workspace.id, targetExpId);

    const previewLines: string[] = [];
    let totalItems = 0;

    if (extracted.type === "menu") {
      for (const sec of extracted.content.sections) {
        totalItems += sec.items.length;
        previewLines.push(`<b>${escapeHtml(sec.name)}</b>`);
        for (const it of sec.items.slice(0, 6)) {
          const p = it.price !== undefined ? ` — <b>$${it.price}</b>` : "";
          previewLines.push(`  • ${escapeHtml(it.name)}${p}`);
        }
      }
    } else {
      totalItems = extracted.content.items.length;
      for (const it of extracted.content.items.slice(0, 10)) {
        const p = it.price !== undefined ? ` — <b>$${it.price}</b>` : "";
        previewLines.push(`• ${escapeHtml(it.name)}${p}`);
      }
    }

    const summaryText = [
      `✅ <b>¡Menú extraído de la foto y publicado en vivo!</b>`,
      "",
      `🏷️ <b>Título:</b> ${escapeHtml(cleanTitle)}`,
      `🎨 <b>Diseño:</b> ${escapeHtml(chosenTemplate.label)}`,
      `🍽️ <b>Detectados:</b> ${totalItems} platillos`,
      `📍 <b>Publicado en QR:</b> ${escapeHtml(ctx.primaryTouchpoint?.operationalName ?? "Mesa 1")}`,
      "",
      ...previewLines,
    ].join("\n");

    const keyboard: InlineKeyboard = [
      [
        { label: "📦 Disponibilidad (1-Toque)", callbackData: "cmd:avail" },
        { label: "↩️ Deshacer", callbackData: "undo" },
      ],
      ...(ctx.publicQrUrl
        ? [[{ label: "🌐 Escanear / Abrir QR en Vivo", url: ctx.publicQrUrl }]]
        : []),
    ];

    if (statusMsgId !== undefined) {
      await this.adapter.editMessage(
        chatId,
        statusMsgId,
        summaryText,
        keyboard,
      );
    } else {
      await this.adapter.sendMessage(chatId, summaryText, keyboard);
    }
  }

  private async handleNaturalInput(event: IncomingBotEvent): Promise<void> {
    const chatId = event.chatId;
    await this.adapter.sendTyping(chatId);

    const ctx = await this.getContext(chatId);
    const availExp = ctx.availabilityExp;
    const activeExp = ctx.activeExperience;

    if (!availExp || !activeExp) {
      await this.adapter.sendMessage(
        chatId,
        "⚠️ Primero necesitas un menú activo. Mándame una 📸 <b>foto de tu menú</b> por aquí para crearlo en segundos.",
      );
      return;
    }

    const catalog = buildCatalogContext(availExp);
    this.state.setItemIndexMap(
      chatId,
      catalog.map((c) => c.id),
    );

    const routed = await routeOwnerIntentWithGemini({
      apiKey: this.config.geminiApiKey,
      model: this.config.geminiModel,
      businessName: ctx.workspace.name,
      experienceName: availExp.name,
      catalog,
      ...(event.text ? { text: event.text } : {}),
      ...(event.voice ? { voice: event.voice } : {}),
    });

    const voiceHeader =
      event.voice && routed.transcript
        ? `🎙️ <i>"${escapeHtml(routed.transcript)}"</i>\n\n`
        : "";

    if (routed.intent === "list_availability") {
      if (voiceHeader) {
        await this.adapter.sendMessage(chatId, voiceHeader.trim());
      }
      await this.sendAvailabilityBoard(chatId);
      return;
    }

    if (routed.intent === "show_menu") {
      if (voiceHeader) {
        await this.adapter.sendMessage(chatId, voiceHeader.trim());
      }
      await this.sendCurrentMenu(chatId);
      return;
    }

    if (routed.intent === "get_summary") {
      if (voiceHeader) {
        await this.adapter.sendMessage(chatId, voiceHeader.trim());
      }
      await this.sendSummary(chatId);
      return;
    }

    if (routed.intent === "show_qr") {
      if (voiceHeader) {
        await this.adapter.sendMessage(chatId, voiceHeader.trim());
      }
      await this.sendQrInfo(chatId);
      return;
    }

    if (routed.intent === "change_template") {
      await this.applyTemplateChange(chatId, routed.templateKey, voiceHeader);
      return;
    }

    if (routed.intent === "set_promo") {
      await this.applyPromoBanner(chatId, routed.promoText, voiceHeader);
      return;
    }

    if (routed.intent === "set_availability") {
      const currentById = new Map(catalog.map((c) => [c.id, c]));
      const previousItems: ItemAvailabilityChange[] = routed.changes.map(
        (ch) => {
          const prev = currentById.get(ch.itemId);
          return {
            itemId: ch.itemId,
            status: prev?.status ?? "available",
            quantity: prev?.quantity ?? null,
          };
        },
      );

      this.state.setUndo(chatId, {
        kind: "availability",
        workspaceId: ctx.workspace.id,
        experienceId: availExp.experienceId,
        previousItems,
        description: routed.changes.map((c) => c.itemName).join(", "),
      });

      await this.api.saveAvailability(
        ctx.workspace.id,
        availExp.experienceId,
        routed.changes.map((c) => ({
          itemId: c.itemId,
          status: c.status,
          quantity: c.quantity,
        })),
      );

      const changeLines = routed.changes.map((c) => {
        const badge = statusBadge(c.status, c.quantity);
        return `• <b>${escapeHtml(c.itemName)}</b> → ${badge}`;
      });

      const reply = [
        `${voiceHeader}⚡ <b>¡Actualizado al instante en tu QR!</b>`,
        escapeHtml(routed.replySummary),
        "",
        ...changeLines,
      ].join("\n");

      const keyboard: InlineKeyboard = [
        [
          { label: "↩️ Deshacer cambio", callbackData: "undo" },
          { label: "📦 Ver Disponibilidad", callbackData: "cmd:avail" },
        ],
        ...(ctx.publicQrUrl
          ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
          : []),
      ];

      await this.adapter.sendMessage(chatId, reply, keyboard);
      return;
    }

    if (routed.intent === "update_prices") {
      const previousContent = structuredClone(activeExp.content);
      this.state.setUndo(chatId, {
        kind: "experience_content",
        workspaceId: ctx.workspace.id,
        experienceId: activeExp.id,
        previousName: activeExp.name,
        previousContent,
        description: routed.updates
          .map((u) => `${u.itemName} ($${u.newPrice})`)
          .join(", "),
      });

      const updatesById = new Map(
        routed.updates.map((u) => [u.itemId, u.newPrice]),
      );
      const oldPriceById = new Map(catalog.map((c) => [c.id, c.price]));

      const nextContent = structuredClone(
        activeExp.content,
      ) as ExperienceContent;

      if (activeExp.type === "menu") {
        const menu = nextContent as MenuContent;
        for (const sec of menu.sections) {
          for (const it of sec.items) {
            const newPrice = updatesById.get(it.id);
            if (newPrice !== undefined) {
              it.price = newPrice;
            }
          }
        }
      } else if (activeExp.type === "catalog") {
        const cat = nextContent as CatalogContent;
        for (const it of cat.items) {
          const newPrice = updatesById.get(it.id);
          if (newPrice !== undefined) {
            it.price = newPrice;
          }
        }
      }

      await this.api.updateExperience(ctx.workspace.id, activeExp.id, {
        name: activeExp.name,
        content: nextContent,
      });
      await this.api.publishExperience(ctx.workspace.id, activeExp.id);

      const priceLines = routed.updates.map((u) => {
        const prev = oldPriceById.get(u.itemId);
        const prevStr = prev !== null && prev !== undefined ? `$${prev} → ` : "";
        return `• <b>${escapeHtml(u.itemName)}</b>: ${prevStr}<b>$${u.newPrice}</b>`;
      });

      const reply = [
        `${voiceHeader}💰 <b>¡Precios actualizados y publicados en el QR!</b>`,
        escapeHtml(routed.replySummary),
        "",
        ...priceLines,
      ].join("\n");

      const keyboard: InlineKeyboard = [
        [
          { label: "↩️ Deshacer", callbackData: "undo" },
          { label: "📋 Ver Menú", callbackData: "cmd:menu" },
        ],
        ...(ctx.publicQrUrl
          ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
          : []),
      ];

      await this.adapter.sendMessage(chatId, reply, keyboard);
      return;
    }

    if (routed.intent === "add_items") {
      const previousContent = structuredClone(activeExp.content);
      this.state.setUndo(chatId, {
        kind: "experience_content",
        workspaceId: ctx.workspace.id,
        experienceId: activeExp.id,
        previousName: activeExp.name,
        previousContent,
        description: `Quitar ${routed.items.map((i) => i.name).join(", ")}`,
      });

      const nextContent = structuredClone(
        activeExp.content,
      ) as ExperienceContent;
      const usedIds = new Set(catalog.map((c) => c.id));

      if (activeExp.type === "menu") {
        const menu = nextContent as MenuContent;
        const usedSecIds = new Set(menu.sections.map((s) => s.id));
        for (const newItem of routed.items) {
          let sec = menu.sections.find(
            (s) => s.name.toLowerCase() === newItem.sectionName.toLowerCase(),
          );
          if (!sec) {
            sec = {
              id: slugId(newItem.sectionName, usedSecIds),
              name: newItem.sectionName,
              items: [],
            };
            menu.sections.push(sec);
          }
          sec.items.push({
            id: slugId(newItem.name, usedIds),
            name: newItem.name,
            price: newItem.price,
            ...(newItem.description
              ? { description: newItem.description }
              : {}),
          });
        }
      } else if (activeExp.type === "catalog") {
        const cat = nextContent as CatalogContent;
        for (const newItem of routed.items) {
          cat.items.push({
            id: slugId(newItem.name, usedIds),
            name: newItem.name,
            price: newItem.price,
            ...(newItem.description
              ? { description: newItem.description }
              : {}),
          });
        }
      }

      await this.api.updateExperience(ctx.workspace.id, activeExp.id, {
        name: activeExp.name,
        content: nextContent,
      });
      await this.api.publishExperience(ctx.workspace.id, activeExp.id);

      const addedLines = routed.items.map(
        (i) =>
          `• <b>${escapeHtml(i.name)}</b> ($${i.price}) en <i>${escapeHtml(i.sectionName)}</i>`,
      );

      const reply = [
        `${voiceHeader}✨ <b>¡Platillo agregado y publicado en el QR!</b>`,
        escapeHtml(routed.replySummary),
        "",
        ...addedLines,
      ].join("\n");

      const keyboard: InlineKeyboard = [
        [
          { label: "↩️ Deshacer", callbackData: "undo" },
          { label: "📋 Ver Menú", callbackData: "cmd:menu" },
        ],
        ...(ctx.publicQrUrl
          ? [[{ label: "🌐 Abrir QR en Vivo", url: ctx.publicQrUrl }]]
          : []),
      ];

      await this.adapter.sendMessage(chatId, reply, keyboard);
      return;
    }

    // Fallback: clarify with candidate 1-tap buttons
    const candidateButtons: InlineKeyboard = [];
    for (const candidateId of routed.candidateItemIds) {
      const idx = catalog.findIndex((c) => c.id === candidateId);
      const item = catalog[idx];
      if (item && idx >= 0) {
        const isSoldOut = item.status === "sold_out" || item.quantity === 0;
        const icon = isSoldOut ? "🔴" : "🟢";
        candidateButtons.push([
          {
            label: `${icon} ${item.name}${item.price !== null ? ` ($${item.price})` : ""}`,
            callbackData: `t:${idx}`,
          },
        ]);
      }
    }

    candidateButtons.push([
      { label: "📦 Ver todos los platillos (1-Toque)", callbackData: "cmd:avail" },
    ]);

    await this.adapter.sendMessage(
      chatId,
      `${voiceHeader}🤔 ${escapeHtml(routed.question)}`,
      candidateButtons,
    );
  }
}

