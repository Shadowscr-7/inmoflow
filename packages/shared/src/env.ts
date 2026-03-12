import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  API_PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  CORS_ORIGINS: z.string().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  PLATFORM_DOMAIN: z.string().default("tuplataforma.com"),
  WEBHOOK_BASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  MELI_CLIENT_ID: z.string().optional(),
  MELI_CLIENT_SECRET: z.string().optional(),
  MELI_REDIRECT_URI: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw?: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw ?? process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  // Stricter checks for production
  if (result.data.NODE_ENV === "production") {
    const required: string[] = [];
    const recommended: string[] = [];

    if (!result.data.ENCRYPTION_KEY) required.push("ENCRYPTION_KEY");
    if (!result.data.REDIS_PASSWORD) required.push("REDIS_PASSWORD");
    if (!result.data.EVOLUTION_WEBHOOK_SECRET) recommended.push("EVOLUTION_WEBHOOK_SECRET");
    if (!result.data.FRONTEND_URL) recommended.push("FRONTEND_URL");
    if (!result.data.CORS_ORIGINS) recommended.push("CORS_ORIGINS");
    if (!result.data.WEBHOOK_BASE_URL) recommended.push("WEBHOOK_BASE_URL");

    if (required.length > 0) {
      console.error(`❌ Required production env vars missing: ${required.join(", ")}`);
      throw new Error(`Missing required production env vars: ${required.join(", ")}`);
    }
    if (recommended.length > 0) {
      console.warn(`⚠️  Production env vars recommended but missing: ${recommended.join(", ")}`);
    }
  }

  return result.data;
}
