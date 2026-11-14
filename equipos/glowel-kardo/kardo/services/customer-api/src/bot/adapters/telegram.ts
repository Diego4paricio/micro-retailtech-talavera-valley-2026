import type {
  IncomingBotEvent,
  InlineKeyboard,
  MessagingChannelAdapter,
} from "./types.js";

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramVoice {
  file_id: string;
  mime_type?: string;
  duration?: number;
}

interface TelegramDocument {
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  voice?: TelegramVoice;
  document?: TelegramDocument;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

function toTelegramInlineKeyboard(keyboard?: InlineKeyboard) {
  if (!keyboard || keyboard.length === 0) return undefined;
  return {
    inline_keyboard: keyboard.map((row) =>
      row.map((btn) => {
        if (btn.url) {
          return { text: btn.label, url: btn.url };
        }
        return {
          text: btn.label,
          callback_data: btn.callbackData ?? "noop",
        };
      }),
    ),
  };
}

export class TelegramPollingAdapter implements MessagingChannelAdapter {
  public readonly channel = "telegram" as const;
  private readonly apiBase: string;
  private readonly fileBase: string;
  private running = false;
  private offset = 0;
  private abortController: AbortController | null = null;

  constructor(private readonly botToken: string) {
    this.apiBase = `https://api.telegram.org/bot${botToken}`;
    this.fileBase = `https://api.telegram.org/file/bot${botToken}`;
  }

