import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { FollowUpsService } from "./follow-ups.service";
import { CreateSequenceDto, UpdateSequenceDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";

@Controller("follow-ups")
@UseGuards(JwtAuthGuard, TenantGuard)
export class FollowUpsController {
  constructor(private readonly service: FollowUpsService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.service.findAll(tenantId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get("runs")
  getActiveRuns(@TenantId() tenantId: string) {
    return this.service.getActiveRuns(tenantId);
  }

  @Get(":id")
  findOne(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.service.findOne(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  create(@TenantId() tenantId: string, @Body() dto: CreateSequenceDto) {
    return this.service.create(tenantId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateSequenceDto) {
    return this.service.update(tenantId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.service.remove(tenantId, id);
  }

  @Post(":id/enroll/:leadId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  enrollLead(
    @TenantId() tenantId: string,
    @Param("id") sequenceId: string,
    @Param("leadId") leadId: string,
  ) {
    return this.service.enrollLead(tenantId, sequenceId, leadId);
  }

  @Delete("runs/:runId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  cancelRun(@TenantId() tenantId: string, @Param("runId") runId: string) {
    return this.service.cancelRun(tenantId, runId);
  }
}
