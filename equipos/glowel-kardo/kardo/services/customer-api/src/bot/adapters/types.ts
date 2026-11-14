export interface InlineButton {
  label: string;
  callbackData?: string;
  url?: string;
}

export type InlineKeyboard = InlineButton[][];

export interface IncomingBotEvent {
  channel: "telegram" | "whatsapp";
  chatId: string;
  senderName?: string;
  messageId?: number | string;
  text?: string;
  voice?: {
    mimeType: string;
    base64: string;
    durationSeconds?: number;
  };
  photo?: {
    mimeType: string;
    base64: string;
    caption?: string;
  };
  callbackQuery?: {
    id: string;
    data: string;
    messageId?: number | string;
  };
}

export interface MessagingChannelAdapter {
  readonly channel: "telegram" | "whatsapp";
  start(onEvent: (event: IncomingBotEvent) => Promise<void>): Promise<void>;
  stop(): void;
  sendMessage(
    chatId: string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<number | string | undefined>;
  editMessage(
    chatId: string,
    messageId: number | string,
    text: string,
    keyboard?: InlineKeyboard,
  ): Promise<void>;
  answerCallback(
    callbackQueryId: string,
    toastText?: string,
  ): Promise<void>;
  sendTyping(chatId: string): Promise<void>;
}

