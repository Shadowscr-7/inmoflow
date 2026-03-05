import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
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

@Controller("ai")
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiController {
  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly ai: AiService,
    private readonly planService: PlanService,
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
}
