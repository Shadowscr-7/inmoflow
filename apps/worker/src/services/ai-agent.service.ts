import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiProvider } from "@inmoflow/db";
import { createDecipheriv } from "crypto";

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

  /** Decrypt AES-256-GCM encrypted values (format: enc:iv:tag:ciphertext) */
  private decryptValue(text: string): string {
    if (!text || !text.startsWith("enc:")) return text;
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex) {
      this.logger.warn("ENCRYPTION_KEY not set but encrypted value found — cannot decrypt");
      return text;
    }
    try {
      const key = Buffer.from(hex, "hex");
      const parts = text.split(":");
      if (parts.length !== 4) return text;
      const iv = Buffer.from(parts[1], "hex");
      const tag = Buffer.from(parts[2], "hex");
      const encrypted = Buffer.from(parts[3], "hex");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted) + decipher.final("utf8");
    } catch (err) {
      this.logger.error(`Decryption failed: ${(err as Error).message}`);
      return text;
    }
  }

  /**
   * Check if tenant has a configured and enabled AI agent.
   */
  async isAvailable(tenantId: string, userId?: string | null): Promise<boolean> {
    let config = userId
      ? await this.prisma.aiConfig.findFirst({ where: { tenantId, userId, enabled: true } })
      : null;
    if (!config) {
      config = await this.prisma.aiConfig.findFirst({ where: { tenantId, userId: null, enabled: true } });
    }
    if (config?.apiKey) return true;
    return !!process.env.PLATFORM_OPENAI_API_KEY;
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
    // Get lead context first (needed for per-agent config lookup)
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: { stage: true, source: true, assignee: true },
    });
    if (!lead) return null;

    // Load AI config: per-agent first, then tenant default, then platform fallback
    let rawConfig = lead.assigneeId
      ? await this.prisma.aiConfig.findFirst({ where: { tenantId, userId: lead.assigneeId, enabled: true } })
      : null;
    if (!rawConfig) {
      rawConfig = await this.prisma.aiConfig.findFirst({ where: { tenantId, userId: null, enabled: true } });
    }

    // Build effective config (decrypt tenant key or use platform fallback)
    let effectiveProvider: AiProvider;
    let effectiveApiKey: string;
    let effectiveModel: string;
    let effectiveTemperature: number;
    let effectiveMaxTokens: number;
    let effectiveSystemPrompt: string | null;

    if (rawConfig?.apiKey) {
      effectiveProvider = rawConfig.provider;
      effectiveApiKey = this.decryptValue(rawConfig.apiKey);
      effectiveModel = rawConfig.model;
      effectiveTemperature = rawConfig.temperature;
      effectiveMaxTokens = rawConfig.maxTokens;
      effectiveSystemPrompt = rawConfig.systemPrompt;
    } else {
      const platformKey = process.env.PLATFORM_OPENAI_API_KEY;
      if (!platformKey) return null;
      effectiveProvider = "OPENAI" as AiProvider;
      effectiveApiKey = platformKey;
      effectiveModel = process.env.PLATFORM_AI_MODEL || "gpt-4o-mini";
      effectiveTemperature = 0.7;
      effectiveMaxTokens = 1024;
      effectiveSystemPrompt = null;
    }

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
    if (effectiveSystemPrompt) {
      systemParts.push(effectiveSystemPrompt);
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

    // Add agent availability / calendar context
    if (lead.assigneeId) {
      try {
        const availableSlots = await this.getAvailableSlots(tenantId, lead.assigneeId);
        if (availableSlots.length > 0) {
          systemParts.push(`\n--- Disponibilidad del agente para citas ---`);
          systemParts.push(`Fecha actual: ${new Date().toLocaleDateString("es", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`);
          systemParts.push(`Horarios disponibles para agendar visitas (próximos 7 días):`);
          for (const day of availableSlots) {
            systemParts.push(`  ${day.day} ${day.date}: ${day.slots.join(", ")} hs`);
          }
          systemParts.push(
            `Cuando el cliente quiera agendar una visita, ofrecé SOLO horarios de esta lista. ` +
            `No inventes horarios que no están disponibles. Si ningún horario le sirve, ` +
            `ofrecé contactar al agente para coordinar algo especial.`
          );
        } else {
          systemParts.push(`\n--- Disponibilidad ---`);
          systemParts.push(`El agente no tiene horarios configurados. Si el cliente quiere agendar, pedile día/hora preferidos y decile que el agente le confirmará.`);
        }
      } catch {
        // Non-blocking: if availability lookup fails, AI just won't have calendar data
      }
    }

    // Add rule-specific instruction
    if (instruction) {
      systemParts.push(`\n--- Instrucción específica ---`);
      systemParts.push(instruction);
    }

    // Add goal-based deactivation instruction
    if (lead.aiGoal) {
      systemParts.push(`\n--- Meta de la conversación ---`);
      systemParts.push(
        `Tu meta principal en esta conversación es: ${lead.aiGoal}. ` +
        `Cuando hayas logrado concretar exitosamente esta meta (por ejemplo, el cliente confirma una fecha/hora ` +
        `para una visita, o acepta agendar una cita), incluí el texto exacto [META_CUMPLIDA] al FINAL de tu mensaje. ` +
        `Solo usá [META_CUMPLIDA] cuando la meta se haya cumplido de forma clara y confirmada por el cliente. ` +
        `No incluyas [META_CUMPLIDA] si el cliente aún no confirmó.`
      );
    }

    // Add appointment booking marker instruction
    systemParts.push(`\n--- Registro de citas ---`);
    systemParts.push(
      `Cuando el cliente confirme una cita o visita para un día y hora específicos, ` +
      `incluí al final de tu mensaje el marcador [CITA:YYYY-MM-DD HH:MM] con la fecha y hora acordadas. ` +
      `Ejemplo: si acuerdan el 15 de marzo de 2026 a las 10:00, poné [CITA:2026-03-15 10:00]. ` +
      `Este marcador es interno, el cliente no lo ve. Podés combinarlo con [META_CUMPLIDA] si aplica.`
    );

    // Always add the "not interested" detection instruction
    systemParts.push(`\n--- Detección de desinterés ---`);
    systemParts.push(
      `Si la persona indica claramente que NO está interesada, que no quiere seguir hablando, ` +
      `que no busca nada por el momento, o rechaza repetidamente tus propuestas, NO insistas. ` +
      `En ese caso, despedite amablemente agradeciéndole su tiempo, deseándole lo mejor ` +
      `y diciéndole que quedás a las órdenes para cualquier consulta a futuro. ` +
      `Al final de ese mensaje de despedida, incluí el texto exacto [LEAD_NO_INTERESADO]. ` +
      `Solo usá [LEAD_NO_INTERESADO] cuando sea claro que la persona no tiene interés, ` +
      `no lo uses si simplemente hace una pregunta o pide más información.`
    );

    // Add funnel stage progression instruction
    systemParts.push(`\n--- Avance de etapa en el embudo ---`);
    systemParts.push(
      `El lead actualmente está en la etapa: ${lead.status}. ` +
      `A medida que la conversación avanza, debés evaluar si el lead progresó de etapa. ` +
      `Las etapas del embudo de ventas son (en orden):\n` +
      `  CONTACTED → QUALIFIED → NEGOTIATION → VISIT\n` +
      `Criterios para avanzar:\n` +
      `  - QUALIFIED: El lead muestra interés genuino, hace preguntas específicas sobre propiedades, ` +
      `    ubicación, precio, o características. Ya no es un contacto frío.\n` +
      `  - NEGOTIATION: El lead está discutiendo condiciones concretas (precio, disponibilidad, ` +
      `    formas de pago) o comparando opciones específicas.\n` +
      `  - VISIT: El lead confirmó una visita o cita presencial (esto ya se maneja con [META_CUMPLIDA]).\n` +
      `Cuando detectes que el lead avanzó a una nueva etapa, incluí al final de tu mensaje ` +
      `el marcador [ETAPA:NOMBRE] donde NOMBRE es una de: QUALIFIED, NEGOTIATION. ` +
      `Solo avanzá una etapa a la vez y solo cuando sea claro por lo que dijo el lead. ` +
      `No retrocedas etapas. Si el lead ya está en QUALIFIED, no pongas [ETAPA:QUALIFIED] de nuevo. ` +
      `Este marcador es interno y el cliente no lo ve.`
    );

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
        provider: effectiveProvider,
        apiKey: effectiveApiKey,
        model: effectiveModel,
        temperature: effectiveTemperature,
        maxTokens: effectiveMaxTokens,
      });

      this.logger.log(
        `AI response generated for lead ${leadId}: ${result.content.slice(0, 80)}... (${result.tokensUsed ?? "?"} tokens)`,
      );

      return {
        content: result.content,
        aiGenerated: true,
        provider: effectiveProvider,
        model: effectiveModel,
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
      `${this.endpoints.GEMINI}/models/${opts.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": opts.apiKey,
        },
        body: JSON.stringify(body),
      },
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

  // ─── Calendar Availability Helper ─────────────────────

  /**
   * Compute available 1-hour slots for an agent over the next 7 days.
   */
  private async getAvailableSlots(
    tenantId: string,
    agentId: string,
  ): Promise<{ date: string; day: string; slots: string[] }[]> {
    const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);

    const availability = await this.prisma.agentAvailability.findMany({
      where: { userId: agentId, active: true },
    });

    if (availability.length === 0) return [];

    const existingVisits = await this.prisma.visit.findMany({
      where: {
        tenantId,
        agentId,
        date: { gte: from, lte: to },
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      select: { date: true, endDate: true },
    });

    const result: { date: string; day: string; slots: string[] }[] = [];

    for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const avail = availability.find((a) => a.dayOfWeek === dayOfWeek);
      if (!avail) continue;

      const dateStr = d.toISOString().split("T")[0];
      const [startH] = avail.startTime.split(":").map(Number);
      const [endH] = avail.endTime.split(":").map(Number);
      const slots: string[] = [];

      for (let h = startH; h < endH; h++) {
        const slotStart = new Date(d);
        slotStart.setHours(h, 0, 0, 0);
        const slotEnd = new Date(d);
        slotEnd.setHours(h + 1, 0, 0, 0);

        if (slotStart <= now) continue;

        const hasConflict = existingVisits.some((v) => {
          const vStart = new Date(v.date);
          const vEnd = v.endDate ? new Date(v.endDate) : new Date(vStart.getTime() + 3600000);
          return slotStart < vEnd && slotEnd > vStart;
        });

        if (!hasConflict) {
          slots.push(`${String(h).padStart(2, "0")}:00`);
        }
      }

      if (slots.length > 0) {
        result.push({ date: dateStr, day: DAY_NAMES[dayOfWeek], slots });
      }
    }

    return result;
  }
}
