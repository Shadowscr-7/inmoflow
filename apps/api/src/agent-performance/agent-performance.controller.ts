import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AgentPerformanceService } from "./agent-performance.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId } from "../auth/decorators";

@Controller("agent-performance")
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgentPerformanceController {
  constructor(private readonly perfService: AgentPerformanceService) {}

  /** Get performance for all agents — BUSINESS/ADMIN only */
  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  getTeam(
    @TenantId() tenantId: string,
    @Query("month") month?: string,
  ) {
    return this.perfService.getTeamPerformance(tenantId, month);
  }

  /** Get leaderboard */
  @Get("leaderboard")
  getLeaderboard(
    @TenantId() tenantId: string,
    @Query("month") month?: string,
  ) {
    return this.perfService.getLeaderboard(tenantId, month);
  }

  /** Get performance for a specific agent */
  @Get(":userId")
  getAgent(
    @TenantId() tenantId: string,
    @Param("userId") userId: string,
    @Query("month") month?: string,
  ) {
    return this.perfService.getAgentPerformance(tenantId, userId, month);
  }

  /** Set goals for an agent — BUSINESS/ADMIN only */
  @Post(":userId/goals")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  setGoal(
    @TenantId() tenantId: string,
    @Param("userId") userId: string,
    @Body() body: { month: string; leadsTarget?: number; visitsTarget?: number; wonTarget?: number },
  ) {
    return this.perfService.setGoal(tenantId, userId, body.month, body);
  }
}
