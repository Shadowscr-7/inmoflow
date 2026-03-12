import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
} from "@nestjs/common";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId } from "../auth/decorators";
import { AiConfigService } from "./ai-config.service";
import { AiService } from "./ai.service";
import { CreateAiConfigDto, UpdateAiConfigDto, TestAiDto, AiChatDto } from "./dto";
import { AiProvider } from "@inmoflow/db";
import { PlanService } from "../plan/plan.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("ai")
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiController {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly ai: AiService,
    private readonly planService: PlanService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /ai/config — get current AI config (masks API key) */
  @Get("config")
  async getConfig(@TenantId() tenantId: string) {
    const config = await this.aiConfig.findByTenant(tenantId);
    if (!config) return { configured: false };

    return {
      configured: true,
      config: {
        id: config.id,
        provider: config.provider,
        model: config.model,
        enabled: config.enabled,
        systemPrompt: config.systemPrompt,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        apiKeyHint: this.maskApiKey(config.apiKey),
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    };
  }

  /** GET /ai/providers — list available providers and their models */
  @Get("providers")
  getProviders() {
    return this.aiConfig.getProviderModels();
  }

  /** POST /ai/config — create or replace AI config */
  @Post("config")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async createConfig(
    @TenantId() tenantId: string,
    @Body() dto: CreateAiConfigDto,
  ) {
    await this.planService.checkAiAccess(tenantId);
    const config = await this.aiConfig.upsert(tenantId, dto);
    return {
      id: config.id,
      provider: config.provider,
      model: config.model,
      enabled: config.enabled,
      apiKeyHint: this.maskApiKey(config.apiKey),
    };
  }

  /** PATCH /ai/config — update AI config fields */
  @Patch("config")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async updateConfig(
    @TenantId() tenantId: string,
    @Body() dto: UpdateAiConfigDto,
  ) {
    const config = await this.aiConfig.update(tenantId, dto);
    return {
      id: config.id,
      provider: config.provider,
      model: config.model,
      enabled: config.enabled,
      apiKeyHint: this.maskApiKey(config.apiKey),
    };
  }

  /** DELETE /ai/config — remove AI config */
  @Delete("config")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  @HttpCode(204)
  async deleteConfig(@TenantId() tenantId: string) {
    await this.aiConfig.delete(tenantId);
  }

  /** POST /ai/test — test the AI connection */
  @Post("test")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async testConnection(
    @TenantId() tenantId: string,
    @Body() dto: TestAiDto,
  ) {
    await this.planService.checkAiAccess(tenantId);
    const config = await this.aiConfig.getByTenant(tenantId);

    const result = await this.ai.test(
      {
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      },
      dto.message,
    );

    return result;
  }

  /** POST /ai/chat — direct chat (for testing from UI) */
  @Post("chat")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async chat(
    @TenantId() tenantId: string,
    @Body() dto: AiChatDto,
  ) {
    await this.planService.checkAiAccess(tenantId);
    const config = await this.aiConfig.getByTenant(tenantId);
    if (!config.enabled) {
      return { error: "AI agent is disabled" };
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    if (config.systemPrompt) {
      messages.push({ role: "system", content: config.systemPrompt });
    }

    // Add history
    if (dto.history) {
      for (const msg of dto.history) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    messages.push({ role: "user", content: dto.message });

    const result = await this.ai.chat(messages, {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });

    return {
      response: result.content,
      provider: result.provider,
      model: result.model,
    };
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) return "****";
    return key.slice(0, 4) + "..." + key.slice(-4);
  }

  /** POST /ai/lead-summary/:leadId — Generate AI summary of a lead’s history */
  @Post("lead-summary/:leadId")
  async leadSummary(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
  ) {
    await this.planService.checkAiAccess(tenantId);
    const config = await this.aiConfig.getByTenant(tenantId);
    if (!config.enabled) return { error: "AI agent is disabled" };

    // Fetch lead + related data in parallel
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
    });

    if (!lead) return { error: "Lead not found" };

    const [source, stage, assignee, messages, visits, tags] = await Promise.all([
      lead.sourceId ? this.prisma.leadSource.findUnique({ where: { id: lead.sourceId }, select: { name: true, type: true } }) : null,
      lead.stageId ? this.prisma.leadStage.findUnique({ where: { id: lead.stageId }, select: { name: true, key: true } }) : null,
      lead.assigneeId ? this.prisma.user.findUnique({ where: { id: lead.assigneeId }, select: { name: true, email: true } }) : null,
      this.prisma.message.findMany({
        where: { leadId, tenantId },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: { direction: true, content: true, channel: true, createdAt: true },
      }),
      this.prisma.visit.findMany({
        where: { leadId, tenantId },
        orderBy: { date: "asc" },
        take: 10,
        select: { status: true, date: true, notes: true },
      }),
      this.prisma.leadTag.findMany({
        where: { leadId },
        include: { tag: { select: { name: true } } },
      }),
    ]);

    // Build context
    const msgSummary = messages.map((m) =>
      `[${new Date(m.createdAt).toLocaleDateString("es")} ${m.direction === "IN" ? "LEAD" : "AGENTE"}]: ${m.content?.slice(0, 200) ?? "(media)"}`,
    ).join("\n");

    const visitSummary = visits.map((v) =>
      `Visita ${v.status} el ${new Date(v.date).toLocaleDateString("es")}${v.notes ? " — " + v.notes : ""}`,
    ).join("\n");

    const tagNames = tags.map((t) => t.tag.name).join(", ");

    const prompt = `Eres un asistente de CRM inmobiliario. Genera un resumen ejecutivo profesional y conciso del siguiente lead.

Datos del lead:
- Nombre: ${lead.name ?? "Sin nombre"}
- Teléfono: ${lead.phone ?? "N/A"}
- Email: ${lead.email ?? "N/A"}
- Estado: ${lead.status}
- Etapa: ${stage?.name ?? "Sin etapa"}
- Fuente: ${source?.name ?? "Desconocida"} (${source?.type ?? ""})
- Asignado a: ${assignee?.name ?? "Sin asignar"}
- Tags: ${tagNames || "Ninguno"}
- Score: ${lead.score ?? "Sin calcular"}/100 (${lead.temperature ?? "N/A"})
- Intent: ${lead.intent ?? "N/A"}
- Notas: ${lead.notes ?? "Sin notas"}
- Creado: ${new Date(lead.createdAt).toLocaleDateString("es")}

Historial de mensajes (${messages.length} msgs):
${msgSummary || "Sin mensajes aún"}

Visitas (${visits.length}):
${visitSummary || "Sin visitas"}

Genera:
1. **Resumen** (2-3 líneas): Quién es este lead, qué busca y cómo llegó.
2. **Estado actual**: En qué punto está la negociación.
3. **Sentimiento**: Qué tan interesado parece (frío/tibio/caliente) basado en mensajes.
4. **Próximos pasos recomendados**: 2-3 acciones concretas para avanzar.

Responde en español, de forma profesional y útil para un agente inmobiliario.`;

    const result = await this.ai.chat(
      [{ role: "user", content: prompt }],
      {
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        temperature: 0.3,
        maxTokens: 800,
      },
    );

    return {
      summary: result.content,
      provider: result.provider,
      model: result.model,
      leadName: lead.name,
    };
  }
}
