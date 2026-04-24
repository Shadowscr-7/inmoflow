import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiProvider } from "@inmoflow/db";
import { EncryptionService } from "../common/encryption.service";

@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ─── Encryption helpers (delegates to shared EncryptionService) ───

  private encrypt(text: string): string {
    return this.encryption.encrypt(text);
  }

  private decrypt(text: string): string {
    return this.encryption.decrypt(text);
  }

  /** Get AI config for tenant (returns null if none) */
  async findByTenant(tenantId: string, userId?: string | null) {
    // If userId provided, look for per-agent config first
    if (userId) {
      const agentConfig = await this.prisma.aiConfig.findFirst({
        where: { tenantId, userId },
      });
      if (agentConfig) return { ...agentConfig, apiKey: this.decrypt(agentConfig.apiKey) };
    }
    // Fall back to tenant-wide default (userId = null)
    const config = await this.prisma.aiConfig.findFirst({
      where: { tenantId, userId: null },
    });
    return config ? { ...config, apiKey: this.decrypt(config.apiKey) } : null;
  }

  /** Get AI config or throw */
  async getByTenant(tenantId: string) {
    const config = await this.findByTenant(tenantId);
    if (!config) throw new NotFoundException("No AI agent configured");
    return config;
  }

  /** Returns a synthetic config using the platform's own OpenAI key (env), or null */
  getPlatformDefault(): { id: string; provider: AiProvider; apiKey: string; model: string; enabled: boolean; systemPrompt: null; temperature: number; maxTokens: number; isPlatformDefault: true } | null {
    const key = process.env.PLATFORM_OPENAI_API_KEY;
    if (!key) return null;
    return {
      id: "platform",
      provider: "OPENAI" as AiProvider,
      apiKey: key,
      model: process.env.PLATFORM_AI_MODEL || "gpt-4o-mini",
      enabled: true,
      systemPrompt: null,
      temperature: 0.7,
      maxTokens: 1024,
      isPlatformDefault: true,
    };
  }

  /** Tenant config first, then platform fallback, then null */
  async getEffectiveConfig(tenantId: string, userId?: string | null) {
    const config = await this.findByTenant(tenantId, userId);
    if (config) return { ...config, isPlatformDefault: false };
    return this.getPlatformDefault();
  }

  /** Create or update (upsert) AI config */
  async upsert(tenantId: string, dto: {
    provider: string;
    apiKey: string;
    model: string;
    enabled?: boolean;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    userId?: string;
  }) {
    const data = {
      provider: dto.provider as AiProvider,
      apiKey: this.encrypt(dto.apiKey),
      model: dto.model,
      enabled: dto.enabled ?? true,
      systemPrompt: dto.systemPrompt ?? null,
      temperature: dto.temperature ?? 0.7,
      maxTokens: dto.maxTokens ?? 1024,
    };

    const userId = dto.userId ?? null;

    // Check if config already exists for this tenant+user
    const existing = await this.prisma.aiConfig.findFirst({
      where: { tenantId, userId },
    });

    if (existing) {
      return this.prisma.aiConfig.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.aiConfig.create({
      data: { tenantId, userId, ...data },
    });
  }

  /** Update specific fields */
  async update(tenantId: string, dto: {
    provider?: string;
    apiKey?: string;
    model?: string;
    enabled?: boolean;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    const existing = await this.getByTenant(tenantId);

    const data: Record<string, unknown> = {};
    if (dto.provider !== undefined) data.provider = dto.provider as AiProvider;
    if (dto.apiKey !== undefined) data.apiKey = this.encrypt(dto.apiKey);
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.systemPrompt !== undefined) data.systemPrompt = dto.systemPrompt;
    if (dto.temperature !== undefined) data.temperature = dto.temperature;
    if (dto.maxTokens !== undefined) data.maxTokens = dto.maxTokens;

    return this.prisma.aiConfig.update({
      where: { id: existing.id },
      data,
    });
  }

  /** Delete AI config */
  async delete(tenantId: string) {
    const existing = await this.findByTenant(tenantId);
    if (!existing) throw new NotFoundException("No AI agent configured");

    await this.prisma.aiConfig.delete({
      where: { id: existing.id },
    });
  }

  /** Get provider models list */
  getProviderModels(): Record<string, { label: string; models: { value: string; label: string }[] }> {
    return {
      OPENAI: {
        label: "OpenAI",
        models: [
          { value: "gpt-4o", label: "GPT-4o" },
          { value: "gpt-4o-mini", label: "GPT-4o Mini" },
          { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
          { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
        ],
      },
      GEMINI: {
        label: "Google Gemini",
        models: [
          { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
          { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
          { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
        ],
      },
      CLAUDE: {
        label: "Anthropic Claude",
        models: [
          { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
          { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
          { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
        ],
      },
      GROK: {
        label: "xAI Grok",
        models: [
          { value: "grok-2", label: "Grok 2" },
          { value: "grok-2-mini", label: "Grok 2 Mini" },
        ],
      },
      DEEPSEEK: {
        label: "DeepSeek",
        models: [
          { value: "deepseek-chat", label: "DeepSeek Chat" },
          { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
        ],
      },
      QWEN: {
        label: "Alibaba Qwen",
        models: [
          { value: "qwen-turbo", label: "Qwen Turbo" },
          { value: "qwen-plus", label: "Qwen Plus" },
          { value: "qwen-max", label: "Qwen Max" },
        ],
      },
    };
  }
}
