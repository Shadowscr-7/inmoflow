import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("15m"),
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
    const missing: string[] = [];
    if (!result.data.EVOLUTION_WEBHOOK_SECRET) missing.push("EVOLUTION_WEBHOOK_SECRET");
    if (!result.data.FRONTEND_URL) missing.push("FRONTEND_URL");
    if (missing.length > 0) {
      console.warn(`⚠️  Production env vars recommended but missing: ${missing.join(", ")}`);
    }
  }

  return result.data;
}
