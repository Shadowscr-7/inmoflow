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

    // Send email notification
    await this.sendEmailNotification(lead, agentName);

    // Send Telegram notification
    await this.sendTelegramNotification(lead, agentName);
  }

  private async sendEmailNotification(lead: LeadWithRelations, agentName: string | null): Promise<void> {
    const from = process.env.NOTIFICATION_EMAIL_USER ?? "jgomez@aivanguardlabs.com";
    const to = process.env.NOTIFICATION_EMAIL_TO ?? from;

    if (!process.env.NOTIFICATION_EMAIL_PASS) {
      this.logger.warn("NOTIFICATION_EMAIL_PASS not set — skipping lead email notification");
      return;
    }

    const subject = `Nuevo Lead - ${agentName ?? "Sin Agente asignado"}`;
    const html = this.buildHtml(lead, agentName);

    try {
      await this.transporter.sendMail({
        from: `"InmoFlow Leads" <${from}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Lead email notification sent for lead ${lead.id} → ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send lead email notification: ${(err as Error).message}`);
    }
  }

  private async sendTelegramNotification(lead: LeadWithRelations, agentName: string | null): Promise<void> {
    const botToken = process.env.NOTIFY_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.NOTIFY_TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return; // Telegram notifications not configured
    }

    const text = this.buildTelegramMessage(lead, agentName);

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Telegram notification failed: ${res.status} ${body}`);
      } else {
        this.logger.log(`Lead Telegram notification sent for lead ${lead.id}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send lead Telegram notification: ${(err as Error).message}`);
    }
  }

  private buildTelegramMessage(lead: LeadWithRelations, agentName: string | null): string {
    const isCaptacion = this.isCaptacionLead(lead);

    if (isCaptacion) {
      return this.buildCaptacionMessage(lead, agentName);
    } else {
      return this.buildInteresadoMessage(lead, agentName);
    }
  }

  /** Lead interesado en comprar/alquilar una propiedad */
  private buildInteresadoMessage(lead: LeadWithRelations, agentName: string | null): string {
    const name = lead.name ?? "Desconocido";
    const propertyTitle = this.extractPropertyTitle(lead);
    // Prefer agent from form name over CRM assignee
    const agent = this.extractAgentFromForm(lead) ?? agentName;

    const header = propertyTitle
      ? `✅ Nuevo lead\n${name} está interesad@ en <b>${propertyTitle}</b>`
      : `✅ Nuevo lead\n<b>${name}</b>`;

    const contactParts: string[] = [];
    if (lead.phone) contactParts.push(lead.phone);
    if (lead.email) contactParts.push(lead.email);
    const contactLine = contactParts.length > 0 ? `Contacto: ${contactParts.join(" | ")}` : "";

    const agentLine = agent ? `Agente: ${agent}` : "";

    const parts = [header];
    if (contactLine) parts.push(contactLine);
    if (agentLine) parts.push(agentLine);

    return parts.join("\n\n");
  }

  /** Lead de captación: alguien que ofrece/vende su propiedad */
  private buildCaptacionMessage(lead: LeadWithRelations, agentName: string | null): string {
    // Prefer agent from form name over CRM assignee
    const agent = this.extractAgentFromForm(lead) ?? agentName;
    const agentLabel = agent ? ` (${agent})` : "";
    const header = `✅ Captación de Propiedad 🏡${agentLabel}`;

    const fields: string[] = [];
    if (lead.name)  fields.push(`Nombre: ${lead.name}`);
    if (lead.phone) fields.push(`Teléfono: ${lead.phone}`);
    if (lead.email) fields.push(`Email: ${lead.email}`);

    // Add form fields from notes (tipo propiedad, zona, etc.)
    const formFields = this.extractFormFields(lead.notes ?? "");
    const skipKeys = new Set(["origen", "form", "leadgen id", "nombre", "teléfono", "telefono", "email", "correo"]);
    for (const [k, v] of formFields) {
      if (!skipKeys.has(k.toLowerCase())) {
        fields.push(`${this.capitalize(k)}: ${v}`);
      }
    }

    return `${header}\n\n${fields.join("\n")}`;
  }

  /** Determina si el lead es una captación (alguien que vende/ofrece su propiedad) */
  private isCaptacionLead(lead: LeadWithRelations): boolean {
    const intent = (lead.intent ?? "").toLowerCase();
    if (["venta", "captacion", "captación", "vender"].some((w) => intent.includes(w))) return true;

    const sourceName = (lead.source?.name ?? "").toLowerCase();
    if (["captac", "venta", "vender", "oferta"].some((w) => sourceName.includes(w))) return true;

    // Check form fields for property-offering clues
    const formFields = this.extractFormFields(lead.notes ?? "");
    const hasZona = formFields.some(([k]) => k.toLowerCase().includes("zona"));
    const hasTipoPropiedad = formFields.some(([k]) => k.toLowerCase().includes("tipo") || k.toLowerCase().includes("propiedad"));
    if (hasZona && hasTipoPropiedad) return true;

    return false;
  }

  /** Extrae el título de la propiedad de interés (para leads compradores) */
  private extractPropertyTitle(lead: LeadWithRelations): string | null {
    const notes = lead.notes ?? "";

    // First priority: "Propiedad: ..." line in notes (stored by meta-webhook when form question is parsed)
    const propertyMatch = notes.match(/^[•\-]?\s*[Pp]ropiedad:\s+(.+)$/m);
    if (propertyMatch) return propertyMatch[1].trim();

    const titleMatch = notes.match(/^[•\-]?\s*[Tt][ií]tulo:\s+(.+)$/m);
    if (titleMatch) return titleMatch[1].trim();

    // "Formulario: Apartamento Arroyo Seco - Fabricio-rebaja" → "Apartamento Arroyo Seco"
    // (stored by lead-recovery approval; strip everything from first " - Agent" onwards)
    const formLineMatch = notes.match(/^Formulario:\s+(.+)$/m);
    if (formLineMatch) {
      const raw = formLineMatch[1].trim();
      const withoutAgent = raw.replace(/\s*[-–]\s*[A-ZÁÉÍÓÚÑ].+$/su, "").trim();
      return withoutAgent || null;
    }

    // Try from form fields
    const formFields = this.extractFormFields(notes);
    const propField = formFields.find(([k]) =>
      ["propiedad", "inmueble", "titulo", "título"].includes(k.toLowerCase())
    );
    if (propField) return propField[1];

    // Source name as fallback: strip everything from " - Agent" onwards
    // "Casa en venta - Javier-extra" → "Casa en venta"
    const source = lead.source?.name ?? "";
    if (source && !source.toLowerCase().includes("meta") && !source.toLowerCase().includes("captac") && !source.toLowerCase().includes("todos")) {
      const withoutAgent = source.replace(/\s*[-–]\s*[A-ZÁÉÍÓÚÑ].+$/su, "").trim();
      return withoutAgent || null;
    }

    return null;
  }

  /** Extrae el nombre del agente del formulario (desde notas o nombre de fuente) */
  private extractAgentFromForm(lead: LeadWithRelations): string | null {
    const notes = lead.notes ?? "";

    // "Agente formulario: Javier" line stored by meta-webhook
    const agentMatch = notes.match(/^Agente formulario:\s+(.+)$/m);
    if (agentMatch) return agentMatch[1].trim();

    // "Formulario: Apartamento Arroyo Seco - Fabricio-rebaja" → "Fabricio"
    const formLineAgentMatch = notes.match(/^Formulario:\s+.+[-–]\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/mu);
    if (formLineAgentMatch) return formLineAgentMatch[1].trim();

    // Extract from source/form name
    const sourceName = lead.source?.name ?? "";
    if (!sourceName) return null;

    // "Something - AgentName"
    const dashMatch = sourceName.match(/[-–]\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s*$/u);
    if (dashMatch) return dashMatch[1].trim();

    // "Captacion AgentName"
    const captacMatch = sourceName.match(/[Cc]aptaci[oó]n\w*\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s*$/u);
    if (captacMatch) return captacMatch[1].trim();

    return null;
  }

  private extractFormFields(notes: string): [string, string][] {
    // Try "Respuestas del formulario:" section
    const markerIdx = notes.indexOf("Respuestas del formulario:");
    if (markerIdx !== -1) {
      return this.parseNotesSection(notes);
    }
    // Also try bullet/dash lines anywhere
    const rows: [string, string][] = [];
    for (const line of notes.split("\n")) {
      const m = line.match(/^[•\-]\s+(.+?):\s+(.+)$/);
      if (m) rows.push([m[1].trim(), m[2].trim()]);
    }
    return rows;
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
