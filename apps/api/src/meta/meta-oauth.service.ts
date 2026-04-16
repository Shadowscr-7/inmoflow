import { Injectable, Logger, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EventLogService } from "../event-log/event-log.service";
import { EncryptionService } from "../common/encryption.service";
import { LeadSourceType, EventType } from "@inmoflow/db";

const GRAPH_API = "https://graph.facebook.com/v19.0";

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
}

interface MetaForm {
  id: string;
  name: string;
  status: string;
  created_time?: string;
}

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLog: EventLogService,
    private readonly encryption: EncryptionService,
  ) {
    this.appId = process.env.META_APP_ID ?? "";
    this.appSecret = process.env.META_APP_SECRET ?? "";

    const apiUrl = process.env.WEBHOOK_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    this.redirectUri = `${apiUrl}/api/meta/callback`;
  }

  /** Check if Meta OAuth is configured */
  isConfigured(): boolean {
    return !!(this.appId && this.appSecret);
  }

  // ─── Step 1: Generate OAuth URL ────────────────────

  generateAuthUrl(tenantId: string, userId: string): string {
    if (!this.isConfigured()) {
      throw new BadRequestException("Meta OAuth no está configurado (falta META_APP_ID y META_APP_SECRET)");
    }

    // Encode tenant + user info into state, signed with HMAC to prevent tampering
    const stateData = Buffer.from(
      JSON.stringify({ tenantId, userId, ts: Date.now() }),
    ).toString("base64url");
    const hmac = crypto.createHmac("sha256", this.getSigningSecret()).update(stateData).digest("hex");
    const statePayload = `${stateData}.${hmac}`;

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state: statePayload,
      scope: [
        "pages_show_list",
        "pages_read_engagement",
        "pages_manage_ads",
        "pages_manage_metadata",
        "leads_retrieval",
        "business_management",
      ].join(","),
      response_type: "code",
    });

    return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  }

  // ─── Step 2: Handle OAuth callback ─────────────────

  async handleCallback(code: string, state: string): Promise<{ tenantId: string; tenantName: string }> {
    // Verify HMAC signature on state to prevent CSRF/tampering
    let tenantId: string;
    try {
      const [stateData, hmac] = state.split(".");
      if (!stateData || !hmac) throw new Error("Malformed state");

      const expectedHmac = crypto.createHmac("sha256", this.getSigningSecret()).update(stateData).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
        throw new Error("HMAC mismatch");
      }

      const payload = JSON.parse(Buffer.from(stateData, "base64url").toString());
      tenantId = payload.tenantId;
      if (!tenantId) throw new Error("Missing tenantId");

      // Reject states older than 10 minutes
      if (payload.ts && Date.now() - payload.ts > 10 * 60 * 1000) {
        throw new Error("State expired");
      }
    } catch (err) {
      this.logger.warn(`Meta OAuth invalid state: ${(err as Error).message}`);
      throw new BadRequestException("Estado inválido en callback de Meta");
    }

    // Exchange code for short-lived token
    const tokenRes = await this.graphFetch<{
      access_token: string;
      token_type: string;
      expires_in: number;
    }>("/oauth/access_token", {
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });

    if (!tokenRes.access_token) {
      throw new InternalServerErrorException("No se recibió access_token de Meta");
    }

    // Exchange for long-lived token (60 days)
    const longLivedRes = await this.graphFetch<{
      access_token: string;
      token_type: string;
      expires_in: number;
    }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: tokenRes.access_token,
    });

    const longLivedToken = longLivedRes.access_token ?? tokenRes.access_token;

    // Store on tenant (encrypted)
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { metaUserAccessToken: this.encryption.encrypt(longLivedToken) },
    });

    this.logger.log(`Meta OAuth completed for tenant ${tenantId.slice(0, 8)}`);

    await this.eventLog.log({
      tenantId,
      type: EventType.channel_connected,
      entity: "Tenant",
      entityId: tenantId,
      message: "Meta OAuth connected successfully",
    });

    return { tenantId, tenantName: tenant.name };
  }

  // ─── Step 3: List pages ────────────────────────────

  async listPages(tenantId: string): Promise<MetaPage[]> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const rawToken = tenant?.metaUserAccessToken;
    if (!rawToken) {
      throw new BadRequestException("No hay token de Meta. Conectá tu cuenta primero.");
    }
    const token = this.encryption.decrypt(rawToken);

    const res = await this.graphFetch<{ data: MetaPage[] }>("/me/accounts", {
      access_token: token,
      fields: "id,name,access_token,category",
      limit: "100",
    });

    const classicPages: MetaPage[] = (res.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      access_token: p.access_token,
      category: p.category,
    }));

    // Also fetch pages managed via Meta Business Suite (New Pages Experience)
    // These don't appear in /me/accounts but are accessible via /me/businesses
    const businessPages: MetaPage[] = [];
    try {
      const businesses = await this.graphFetch<{ data: { id: string; name: string }[] }>("/me/businesses", {
        access_token: token,
        fields: "id,name",
        limit: "50",
      });
      for (const biz of businesses.data ?? []) {
        try {
          const bPages = await this.graphFetch<{ data: MetaPage[] }>(`/${biz.id}/owned_pages`, {
            access_token: token,
            fields: "id,name,access_token,category",
            limit: "100",
          });
          for (const p of bPages.data ?? []) {
            if (!classicPages.find((c) => c.id === p.id)) {
              businessPages.push({
                id: p.id,
                name: p.name,
                access_token: p.access_token,
                category: p.category,
              });
            }
          }
        } catch (err) {
          this.logger.warn(`Could not fetch pages for business ${biz.id}: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`Could not fetch businesses (scope may be missing): ${(err as Error).message}`);
    }

    const all = [...classicPages, ...businessPages];
    this.logger.log(`Meta pages found: ${all.length} (${classicPages.length} classic, ${businessPages.length} via Business)`);
    return all;
  }

  // ─── Step 4: List forms for a page ─────────────────

  async listForms(tenantId: string, pageId: string): Promise<MetaForm[]> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const rawToken = tenant?.metaUserAccessToken;
    if (!rawToken) {
      throw new BadRequestException("No hay token de Meta. Conectá tu cuenta primero.");
    }

    // Get the page access token
    const pages = await this.listPages(tenantId);
    const page = pages.find((p) => p.id === pageId);
    if (!page) {
      throw new BadRequestException(`Página ${pageId} no encontrada o sin permisos`);
    }

    const res = await this.graphFetch<{ data: MetaForm[] }>(
      `/${pageId}/leadgen_forms`,
      {
        access_token: page.access_token,
        fields: "id,name,status,created_time",
        limit: "100",
      },
    );

    return (res.data ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      created_time: f.created_time,
    }));
  }

  // ─── Step 5: Connect a page+form as LeadSource ─────

  async connectPageForm(
    tenantId: string,
    data: {
      pageId: string;
      formId?: string | null;  // null = catch-all (all forms on this page)
      pageName: string;
      formName?: string | null;
    },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const rawToken = tenant?.metaUserAccessToken;
    if (!rawToken) {
      throw new BadRequestException("No hay token de Meta. Conectá tu cuenta primero.");
    }

    // Get the page access token (permanent when derived from long-lived token)
    const pages = await this.listPages(tenantId);
    const page = pages.find((p) => p.id === data.pageId);
    if (!page) {
      throw new BadRequestException(`Página ${data.pageId} no encontrada`);
    }

    // Subscribe the page to leadgen webhooks
    try {
      await this.graphPost(`/${data.pageId}/subscribed_apps`, {
        access_token: page.access_token,
        subscribed_fields: "leadgen",
      });
      this.logger.log(`Subscribed page ${data.pageId} to leadgen webhooks`);
    } catch (err) {
      this.logger.warn(`Failed to subscribe page to webhooks: ${(err as Error).message}`);
      // Continue anyway — subscription can be done manually
    }

    // Check for existing source
    const existing = await this.prisma.leadSource.findFirst({
      where: {
        tenantId,
        type: LeadSourceType.META_LEAD_AD,
        metaPageId: data.pageId,
        metaFormId: data.formId ?? null,
      },
    });

    const sourceName = data.formId
      ? `${data.pageName} — ${data.formName ?? data.formId}`
      : `${data.pageName} (todos los formularios)`;

    if (existing) {
      // Update existing
      const source = await this.prisma.leadSource.update({
        where: { id: existing.id },
        data: {
          metaPageAccessToken: page.access_token,
          metaPageName: data.pageName,
          metaFormName: data.formName ?? null,
          name: sourceName,
          enabled: true,
        },
      });
      return source;
    }

    // Create new LeadSource
    const source = await this.prisma.leadSource.create({
      data: {
        tenantId,
        type: LeadSourceType.META_LEAD_AD,
        name: sourceName,
        metaPageId: data.pageId,
        metaFormId: data.formId ?? null,
        metaPageName: data.pageName,
        metaFormName: data.formName ?? null,
        metaPageAccessToken: page.access_token,
        enabled: true,
      },
    });

    await this.eventLog.log({
      tenantId,
      type: EventType.lead_created,
      entity: "LeadSource",
      entityId: source.id,
      message: `Meta Lead Ad source connected: ${sourceName}`,
    });

    return source;
  }

  // ─── Disconnect ────────────────────────────────────

  async disconnect(tenantId: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { metaUserAccessToken: null },
    });

    this.logger.log(`Meta OAuth disconnected for tenant ${tenantId.slice(0, 8)}`);
  }

  /** Check if tenant has valid Meta connection */
  async getConnectionStatus(tenantId: string) {
    if (!tenantId) return { connected: false };

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { metaUserAccessToken: true },
    });

    const hasToken = !!tenant?.metaUserAccessToken;

    // Optionally validate token is still alive
    if (hasToken) {
      try {
        const token = this.encryption.decrypt(tenant!.metaUserAccessToken!);
        const res = await this.graphFetch<{ id: string; name: string }>("/me", {
          access_token: token,
          fields: "id,name",
        });
        return { connected: true, metaUserId: res.id, metaUserName: res.name };
      } catch {
        return { connected: false, error: "Token expirado o inválido" };
      }
    }

    return { connected: false };
  }

  // ─── Helpers ───────────────────────────────────────

  private async graphFetch<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${GRAPH_API}${path}?${new URLSearchParams(params).toString()}`;
    const res = await fetch(url);
    const body = await res.json() as T & { error?: { message: string; type: string; code: number } };

    if ((body as any).error) {
      const err = (body as any).error;
      this.logger.warn(`Graph API error: ${err.message} (${err.code})`);
      throw new BadRequestException(`Meta API: ${err.message}`);
    }

    return body;
  }

  private async graphPost<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${GRAPH_API}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const body = await res.json() as T & { error?: { message: string; type: string; code: number } };

    if ((body as any).error) {
      const err = (body as any).error;
      this.logger.warn(`Graph API POST error: ${err.message} (${err.code})`);
      throw new BadRequestException(`Meta API: ${err.message}`);
    }

    return body;
  }

  /** Get the secret used for HMAC-signing OAuth state params */
  private getSigningSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET environment variable is required");
    return secret;
  }
}
