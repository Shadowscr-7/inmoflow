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

    const allOk = Object.values(checks).every((v) => v === "ok");

    return {
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
