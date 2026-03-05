import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
} from "@nestjs/common";
import { LeadScoringService } from "./lead-scoring.service";
import { JwtAuthGuard } from "../auth/guards";
import { TenantGuard } from "../auth/guards";
import { TenantId } from "../auth/decorators";

@Controller("lead-scoring")
@UseGuards(JwtAuthGuard, TenantGuard)
export class LeadScoringController {
  constructor(private readonly scoring: LeadScoringService) {}

  /** Recalculate score for all leads in tenant */
  @Post("recalculate")
  recalculateAll(@TenantId() tenantId: string) {
    return this.scoring.scoreAllLeads(tenantId);
  }

  /** Get scoring breakdown for a specific lead */
  @Get(":leadId/breakdown")
  getBreakdown(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
  ) {
    return this.scoring.getScoringBreakdown(leadId, tenantId);
  }

  /** Recalculate score for a specific lead */
  @Post(":leadId")
  scoreLead(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
  ) {
    return this.scoring.scoreLead(leadId, tenantId);
  }
}
