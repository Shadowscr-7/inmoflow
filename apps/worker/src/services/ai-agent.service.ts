import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiProvider } from "@inmoflow/db";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AiChatOptions {
  provider: AiProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface AiChatResult {
  content: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

/**
 * AiAgentService — used by the worker to generate AI responses for leads.
 *
 * Loads the tenant's AiConfig from DB, then calls the appropriate AI provider.
 */
@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  private readonly endpoints: Record<AiProvider, string> = {
    OPENAI: "https://api.openai.com/v1",
    GEMINI: "https://generativelanguage.googleapis.com/v1beta",
    CLAUDE: "https://api.anthropic.com/v1",
    GROK: "https://api.x.ai/v1",
    DEEPSEEK: "https://api.deepseek.com/v1",
    QWEN: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if tenant has a configured and enabled AI agent.
   */
  async isAvailable(tenantId: string): Promise<boolean> {
    const config = await this.prisma.aiConfig.findUnique({ where: { tenantId } });
    return !!(config && config.enabled && config.apiKey);
  }

  /**
   * Generate an AI response for a lead, with full context.
   *
   * @param tenantId - tenant ID
   * @param leadId - lead to generate response for
   * @param instruction - the action.content from the rule (per-rule prompt)
   * @param inboundMessage - optional incoming message to respond to
   */
  async generateResponse(
    tenantId: string,
    leadId: string,
    instruction: string,
    inboundMessage?: string,
  ): Promise<{ content: string; aiGenerated: true; provider: string; model: string } | null> {
    const config = await this.prisma.aiConfig.findUnique({ where: { tenantId } });
    if (!config || !config.enabled || !config.apiKey) {
      return null;
    }

    // Get lead context
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: { stage: true, source: true, assignee: true },
    });
    if (!lead) return null;

    // Get recent conversation history (last 10 messages)
    const recentMessages = await this.prisma.message.findMany({
      where: { leadId, tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    recentMessages.reverse();

    // Build the system prompt with context
    const systemParts: string[] = [];

    // Global system prompt from config
    if (config.systemPrompt) {
      systemParts.push(config.systemPrompt);
    } else {
      systemParts.push(
        "Sos un asistente virtual de una inmobiliaria. " +
        "Tu objetivo es ayudar a los clientes con consultas sobre propiedades, " +
        "agendar visitas y brindar información útil. " +
        "Respondé siempre de forma amable, profesional y concisa en español."
      );
    }

    // Add lead context
    systemParts.push("\n--- Contexto del lead ---");
    systemParts.push(`Nombre: ${lead.name ?? "Desconocido"}`);
    if (lead.email) systemParts.push(`Email: ${lead.email}`);
    if (lead.phone) systemParts.push(`Teléfono: ${lead.phone}`);
    systemParts.push(`Estado: ${lead.status}`);
    if (lead.stage) systemParts.push(`Etapa: ${lead.stage.name}`);
    if (lead.source) systemParts.push(`Fuente: ${lead.source.name} (${lead.source.type})`);
    if (lead.intent) systemParts.push(`Intención: ${lead.intent}`);
    if (lead.notes) systemParts.push(`Notas: ${lead.notes.slice(0, 500)}`);

    // Add rule-specific instruction
    if (instruction) {
      systemParts.push(`\n--- Instrucción específica ---`);
      systemParts.push(instruction);
    }

    // Build message history
    const messages: AiChatMessage[] = [
      { role: "system", content: systemParts.join("\n") },
    ];

    // Add conversation history
    for (const msg of recentMessages) {
      messages.push({
        role: msg.direction === "IN" ? "user" : "assistant",
        content: msg.content,
      });
    }

    // If there's a new inbound message not yet in history, add it
    if (inboundMessage) {
      const alreadyInHistory = recentMessages.some(
        (m) => m.direction === "IN" && m.content === inboundMessage,
      );
      if (!alreadyInHistory) {
        messages.push({ role: "user", content: inboundMessage });
      }
    }

    // If no user message exists, add the instruction as a pseudo-prompt
    if (!messages.some((m) => m.role === "user")) {
      messages.push({
        role: "user",
        content: `Generá un mensaje para este lead basándote en la instrucción: "${instruction}"`,
      });
    }

    try {
      const result = await this.chat(messages, {
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      this.logger.log(
        `AI response generated for lead ${leadId}: ${result.content.slice(0, 80)}... (${result.tokensUsed ?? "?"} tokens)`,
      );

      return {
        content: result.content,
        aiGenerated: true,
        provider: config.provider,
        model: config.model,
      };
    } catch (err) {
      this.logger.error(`AI generation failed for lead ${leadId}: ${(err as Error).message}`);
      return null;
    }
  }

  // ─── Chat dispatch ─────────────────────────────────

  private async chat(messages: AiChatMessage[], options: AiChatOptions): Promise<AiChatResult> {
    switch (options.provider) {
      case "GEMINI":
        return this.chatGemini(messages, options);
      case "CLAUDE":
        return this.chatClaude(messages, options);
      default:
        return this.chatOpenAICompatible(messages, options);
    }
  }

  private async chatOpenAICompatible(messages: AiChatMessage[], opts: AiChatOptions): Promise<AiChatResult> {
    const res = await fetch(`${this.endpoints[opts.provider]}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${opts.provider} ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens?: number };
    };

    return {
      content: data.choices?.[0]?.message?.content ?? "",
      provider: opts.provider,
      model: opts.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }

  private async chatGemini(messages: AiChatMessage[], opts: AiChatOptions): Promise<AiChatResult> {
    const systemInstruction = messages.find((m) => m.role === "system")?.content;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: opts.maxTokens ?? 1024 },
    };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

    const res = await fetch(
      `${this.endpoints.GEMINI}/models/${opts.model}:generateContent?key=${opts.apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
      provider: "GEMINI",
      model: opts.model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
    };
  }

  private async chatClaude(messages: AiChatMessage[], opts: AiChatOptions): Promise<AiChatResult> {
    const systemMsg = messages.find((m) => m.role === "system")?.content;
    const chatMsgs = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      messages: chatMsgs,
    };
    if (systemMsg) body.system = systemMsg;

    const res = await fetch(`${this.endpoints.CLAUDE}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Claude ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    return {
      content: data.content?.find((c) => c.type === "text")?.text ?? "",
      provider: "CLAUDE",
      model: opts.model,
      tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    };
  }
}
