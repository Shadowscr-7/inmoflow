import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import * as nodemailer from "nodemailer";

// Only alert on these 5xx codes — never spam on 4xx client errors
const ALERT_STATUSES = new Set([500, 502, 503, 504]);
// Avoid flooding: minimum seconds between identical errors (same message)
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 min
const recentAlerts = new Map<string, number>();

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let stack: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === "string"
          ? body
          : (body as { message?: string | string[] }).message ?? message;
    } else if (exception instanceof Error) {
      stack = exception.stack;
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
      if (process.env.NODE_ENV === "production") {
        message = "Internal server error";
      } else {
        message = exception.message;
      }
    }

    // Send alert email for server errors only
    if (ALERT_STATUSES.has(status)) {
      const errorMessage = exception instanceof Error ? exception.message : String(exception);
      this.sendAlertEmail(request, status, errorMessage, stack).catch(() => {
        // Never let email failure break the response
      });
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private async sendAlertEmail(
    request: Request,
    status: number,
    errorMessage: string,
    stack?: string,
  ) {
    const emailUser = process.env.NOTIFICATION_EMAIL_USER;
    const emailPass = process.env.NOTIFICATION_EMAIL_PASS;
    const emailTo   = process.env.NOTIFICATION_EMAIL_TO ?? emailUser;

    if (!emailUser || !emailPass || !emailTo) return;

    // Dedup: skip if we already sent the same error recently
    const dedupKey = `${status}:${errorMessage.slice(0, 120)}`;
    const lastSent = recentAlerts.get(dedupKey);
    if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) return;
    recentAlerts.set(dedupKey, Date.now());
    // Prune old entries
    if (recentAlerts.size > 200) {
      const cutoff = Date.now() - DEDUP_WINDOW_MS;
      for (const [k, ts] of recentAlerts) {
        if (ts < cutoff) recentAlerts.delete(k);
      }
    }

    const now = new Date().toLocaleString("es-UY", {
      timeZone: "America/Montevideo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    // Sanitize request body — remove sensitive fields
    let bodySnippet = "";
    try {
      const rawBody = request.body as Record<string, unknown>;
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawBody ?? {})) {
        if (/password|token|secret|apikey|key/i.test(k)) {
          safe[k] = "***";
        } else {
          safe[k] = v;
        }
      }
      bodySnippet = JSON.stringify(safe, null, 2).slice(0, 500);
    } catch {
      bodySnippet = "(no body)";
    }

    // Tenant/user info from JWT (if present)
    const reqUser = (request as any).user as { userId?: string; role?: string } | undefined;
    const tenantId = (request as any).tenantId as string | undefined;

    const shortStack = stack ? stack.slice(0, 3000) : "(no stack)";
    const fullStack  = stack ?? "(no stack)";
    const attachStack = fullStack.length > 3000;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#dc2626;border-radius:12px 12px 0 0;padding:24px 32px;">
          <div style="font-size:20px;font-weight:700;color:#fff;">🚨 Error en InmoFlow API</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">${now} · HTTP ${status}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">

          <!-- Error message -->
          <div style="margin-bottom:20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;margin-bottom:8px;">Mensaje de error</div>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;font-size:13px;color:#991b1b;font-family:monospace;word-break:break-all;">
              ${escapeHtml(errorMessage)}
            </div>
          </div>

          <!-- Request -->
          <div style="margin-bottom:20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;margin-bottom:8px;">Request</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <tr>
                <td style="padding:6px 12px;color:#6b7280;width:140px;">Método / URL</td>
                <td style="padding:6px 12px;font-weight:600;color:#111827;font-family:monospace;">${request.method} ${escapeHtml(request.originalUrl ?? request.url ?? "")}</td>
              </tr>
              ${tenantId ? `<tr><td style="padding:6px 12px;color:#6b7280;">Tenant ID</td><td style="padding:6px 12px;font-family:monospace;color:#111827;">${escapeHtml(tenantId)}</td></tr>` : ""}
              ${reqUser?.userId ? `<tr><td style="padding:6px 12px;color:#6b7280;">User ID</td><td style="padding:6px 12px;font-family:monospace;color:#111827;">${escapeHtml(reqUser.userId)} (${escapeHtml(reqUser.role ?? "")})</td></tr>` : ""}
              ${request.headers["x-forwarded-for"] ? `<tr><td style="padding:6px 12px;color:#6b7280;">IP</td><td style="padding:6px 12px;font-family:monospace;color:#111827;">${escapeHtml(String(request.headers["x-forwarded-for"]))}</td></tr>` : ""}
            </table>
          </div>

          ${bodySnippet && bodySnippet !== "{}" ? `
          <!-- Body -->
          <div style="margin-bottom:20px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;margin-bottom:8px;">Request body (sanitizado)</div>
            <pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;font-size:12px;color:#374151;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;">${escapeHtml(bodySnippet)}</pre>
          </div>
          ` : ""}

          <!-- Stack trace -->
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;margin-bottom:8px;">
              Stack trace ${attachStack ? "(completo en adjunto)" : ""}
            </div>
            <pre style="background:#1f2937;border-radius:8px;padding:12px 16px;font-size:11px;color:#d1d5db;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0;max-height:400px;">${escapeHtml(shortStack)}${attachStack ? "\n\n... (ver adjunto para stack completo)" : ""}</pre>
          </div>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:14px 32px;text-align:center;">
          <span style="font-size:12px;color:#9ca3af;">InmoFlow CRM · Alerta automática de errores</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      host:   process.env.NOTIFICATION_SMTP_HOST ?? "smtp.hostinger.com",
      port:   parseInt(process.env.NOTIFICATION_SMTP_PORT ?? "465", 10),
      secure: (process.env.NOTIFICATION_SMTP_SECURE ?? "true") === "true",
      auth: { user: emailUser, pass: emailPass },
    });

    const attachments: nodemailer.Attachment[] = [];
    if (attachStack) {
      attachments.push({
        filename: `error-stack-${Date.now()}.txt`,
        content: fullStack,
        contentType: "text/plain",
      });
    }

    await transporter.sendMail({
      from:    `"InmoFlow Errors" <${emailUser}>`,
      to:      emailTo,
      subject: `[ERROR ${status}] ${errorMessage.slice(0, 80)}`,
      html,
      attachments,
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
