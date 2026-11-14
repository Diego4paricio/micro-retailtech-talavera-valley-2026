export interface BotConfig {
  telegramBotToken: string;
  geminiApiKey: string;
  geminiModel: string;
  customerApiBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  demoEmail: string;
  demoPassword: string;
  publicResolverUrl: string;
}

export function loadBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!telegramBotToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN in environment (.env).");
  }

  const geminiApiKey = env.GEMINI_API_KEY?.trim();
  if (!geminiApiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment (.env).");
  }

  const supabaseUrl = env.SUPABASE_URL?.trim()?.replace(/\/$/, "");
  const supabaseAnonKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in environment (.env).",
    );
  }

  const demoEmail = env.DEMO_EMAIL?.trim() || "demo@kardo.test";
  const demoPassword = env.DEMO_PASSWORD?.trim();
  if (!demoPassword) {
    throw new Error("Missing DEMO_PASSWORD in environment (.env).");
  }

  const port = env.CUSTOMER_API_PORT?.trim() || "3001";
  const customerApiBaseUrl =
    env.BOT_CUSTOMER_API_URL?.trim()?.replace(/\/$/, "") ||
    `http://127.0.0.1:${port}`;

  const publicResolverUrl = (
    env.VITE_TAP_RESOLVER_URL?.trim() ||
    env.TAP_RESOLVER_URL?.trim() ||
    "http://127.0.0.1:8787"
  ).replace(/\/$/, "");

  return {
    telegramBotToken,
    geminiApiKey,
    geminiModel: env.GEMINI_SCAN_MODEL?.trim() || "gemini-3.5-flash-lite",
    customerApiBaseUrl,
    supabaseUrl,
    supabaseAnonKey,
    demoEmail,
    demoPassword,
    publicResolverUrl,
  };
}

