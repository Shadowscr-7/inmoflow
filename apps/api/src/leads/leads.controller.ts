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
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { CreateLeadDto, UpdateLeadDto, CreateStageDto, UpdateStageDto, ReorderStagesDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId, CurrentUser } from "../auth";
import { LeadStatus, UserRole } from "@inmoflow/db";

@Controller("leads")
@UseGuards(JwtAuthGuard, TenantGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(tenantId, dto);
  }

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string; role: string },
    @Query("status") status?: LeadStatus,
    @Query("stageId") stageId?: string,
    @Query("assigneeId") assigneeId?: string,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.leadsService.findAll(tenantId, {
      status,
      stageId,
      assigneeId,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    }, user);
  }

  @Get("stages")
  getStages(@TenantId() tenantId: string) {
    return this.leadsService.getStages(tenantId);
  }

  @Get("pipeline")
  getPipeline(@TenantId() tenantId: string, @CurrentUser() user: { userId: string; role: string }) {
    return this.leadsService.getLeadsByStage(tenantId, user);
  }

  /** Create a new pipeline stage — BUSINESS/ADMIN only */
  @Post("stages")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUSINESS, UserRole.ADMIN)
  createStage(
    @TenantId() tenantId: string,
    @Body() dto: CreateStageDto,
  ) {
    return this.leadsService.createStage(tenantId, dto);
  }

  /** Update a pipeline stage — BUSINESS/ADMIN only */
  @Patch("stages/reorder")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUSINESS, UserRole.ADMIN)
  reorderStages(
    @TenantId() tenantId: string,
    @Body() dto: ReorderStagesDto,
  ) {
    return this.leadsService.reorderStages(tenantId, dto.ids);
  }

  @Patch("stages/:stageId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUSINESS, UserRole.ADMIN)
  updateStage(
    @TenantId() tenantId: string,
    @Param("stageId") stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    return this.leadsService.updateStage(tenantId, stageId, dto);
  }

  /** Delete a pipeline stage — BUSINESS/ADMIN only */
  @Delete("stages/:stageId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.BUSINESS, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteStage(
    @TenantId() tenantId: string,
    @Param("stageId") stageId: string,
  ) {
    return this.leadsService.deleteStage(tenantId, stageId);
  }

  @Get(":id")
  findOne(@TenantId() tenantId: string, @CurrentUser() user: { userId: string; role: string }, @Param("id") id: string) {
    return this.leadsService.findById(tenantId, id, user);
  }

  @Patch(":id")
  update(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(tenantId, id, dto);
  }

  /** Toggle AI conversation mode for a lead */
  @Patch(":id/ai")
  toggleAi(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() body: { active: boolean; instruction?: string },
  ) {
    return this.leadsService.update(tenantId, id, {
      aiConversationActive: body.active,
      ...(body.instruction !== undefined && { aiInstruction: body.instruction }),
    });
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@TenantId() tenantId: string, @Param("id") id: string) {
    await this.leadsService.delete(tenantId, id);
  }

  @Get(":id/timeline")
  getTimeline(@TenantId() tenantId: string, @CurrentUser() user: { userId: string; role: string }, @Param("id") id: string) {
    return this.leadsService.getTimeline(tenantId, id, user);
  }
}
