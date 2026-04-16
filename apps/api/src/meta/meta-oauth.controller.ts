import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  Res,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { IsString, MaxLength, IsOptional } from "class-validator";
import { Response } from "express";
import { MetaOAuthService } from "./meta-oauth.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";

class ConnectPageFormDto {
  @IsString() @MaxLength(100) pageId!: string;
  @IsOptional() @IsString() @MaxLength(100) formId?: string;
  @IsString() @MaxLength(200) pageName!: string;
  @IsOptional() @IsString() @MaxLength(200) formName?: string;
}

@Controller("meta")
export class MetaOAuthController {
  private readonly logger = new Logger(MetaOAuthController.name);

  constructor(private readonly metaOAuth: MetaOAuthService) {}

  /**
   * GET /meta/status
   * Check if Meta OAuth is connected for this tenant.
   */
  @Get("status")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async getStatus(@TenantId() tenantId: string) {
    const configured = this.metaOAuth.isConfigured();
    if (!configured) {
      return { configured: false, connected: false };
    }
    const status = await this.metaOAuth.getConnectionStatus(tenantId);
    return { configured: true, ...status };
  }

  /**
   * GET /meta/auth-url
   * Generate the Facebook OAuth URL. User clicks this to start connecting.
   */
  @Get("auth-url")
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async getAuthUrl(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    const url = this.metaOAuth.generateAuthUrl(tenantId, user.userId);
    return { url };
  }

  /**
   * GET /meta/callback
   * Facebook redirects here after OAuth. This is a public endpoint (no JWT).
   * Returns an HTML page that communicates back to the opener window.
   */
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Query("error_description") errorDesc: string,
    @Res() res: Response,
  ) {
    // If user denied permissions
    if (error) {
      this.logger.warn(`Meta OAuth denied: ${error} — ${errorDesc}`);
      return res.send(this.buildCallbackHtml(false, errorDesc || "Permiso denegado"));
    }

    if (!code || !state) {
      return res.send(this.buildCallbackHtml(false, "Parámetros faltantes"));
    }

    // Allow window.opener access across origin navigation (Meta redirects lose COOP)
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    // Allow inline scripts in this callback page (needed for postMessage + localStorage)
    res.setHeader("Content-Security-Policy", "script-src 'unsafe-inline'");

    try {
      const result = await this.metaOAuth.handleCallback(code, state);
      return res.send(this.buildCallbackHtml(true, undefined, result.tenantName));
    } catch (err) {
      this.logger.error(`Meta OAuth callback error: ${(err as Error).message}`);
      return res.send(this.buildCallbackHtml(false, (err as Error).message));
    }
  }

  /**
   * GET /meta/pages
   * List Facebook pages the connected user manages.
   */
  @Get("pages")
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async listPages(@TenantId() tenantId: string) {
    const pages = await this.metaOAuth.listPages(tenantId);
    // Don't expose access_tokens to frontend
    return pages.map((p) => ({ id: p.id, name: p.name, category: p.category }));
  }

  /**
   * GET /meta/pages/:pageId/forms
   * List lead gen forms for a specific page.
   */
  @Get("pages/:pageId/forms")
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async listForms(
    @TenantId() tenantId: string,
    @Param("pageId") pageId: string,
  ) {
    return this.metaOAuth.listForms(tenantId, pageId);
  }

  /**
   * POST /meta/connect
   * Connect a page + form as a LeadSource.
   */
  @Post("connect")
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async connect(
    @TenantId() tenantId: string,
    @Body() dto: ConnectPageFormDto,
  ) {
    return this.metaOAuth.connectPageForm(tenantId, dto);
  }

  /**
   * DELETE /meta/disconnect
   * Remove the Meta user access token from the tenant.
   */
  @Delete("disconnect")
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async disconnect(@TenantId() tenantId: string) {
    await this.metaOAuth.disconnect(tenantId);
    return { ok: true };
  }

  // ─── Helper: Build callback HTML ───────────────────

  private buildCallbackHtml(success: boolean, error?: string, tenantName?: string): string {
    const message = success
      ? `✅ Meta conectado exitosamente${tenantName ? ` para ${tenantName}` : ""}`
      : `❌ Error: ${error ?? "Error desconocido"}`;

    const bgColor = success ? "#ecfdf5" : "#fef2f2";
    const textColor = success ? "#065f46" : "#991b1b";
    const borderColor = success ? "#a7f3d0" : "#fecaca";

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>InmoFlow — Meta</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0;
      background: #f9fafb;
    }
    .card {
      background: ${bgColor}; border: 1px solid ${borderColor};
      border-radius: 12px; padding: 32px 40px;
      text-align: center; max-width: 420px;
    }
    .icon { font-size: 48px; margin-bottom: 12px; }
    .msg { color: ${textColor}; font-size: 16px; font-weight: 500; }
    .sub { color: #6b7280; font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "🎉" : "😕"}</div>
    <div class="msg">${message}</div>
    <div class="sub">${success ? "Esta ventana se cerrará automáticamente..." : "Cerrá esta ventana e intentá de nuevo."}</div>
  </div>
  <script>
    var msg = {
      type: 'meta-oauth-callback',
      success: ${success},
      ${error ? `error: ${JSON.stringify(error)},` : ""}
    };
    // postMessage to opener (works when COOP allows it)
    if (window.opener) {
      try { window.opener.postMessage(msg, '*'); } catch(e) {}
    }
    // localStorage fallback for when opener is nullified by browser COOP
    try {
      localStorage.setItem('meta-oauth-result', JSON.stringify(Object.assign({}, msg, { ts: Date.now() })));
    } catch(e) {}
    ${success ? "setTimeout(() => { try { window.close(); } catch(e) {} }, 2000);" : ""}
  </script>
</body>
</html>`;
  }
}
