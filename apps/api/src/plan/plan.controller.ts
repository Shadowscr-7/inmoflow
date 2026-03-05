import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, TenantGuard } from "../auth/guards";
import { TenantId } from "../auth/decorators";
import { PlanService } from "./plan.service";

@Controller("plan")
@UseGuards(JwtAuthGuard, TenantGuard)
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  /** Get current tenant's plan limits and usage info */
  @Get()
  async getLimits(@TenantId() tenantId: string) {
    return this.planService.getTenantLimits(tenantId);
  }
}
