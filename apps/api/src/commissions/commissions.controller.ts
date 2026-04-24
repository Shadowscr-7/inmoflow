import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CommissionsService } from "./commissions.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";

@Controller("commissions")
@UseGuards(JwtAuthGuard, TenantGuard)
export class CommissionsController {
  constructor(private readonly svc: CommissionsService) {}

  // ─── Commission Rules ─────────────────────────────

  @Get("rules")
  getRules(@TenantId() tenantId: string) {
    return this.svc.getRules(tenantId);
  }

  @Post("rules")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  upsertRule(
    @TenantId() tenantId: string,
    @Body()
    body: {
      operationType: "SALE" | "RENT" | "RENT_TEMPORARY";
      percentage: number;
      splitAgentPct?: number;
      splitBizPct?: number;
      enabled?: boolean;
    },
  ) {
    return this.svc.upsertRule(tenantId, body);
  }

  @Delete("rules/:id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  deleteRule(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.svc.deleteRule(tenantId, id);
  }

  // ─── Commissions CRUD ─────────────────────────────

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @CurrentUser() caller: { id: string; role: string },
    @Query("agentId") agentId?: string,
    @Query("status") status?: string,
    @Query("operationType") operationType?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const effectiveAgentId = caller.role === "AGENT" ? caller.id : agentId;
    return this.svc.findAll(tenantId, {
      agentId: effectiveAgentId,
      status,
      operationType,
      from,
      to,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  @Get("summary")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  getSummary(
    @TenantId() tenantId: string,
    @Query("agentId") agentId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.svc.getSummary(tenantId, { agentId, from, to });
  }

  @Get(":id")
  findOne(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.svc.findOne(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  create(
    @TenantId() tenantId: string,
    @CurrentUser() caller: { id: string; role: string },
    @Body()
    body: {
      agentId: string;
      leadId?: string;
      propertyId?: string;
      operationType: "SALE" | "RENT" | "RENT_TEMPORARY";
      dealAmount: number;
      commissionPct?: number;
      agentPct?: number;
      notes?: string;
    },
  ) {
    const effectiveBody = caller.role === "AGENT"
      ? { ...body, agentId: caller.id }
      : body;
    return this.svc.create(tenantId, effectiveBody);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  update(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body()
    body: {
      status?: "PENDING" | "APPROVED" | "PAID" | "CANCELLED";
      notes?: string;
      dealAmount?: number;
      commissionPct?: number;
      agentPct?: number;
      proofUrl?: string;
    },
  ) {
    return this.svc.update(tenantId, id, body);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.svc.remove(tenantId, id);
  }
}
