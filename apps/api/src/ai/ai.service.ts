import { Injectable, Logger } from "@nestjs/common";
import { AiProvider } from "@inmoflow/db";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatOptions {
  provider: AiProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatResult {
  content: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

/**
 * Universal AI Chat Service — abstracts OpenAI, Gemini, Claude, Grok, DeepSeek, Qwen.
 *
 * Most providers use the OpenAI-compatible POST /chat/completions format.
 * Gemini and Claude have their own formats.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** Provider base URLs */
  private readonly endpoints: Record<AiProvider, string> = {
    OPENAI: "https://api.openai.com/v1",
    GEMINI: "https://generativelanguage.googleapis.com/v1beta",
    CLAUDE: "https://api.anthropic.com/v1",
    GROK: "https://api.x.ai/v1",
    DEEPSEEK: "https://api.deepseek.com/v1",
    QWEN: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };

  /**
   * Send a chat completion request to the configured AI provider.
   */
  async chat(
    messages: AiChatMessage[],
    options: AiChatOptions,
  ): Promise<AiChatResult> {
    const { provider, apiKey, model, temperature = 0.7, maxTokens = 1024 } = options;

    this.logger.debug(`AI chat: provider=${provider} model=${model} messages=${messages.length}`);

    try {
      switch (provider) {
        case "GEMINI":
          return this.chatGemini(messages, apiKey, model, temperature, maxTokens);
        case "CLAUDE":
          return this.chatClaude(messages, apiKey, model, temperature, maxTokens);
        default:
          // OpenAI-compatible: OPENAI, GROK, DEEPSEEK, QWEN
          return this.chatOpenAICompatible(provider, messages, apiKey, model, temperature, maxTokens);
      }
    } catch (err) {
      this.logger.error(`AI chat error (${provider}/${model}): ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Quick test: send a simple message and return the response.
   */
  async test(
    options: AiChatOptions,
    testMessage?: string,
  ): Promise<{ success: boolean; response?: string; error?: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const result = await this.chat(
        [
          { role: "system", content: "Sos un asistente de prueba. Respondé brevemente en español." },
          { role: "user", content: testMessage || "Decime hola en una oración corta." },
        ],
        { ...options, maxTokens: 100 },
      );
      return {
        success: true,
        response: result.content,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
        latencyMs: Date.now() - start,
      };
    }
  }

  // ─── OpenAI-Compatible (OpenAI, Grok, DeepSeek, Qwen) ─────

  private async chatOpenAICompatible(
    provider: AiProvider,
    messages: AiChatMessage[],
    apiKey: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<AiChatResult> {
    const baseUrl = this.endpoints[provider];
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`${provider} API error ${res.status}: ${errorBody.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${provider} returned empty response`);

    return {
      content,
      provider,
      model,
      tokensUsed: data.usage?.total_tokens,
    };
  }

  // ─── Google Gemini ─────────────────────────────────────

  private async chatGemini(
    messages: AiChatMessage[],
    apiKey: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<AiChatResult> {
    const baseUrl = this.endpoints.GEMINI;

    // Convert to Gemini format
    const systemInstruction = messages.find((m) => m.role === "system")?.content;
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const res = await fetch(
      `${baseUrl}/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${errorBody.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("Gemini returned empty response");

    return {
      content,
      provider: "GEMINI",
      model,
      tokensUsed: data.usageMetadata?.totalTokenCount,
    };
  }

  // ─── Anthropic Claude ──────────────────────────────────

  private async chatClaude(
    messages: AiChatMessage[],
    apiKey: string,
    model: string,
    temperature: number,
    maxTokens: number,
  ): Promise<AiChatResult> {
    const baseUrl = this.endpoints.CLAUDE;

    // Extract system prompt
    const systemMessage = messages.find((m) => m.role === "system")?.content;
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages,
    };
    if (systemMessage) {
      body.system = systemMessage;
    }

    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`Claude API error ${res.status}: ${errorBody.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const content = data.content?.find((c) => c.type === "text")?.text;
    if (!content) throw new Error("Claude returned empty response");

    return {
      content,
      provider: "CLAUDE",
      model,
      tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    };
  }
}
