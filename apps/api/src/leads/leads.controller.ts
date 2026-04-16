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
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { CreateLeadDto, UpdateLeadDto, CreateStageDto, UpdateStageDto, ReorderStagesDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId, CurrentUser } from "../auth";
import { LeadStatus, UserRole } from "@inmoflow/db";
import { PrismaService } from "../prisma/prisma.service";
import { EventProducerService } from "../events/event-producer.service";

@Controller("leads")
@UseGuards(JwtAuthGuard, TenantGuard)
export class LeadsController {
  private readonly logger = new Logger(LeadsController.name);

  constructor(
    private readonly leadsService: LeadsService,
    private readonly prisma: PrismaService,
    private readonly eventProducer: EventProducerService,
  ) {}

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
    @Body() body: { active: boolean; instruction?: string; demoMode?: boolean; demoPhone?: string; goal?: string },
  ) {
    return this.leadsService.update(tenantId, id, {
      aiConversationActive: body.active,
      ...(body.instruction !== undefined && { aiInstruction: body.instruction }),
      ...(body.demoMode !== undefined && { aiDemoMode: body.demoMode }),
      ...(body.demoPhone !== undefined && { aiDemoPhone: body.demoPhone }),
      ...(body.goal !== undefined && { aiGoal: body.goal }),
      // When deactivating AI, also turn off demo mode and clear goal
      ...(!body.active && { aiDemoMode: false, aiDemoPhone: null, aiGoal: null }),
    });
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@TenantId() tenantId: string, @Param("id") id: string) {
    await this.leadsService.delete(tenantId, id);
  }

  /**
   * POST /leads/:id/meta-resync
   * Re-fetch data from Meta Graph API for a lead and re-run rule engine.
   */
  @Post(":id/meta-resync")
  async metaResync(@TenantId() tenantId: string, @Param("id") id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: { source: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    // Find leadgenId from EventLog payload
    const eventLog = await this.prisma.eventLog.findFirst({
      where: { tenantId, entity: "Lead", entityId: id },
      orderBy: { createdAt: "asc" },
    });
    const payload = eventLog?.payload as Record<string, unknown> | null;
    const leadgenId = (payload?.leadgenId as string) ?? null;

    if (!leadgenId) {
      return { updated: false, reason: "No leadgenId found for this lead" };
    }

    // Get access token from source
    const accessToken = lead.source?.metaPageAccessToken ?? process.env.META_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      return { updated: false, reason: "No page access token available" };
    }

    // Fetch lead data from Meta Graph API
    let leadData: Record<string, string> | null = null;
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${accessToken}`,
      );
      if (res.ok) {
        const data = await res.json() as { field_data?: { name: string; values: string[] }[] };
        leadData = {};
        for (const f of data.field_data ?? []) {
          leadData[f.name] = f.values?.[0] ?? "";
        }
      }
    } catch (err) {
      this.logger.warn(`Meta resync Graph API error: ${(err as Error).message}`);
    }

    if (!leadData) {
      return { updated: false, reason: "Could not fetch data from Meta Graph API" };
    }

    const fullName = leadData["full_name"]
      ?? (leadData["first_name"] ? `${leadData["first_name"]} ${leadData["last_name"] ?? ""}`.trim() : null);
    const email = leadData["email"] ?? null;
    const phone = leadData["phone_number"] ?? null;

    // Only update fields that Meta provided and that are missing/generic on the lead
    const updates: Record<string, unknown> = {};
    if (fullName && lead.name?.startsWith("Meta Lead ")) updates.name = fullName;
    if (email && !lead.email) updates.email = email;
    if (phone && !lead.phone) updates.phone = phone;

    if (Object.keys(updates).length > 0) {
      await this.prisma.lead.update({ where: { id }, data: updates });
      this.logger.log(`Meta resync: updated lead ${id} with ${Object.keys(updates).join(", ")}`);
    }

    // Re-emit lead.created to trigger rule engine (for assignment)
    const formName = (payload?.formName as string) ?? lead.source?.metaFormName ?? null;
    await this.eventProducer.emitLeadCreated(tenantId, id, {
      sourceType: "META_LEAD_AD",
      leadgenId,
      formName: formName ?? undefined,
      resync: true,
    });

    return { updated: true, fields: Object.keys(updates) };
  }

  @Get(":id/timeline")
  getTimeline(@TenantId() tenantId: string, @CurrentUser() user: { userId: string; role: string }, @Param("id") id: string) {
    return this.leadsService.getTimeline(tenantId, id, user);
  }
}
