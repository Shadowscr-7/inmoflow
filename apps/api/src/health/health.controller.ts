import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};

    // DB check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    // Redis check
    try {
      const host = process.env.REDIS_HOST ?? "localhost";
      const port = parseInt(process.env.REDIS_PORT ?? "6379", 10);
      const password = process.env.REDIS_PASSWORD || undefined;
      const Redis = (await import("ioredis")).default;
      const client = new Redis({ host, port, password, lazyConnect: true, connectTimeout: 3000 });
      await client.connect();
      await client.ping();
      client.disconnect();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");

    return {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
