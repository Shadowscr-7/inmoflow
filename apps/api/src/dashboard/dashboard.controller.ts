import { Controller, Get, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard, TenantGuard, TenantId } from "../auth";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, TenantGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("stats")
  getStats(@TenantId() tenantId: string) {
    return this.dashboardService.getStats(tenantId);
  }
}
