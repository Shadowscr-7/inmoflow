import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { VisitsService } from "./visits.service";
import { CreateVisitDto, UpdateVisitDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole, VisitStatus } from "@inmoflow/db";

@Controller("visits")
@UseGuards(JwtAuthGuard, TenantGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("agentId") agentId?: string,
    @Query("status") status?: VisitStatus,
    @Query("leadId") leadId?: string,
  ) {
    return this.visitsService.findAll(tenantId, { from, to, agentId, status, leadId });
  }

  @Get("stats")
  getStats(@TenantId() tenantId: string) {
    return this.visitsService.getStats(tenantId);
  }

  @Get(":id")
  findOne(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.visitsService.findOne(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  create(@TenantId() tenantId: string, @Body() dto: CreateVisitDto) {
    return this.visitsService.create(tenantId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateVisitDto) {
    return this.visitsService.update(tenantId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.visitsService.remove(tenantId, id);
  }
}
