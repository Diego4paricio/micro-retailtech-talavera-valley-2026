import dns from "node:dns";
import { TelegramPollingAdapter } from "./adapters/telegram.js";
import { loadBotConfig } from "./config.js";
import { BotOrchestrator } from "./handlers/orchestrator.js";
import { BotStateStore } from "./handlers/state.js";
import { KardoApiClient } from "./kardo/api-client.js";

dns.setDefaultResultOrder("ipv4first");

async function main() {
  const config = loadBotConfig();
  const api = new KardoApiClient(config);
  const state = new BotStateStore();
  const telegram = new TelegramPollingAdapter(config.telegramBotToken);
  const orchestrator = new BotOrchestrator(config, telegram, api, state);

  // Pre-verify Kardo Customer API & Supabase session in background without delaying Telegram polling startup
  void api
    .resolveActiveContext()
    .then((ctx) => {
      console.log(
        `✅ Conectado a Kardo API — Workspace: "${ctx.workspace.name}" (${ctx.workspace.id})`,
      );
      if (ctx.activeExperience) {
        console.log(
          `📄 Experiencia activa: "${ctx.activeExperience.name}" (${ctx.activeExperience.type})`,
        );
      }
      if (ctx.publicQrUrl) {
        console.log(`🔗 QR Público en vivo: ${ctx.publicQrUrl}`);
      }
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `⚠️ Aviso al iniciar: no se pudo consultar Kardo API todavía (${msg}). El bot de Telegram sigue activo y reintentará en cada mensaje.`,
      );
    });

  const shutdown = () => {
    console.log("\n🛑 Deteniendo Kardo Telegram Bot...");
    telegram.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await telegram.start((event) => orchestrator.handleEvent(event));
}

main().catch((err) => {
  console.error("❌ Error fatal en Kardo Bot:", err);
  process.exit(1);
});

