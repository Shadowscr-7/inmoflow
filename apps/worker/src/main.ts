import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";
import { validateEnv } from "@inmoflow/shared";

async function bootstrap() {
  // Validate environment variables at startup — crash early on bad config
  const env = validateEnv();

  // Warn about critical worker-specific vars
  const warnings: string[] = [];
  if (!env.EVOLUTION_API_URL) warnings.push("EVOLUTION_API_URL (messages won't be sent via WhatsApp)");
  if (!env.EVOLUTION_API_KEY) warnings.push("EVOLUTION_API_KEY");
  if (!env.TELEGRAM_BOT_TOKEN) warnings.push("TELEGRAM_BOT_TOKEN (Telegram messages won't be sent)");
  if (warnings.length > 0) {
    Logger.warn(
      `Worker env vars missing: ${warnings.join(", ")}`,
      "Worker",
    );
  }

  const app = await NestFactory.createApplicationContext(WorkerModule);
  Logger.log("🔧 Worker started — listening for jobs", "Worker");

  // Graceful shutdown
  const shutdown = async () => {
    Logger.log("Shutting down worker...", "Worker");
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

bootstrap();