  private async callApi<T>(
    method: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs = 15_000,
  ): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const response = await fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: combinedSignal,
    });

    const payload = (await response.json()) as TelegramApiResponse<T>;
    if (!payload.ok) {
      throw new Error(
        `Telegram API ${method} failed (${response.status}): ${payload.description ?? "unknown error"}`,
      );
    }
    return payload.result;
  }

  private async downloadFileAsBase64(fileId: string): Promise<{
    base64: string;
    filePath: string;
  }> {
    const fileInfo = await this.callApi<{ file_path?: string }>("getFile", {
      file_id: fileId,
    });
    if (!fileInfo.file_path) {
      throw new Error("Telegram getFile did not return a file_path.");
    }
    const fileRes = await fetch(`${this.fileBase}/${fileInfo.file_path}`);
    if (!fileRes.ok) {
      throw new Error(`Failed to download Telegram file (${fileRes.status}).`);
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return { base64, filePath: fileInfo.file_path };
  }

  public async getBotInfo(): Promise<{ username?: string; firstName?: string }> {
    const me = await this.callApi<TelegramUser>("getMe");
    const result: { username?: string; firstName?: string } = {};
    if (me.username) result.username = me.username;
    if (me.first_name) result.firstName = me.first_name;
    return result;
  }

  public async registerCommands(): Promise<void> {
    await this.callApi("deleteWebhook", { drop_pending_updates: false });
    await this.callApi("setMyCommands", {
      commands: [
        {
          command: "disponibilidad",
          description: "Botones de 1 toque para agotar o activar platillos",
        },
        {
          command: "promo",
          description: "Publicar o quitar promoción en grande arriba del menú",
        },
        {
          command: "plantilla",
          description: "Cambiar el diseño visual de tu menú QR en vivo",
        },
        {
          command: "menu",
          description: "Ver platillos y precios actuales en vivo",
        },
        {
          command: "qr",
          description: "Ver enlace público de tu QR en vivo",
        },
        {
          command: "resumen",
          description: "Ver escaneos, visitas y contactos de hoy",
        },
        {
          command: "ayuda",
          description: "Ejemplos de notas de voz, fotos y comandos",
        },
      ],
    });
  }

  public async start(
    onEvent: (event: IncomingBotEvent) => Promise<void>,
  ): Promise<void> {
    this.running = true;
    const me = await this.getBotInfo();
    await this.registerCommands();
    console.log(
      `🤖 Kardo Telegram Bot conectado como @${me.username ?? "bot"} (${me.firstName ?? "Kardo"}) — Long-polling activo`,
    );

    while (this.running) {
      this.abortController = new AbortController();
      try {
        const updates = await this.callApi<TelegramUpdate[]>(
          "getUpdates",
          {
            offset: this.offset,
            timeout: 20,
            allowed_updates: ["message", "callback_query"],
          },
          this.abortController.signal,
          30_000,
        );

        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id + 1);
          try {
            const event = await this.normalizeUpdate(update);
            if (event) {
              console.log(
                `[TelegramBot] Evento recibido (${event.chatId}): ${
                  event.callbackQuery
                    ? `callback=${event.callbackQuery.data}`
                    : event.photo
                      ? "photo"
                      : event.voice
                        ? "voice"
                        : `text=${event.text ?? ""}`
                }`,
              );
              await onEvent(event);
            }
          } catch (err) {
            console.error("[TelegramBot] Error handling update:", err);
          }
        }
      } catch (err) {
        if (!this.running) break;
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("aborted")) {
          console.error("[TelegramBot] Polling error, retrying in 2s:", msg);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  }

  public stop(): void {
    this.running = false;
    this.abortController?.abort();
  }

  private async normalizeUpdate(
    update: TelegramUpdate,
  ): Promise<IncomingBotEvent | null> {
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat.id;
      if (!chatId || !cq.data) return null;
      const event: IncomingBotEvent = {
        channel: "telegram",
        chatId: String(chatId),
        callbackQuery: {
          id: cq.id,
          data: cq.data,
          ...(cq.message?.message_id !== undefined
            ? { messageId: cq.message.message_id }
            : {}),
        },
      };
      if (cq.from.first_name) event.senderName = cq.from.first_name;
      return event;
    }

    const msg = update.message;
    if (!msg) return null;

    const chatId = String(msg.chat.id);
    const baseEvent: IncomingBotEvent = {
      channel: "telegram",
      chatId,
      messageId: msg.message_id,
      ...(msg.from?.first_name ? { senderName: msg.from.first_name } : {}),
    };

    if (msg.photo && msg.photo.length > 0) {
      // Pick the largest photo size (last element in Telegram's array)
      const largest = msg.photo[msg.photo.length - 1];
      if (largest) {
        const { base64, filePath } = await this.downloadFileAsBase64(
          largest.file_id,
        );
        const ext = filePath.split(".").pop()?.toLowerCase();
        const mimeType =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";
        return {
          ...baseEvent,
          photo: {
            mimeType,
            base64,
            ...(msg.caption ? { caption: msg.caption } : {}),
          },
        };
      }
    }

    if (
      msg.document?.mime_type &&
      msg.document.mime_type.startsWith("image/")
    ) {
      const { base64 } = await this.downloadFileAsBase64(msg.document.file_id);
      return {
        ...baseEvent,
        photo: {
          mimeType: msg.document.mime_type,
          base64,
          ...(msg.caption ? { caption: msg.caption } : {}),
        },
      };
    }

    if (msg.voice) {
      const { base64 } = await this.downloadFileAsBase64(msg.voice.file_id);
      return {
        ...baseEvent,
        voice: {
          mimeType: msg.voice.mime_type || "audio/ogg",
          base64,
          ...(msg.voice.duration !== undefined
            ? { durationSeconds: msg.voice.duration }
            : {}),
        },
      };
    }

    if (typeof msg.text === "string" && msg.text.trim().length > 0) {
      return {
        ...baseEvent,
        text: msg.text.trim(),
      };
    }

    return null;
  }

  public async sendMessage(
    chatId: string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<number | undefined> {
    const replyMarkup = toTelegramInlineKeyboard(keyboard);
    const sent = await this.callApi<TelegramMessage>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return sent.message_id;
  }

  public async editMessage(
    chatId: string,
    messageId: number | string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<void> {
    const replyMarkup = toTelegramInlineKeyboard(keyboard);
    try {
      await this.callApi("editMessageText", {
        chat_id: chatId,
        message_id: Number(messageId),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Ignore Telegram's benign "message is not modified" error
      if (!msg.includes("message is not modified")) {
        throw err;
      }
    }
  }

  public async answerCallback(
    callbackQueryId: string,
    toastText?: string,
  ): Promise<void> {
    await this.callApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(toastText ? { text: toastText, show_alert: false } : {}),
    });
  }

  public async sendTyping(chatId: string): Promise<void> {
    try {
      await this.callApi("sendChatAction", {
        chat_id: chatId,
        action: "typing",
      });
    } catch {
      // Ignore typing indicator errors
    }
  }
}

