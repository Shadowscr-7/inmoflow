import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
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
