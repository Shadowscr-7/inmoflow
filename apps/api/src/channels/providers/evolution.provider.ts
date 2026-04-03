import { Injectable, Logger } from "@nestjs/common";

/**
 * Evolution API v2 provider for WhatsApp multi-session.
 * Each tenant gets their own Evolution instance (QR-based auth).
 *
 * Compatible with evoapicloud/evolution-api v2.x
 * Docs: https://doc.evolution-api.com/
 */
@Injectable()
export class EvolutionProvider {
  private readonly logger = new Logger(EvolutionProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    // Remove trailing slash from base URL
    const raw = process.env.EVOLUTION_API_URL ?? "http://localhost:8080";
    this.baseUrl = raw.replace(/\/+$/, "");
    this.apiKey = process.env.EVOLUTION_API_KEY ?? "";
  }

  /** Check if the Evolution API is reachable */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl, {
        method: "GET",
        headers: { apikey: this.apiKey },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`${method} ${url}`);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          apikey: this.apiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.logger.error(`Evolution API error ${res.status}: ${text}`);
        return { ok: false, status: res.status, error: text };
      }

      if (res.status === 204) return { ok: true, data: undefined as T };
      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err) {
      const msg = (err as Error).message ?? "Network error";
      this.logger.error(`Evolution API fetch failed: ${msg}`);
      return { ok: false, status: 0, error: msg };
    }
  }

  /** Throw-aware version for internal use */
  private async requestOrThrow<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const result = await this.request<T>(method, path, body);
    if (!result.ok) {
      throw new Error(`Evolution API ${method} ${path}: ${result.status} ${result.error}`);
    }
    return result.data;
  }

  /**
   * Fetch all existing instances (to check if one already exists).
   */
  async fetchInstances(): Promise<Array<{ instance: { instanceName: string; status: string } }>> {
    const result = await this.request<Array<{ instance: { instanceName: string; status: string } }>>(
      "GET",
      "/instance/fetchInstances",
    );
    if (!result.ok) return [];
    return Array.isArray(result.data) ? result.data : [];
  }

  /**
   * Check if a specific instance exists.
   */
  async instanceExists(instanceName: string): Promise<boolean> {
    const instances = await this.fetchInstances();
    return instances.some((i) => i.instance?.instanceName === instanceName);
  }

  /**
   * Update the webhook URL on an existing Evolution instance.
   * Call this when the public API URL changes (e.g. after a deploy).
   */
  async updateWebhook(instanceName: string, webhookUrl: string): Promise<boolean> {
    const result = await this.request("PUT", `/webhook/set/${instanceName}`, {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      enabled: true,
      events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
    });
    if (result.ok) {
      this.logger.log(`Webhook updated for ${instanceName}: ${webhookUrl}`);
    } else {
      this.logger.warn(`Failed to update webhook for ${instanceName}: ${(result as { error: string }).error}`);
    }
    return result.ok;
  }

  /**
   * Create a new WA instance for a tenant.
   * If the instance already exists, updates its webhook URL and returns it (idempotent).
   */
  async createInstance(
    instanceName: string,
    webhookUrl: string,
  ): Promise<{ instanceName: string; created: boolean; error?: string }> {
    // Check if instance already exists
    const exists = await this.instanceExists(instanceName);
    if (exists) {
      this.logger.log(`Instance ${instanceName} already exists — updating webhook URL`);
      // Always sync the webhook URL in case the server URL changed since the instance was created
      await this.updateWebhook(instanceName, webhookUrl);
      return { instanceName, created: false };
    }

    const result = await this.request<{
      instance?: { instanceName: string; status: string };
      hash?: { apikey: string };
    }>("POST", "/instance/create", {
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          "MESSAGES_UPSERT",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
        ],
      },
    });

    if (!result.ok) {
      // If it's a "already exists" type error, treat as success
      if (result.error?.includes("already") || result.status === 409) {
        this.logger.log(`Instance ${instanceName} already exists (conflict), reusing`);
        return { instanceName, created: false };
      }
      return { instanceName, created: false, error: `Evolution API error ${result.status}: ${result.error}` };
    }

    this.logger.log(`Instance created: ${instanceName}`);
    return { instanceName, created: true };
  }

  /**
   * Get the QR code for an instance (base64 or pairingCode).
   * Uses /instance/connect/ endpoint (starts connection + returns QR).
   */
  async getQrCode(instanceName: string): Promise<{ base64: string; pairingCode?: string } | null> {
    const result = await this.request<{
      base64?: string;
      pairingCode?: string;
      code?: string;
    }>("GET", `/instance/connect/${instanceName}`);

    if (!result.ok) {
      this.logger.warn(`Could not get QR for ${instanceName}: ${result.error}`);
      return null;
    }

    const data = result.data;
    return {
      base64: data?.base64 ?? data?.code ?? "",
      pairingCode: data?.pairingCode,
    };
  }

  /**
   * Check the connection state of an instance.
   */
  async getConnectionState(instanceName: string): Promise<{ state: string }> {
    const result = await this.request<{
      instance?: { state: string };
      state?: string;
    }>("GET", `/instance/connectionState/${instanceName}`);

    if (!result.ok) return { state: "close" };

    const data = result.data;
    return { state: data?.instance?.state ?? data?.state ?? "close" };
  }

  /**
   * Send a text message through an instance.
   */
  async sendText(instanceName: string, to: string, text: string) {
    return this.requestOrThrow("POST", `/message/sendText/${instanceName}`, {
      number: to,
      text,
    });
  }

  /**
   * Send a media message (image, video, audio, document) through an instance.
   * Uses Evolution API v2 /message/sendMedia endpoint.
   */
  async sendMedia(
    instanceName: string,
    to: string,
    mediaUrl: string,
    mediaType: "image" | "video" | "audio" | "document",
    caption?: string,
    fileName?: string,
  ) {
    return this.requestOrThrow("POST", `/message/sendMedia/${instanceName}`, {
      number: to,
      mediatype: mediaType,
      media: mediaUrl,
      caption: caption ?? "",
      ...(fileName && { fileName }),
    });
  }

  /**
   * Fetch chat messages from Evolution API for a specific JID.
   * Uses POST /chat/findMessages/{instanceName}
   */
  async fetchMessages(
    instanceName: string,
    remoteJid: string,
    limit = 100,
  ): Promise<Array<{
    key: { id: string; remoteJid: string; fromMe: boolean };
    pushName?: string;
    message?: { conversation?: string; extendedTextMessage?: { text?: string } };
    messageTimestamp?: number;
    messageType?: string;
  }>> {
    const result = await this.request<{
      messages?: {
        total?: number;
        records?: Array<{
          key: { id: string; remoteJid: string; fromMe: boolean };
          pushName?: string;
          message?: { conversation?: string; extendedTextMessage?: { text?: string } };
          messageTimestamp?: number;
          messageType?: string;
        }>;
      } | Array<{
        key: { id: string; remoteJid: string; fromMe: boolean };
        pushName?: string;
        message?: { conversation?: string; extendedTextMessage?: { text?: string } };
        messageTimestamp?: number;
        messageType?: string;
      }>;
    }>("POST", `/chat/findMessages/${instanceName}`, {
      where: {
        key: { remoteJid },
      },
      limit,
    });

    if (!result.ok) {
      this.logger.warn(`fetchMessages failed for ${instanceName}: ${result.error}`);
      return [];
    }

    const data = result.data;
    // Handle various response shapes from Evolution API
    if (Array.isArray(data)) return data as any;
    if (!data?.messages) return [];
    // v2 returns { messages: { total, records: [...] } }
    if (!Array.isArray(data.messages) && (data.messages as any)?.records) {
      return (data.messages as any).records ?? [];
    }
    // Fallback: messages is an array
    if (Array.isArray(data.messages)) return data.messages;
    return [];
  }

  /**
   * Logout/disconnect an instance without deleting it.
   */
  async logoutInstance(instanceName: string) {
    const result = await this.request("DELETE", `/instance/logout/${instanceName}`);
    return result.ok;
  }

  /**
   * Delete an instance entirely.
   */
  async deleteInstance(instanceName: string) {
    const result = await this.request("DELETE", `/instance/delete/${instanceName}`);
    return result.ok;
  }
}
