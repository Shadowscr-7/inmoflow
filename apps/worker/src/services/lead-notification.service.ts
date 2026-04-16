import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class LeadNotificationService {
  private readonly logger = new Logger(LeadNotificationService.name);

  private readonly transporter = nodemailer.createTransport({
    host: process.env.NOTIFICATION_SMTP_HOST ?? "smtp.gmail.com",
    port: parseInt(process.env.NOTIFICATION_SMTP_PORT ?? "587", 10),
    secure: (process.env.NOTIFICATION_SMTP_SECURE ?? "false") === "true",
    auth: {
      user: process.env.NOTIFICATION_EMAIL_USER ?? "jgomez@aivanguardlabs.com",
      pass: process.env.NOTIFICATION_EMAIL_PASS ?? "",
    },
  });

  constructor(private readonly prisma: PrismaService) {}

  async sendNewLeadNotification(tenantId: string, leadId: string): Promise<void> {
    const from = process.env.NOTIFICATION_EMAIL_USER ?? "jgomez@aivanguardlabs.com";
    const to = process.env.NOTIFICATION_EMAIL_TO ?? from;

    if (!process.env.NOTIFICATION_EMAIL_PASS) {
      this.logger.warn("NOTIFICATION_EMAIL_PASS not set — skipping lead email notification");
      return;
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      include: {
        source: true,
        stage: true,
        assignee: true,
        tags: { include: { tag: true } },
        profile: true,
      },
    });

    if (!lead) return;

    const agentName = lead.assignee?.name ?? lead.assignee?.email ?? null;
    const subject = `Nuevo Lead - ${agentName ?? "Sin Agente asignado"}`;

    const html = this.buildHtml(lead, agentName);

    try {
      await this.transporter.sendMail({
        from: `"InmoFlow Leads" <${from}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Lead notification sent for lead ${leadId} → ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send lead notification: ${(err as Error).message}`);
    }
  }

  // ─── HTML builder ───────────────────────────────────

  private buildHtml(
    lead: LeadWithRelations,
    agentName: string | null,
  ): string {
    const created = new Date(lead.createdAt).toLocaleString("es-UY", {
      timeZone: "America/Montevideo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // Parse form field responses from notes
    const formRows = this.parseNotesSection(lead.notes ?? "");

    // Pill colors
    const statusColors: Record<string, string> = {
      NEW: "#3b82f6", CONTACTED: "#8b5cf6", QUALIFIED: "#10b981",
      VISIT: "#f59e0b", NEGOTIATION: "#f97316", WON: "#22c55e", LOST: "#ef4444",
    };
    const statusColor = statusColors[lead.status] ?? "#6b7280";

    const tempColors: Record<string, string> = { HOT: "#ef4444", WARM: "#f59e0b", COLD: "#6b7280" };
    const tempColor = tempColors[lead.temperature ?? ""] ?? "#6b7280";
    const tempLabel: Record<string, string> = { HOT: "🔥 Caliente", WARM: "🌡️ Tibio", COLD: "❄️ Frío" };

    const row = (label: string, value: string | null | undefined, link?: string) => {
      if (!value) return "";
      const val = link
        ? `<a href="${link}" style="color:#6366f1;text-decoration:none;">${value}</a>`
        : `<span style="color:#111827;font-weight:500;">${value}</span>`;
      return `
        <tr>
          <td style="padding:8px 12px;color:#6b7280;font-size:13px;width:160px;vertical-align:top;white-space:nowrap;">${label}</td>
          <td style="padding:8px 12px;font-size:13px;">${val}</td>
        </tr>`;
    };

    const section = (title: string, content: string) => `
      <div style="margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#9ca3af;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #f3f4f6;">
          ${title}
        </div>
        ${content}
      </div>`;

    const contactContent = `
      <table style="width:100%;border-collapse:collapse;">
        ${row("Nombre", lead.name)}
        ${row("Teléfono", lead.phone, lead.phone ? `https://wa.me/${lead.phone?.replace(/\D/g, "")}` : undefined)}
        ${row("Email", lead.email, lead.email ? `mailto:${lead.email}` : undefined)}
        ${row("Canal", lead.primaryChannel)}
        ${row("WhatsApp ID", lead.whatsappFrom)}
        ${row("Telegram ID", lead.telegramUserId)}
      </table>`;

    const crmContent = `
      <table style="width:100%;border-collapse:collapse;">
        ${row("Estado", `<span style="background:${statusColor};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;">${lead.status}</span>`)}
        ${row("Temperatura", lead.temperature ? `<span style="background:${tempColor};color:#fff;padding:2px 10px;border-radius:999px;font-size:12px;">${tempLabel[lead.temperature] ?? lead.temperature}</span>` : null)}
        ${row("Score", lead.score != null ? `${lead.score} / 100` : null)}
        ${row("Etapa", lead.stage?.name)}
        ${row("Fuente", lead.source?.name)}
        ${row("Agente asignado", agentName ?? "Sin agente")}
        ${row("Intención", lead.intent)}
        ${row("Tags", lead.tags.map((t) => t.tag.name).join(", ") || null)}
        ${row("Creado", created)}
      </table>`;

    const notesBase = (lead.notes ?? "").split("Respuestas del formulario:")[0].trim();
    const notesContent = notesBase
      ? `<div style="font-size:13px;color:#374151;white-space:pre-line;line-height:1.6;">${notesBase}</div>`
      : "";

    const formContent = formRows.length > 0
      ? `<table style="width:100%;border-collapse:collapse;">${formRows.map(([k, v]) =>
          `<tr>
            <td style="padding:7px 12px;color:#6b7280;font-size:13px;width:200px;vertical-align:top;">${this.capitalize(k.replace(/_/g, " "))}</td>
            <td style="padding:7px 12px;font-size:13px;font-weight:600;color:#111827;">${v}</td>
          </tr>`).join("")}
        </table>`
      : "";

    return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);border-radius:12px 12px 0 0;padding:28px 32px;">
          <div style="font-size:22px;font-weight:700;color:#fff;">🏠 Nuevo Lead</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.85);margin-top:4px;">
            ${lead.name ? `<strong>${lead.name}</strong> — ` : ""}${agentName ? `Asignado a <strong>${agentName}</strong>` : "<em>Sin agente asignado</em>"}
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:6px;">${created} · ID: <code style="font-size:11px;">${lead.id.slice(0, 8)}</code></div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:28px 32px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">

          ${section("Contacto", contactContent)}
          ${section("Información CRM", crmContent)}
          ${notesContent ? section("Notas", notesContent) : ""}
          ${formContent ? section("Respuestas del formulario", formContent) : ""}

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
          <span style="font-size:12px;color:#9ca3af;">InmoFlow CRM · Notificación automática de nuevo lead</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private parseNotesSection(notes: string): [string, string][] {
    const marker = "Respuestas del formulario:";
    const idx = notes.indexOf(marker);
    if (idx === -1) return [];
    const section = notes.slice(idx + marker.length);
    const rows: [string, string][] = [];
    for (const line of section.split("\n")) {
      const m = line.match(/^[•\-]\s+(.+?):\s+(.+)$/);
      if (m) rows.push([m[1].trim(), m[2].trim()]);
    }
    return rows;
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

// ─── Type helper ────────────────────────────────────

type LeadWithRelations = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  temperature: string | null;
  score: number | null;
  primaryChannel: string | null;
  whatsappFrom: string | null;
  telegramUserId: string | null;
  intent: string | null;
  notes: string | null;
  createdAt: Date;
  source: { name: string } | null;
  stage: { name: string } | null;
  assignee: { name: string | null; email: string } | null;
  tags: Array<{ tag: { name: string } }>;
  profile: unknown;
};
