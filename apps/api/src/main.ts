import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { validateEnv } from "@inmoflow/shared";

async function bootstrap() {
  // Validate environment variables at startup — crash early on bad config
  const env = validateEnv();

  const app = await NestFactory.create(AppModule);
  const port = env.API_PORT;

  // Increase body parser limit for CSV import (2 MB)
  // The 'verify' callback stores the raw body buffer so webhooks can verify HMAC signatures
  app.use(json({
    limit: "3mb",
    verify: (req: any, _res, buf) => { req.rawBody = buf; },
  }));
  app.use(urlencoded({ extended: true, limit: "3mb" }));

  // Security headers
  app.use(helmet());

  // CORS — restrict in production
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : ["http://localhost:3000"];
  app.enableCors({ origin: allowedOrigins, credentials: true });

  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port);
  Logger.log(`🚀 API running on http://localhost:${port}/api`, "Bootstrap");
}

bootstrap();
