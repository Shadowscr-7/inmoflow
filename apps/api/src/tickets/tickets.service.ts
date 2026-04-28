import { Injectable, NotFoundException, ForbiddenException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TicketStatus } from "@inmoflow/db";
import { CreateTicketDto, UpdateTicketDto } from "./dto";

const TICKET_INCLUDE = {
  creator: { select: { id: true, name: true, email: true, role: true } },
  attachments: true,
  tenant: { select: { id: true, name: true } },
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget webhook call when a ticket is created */
  private async callWebhook(ticket: { id: string; title: string; description: string; priority: string; tenantId: string; creatorId: string }) {
    const url = process.env.TICKET_WEBHOOK_URL;
    if (!url) return;
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "ticket.created",
          ticketId: ticket.id,
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          tenantId: ticket.tenantId,
          creatorId: ticket.creatorId,
        }),
      });
    } catch (err) {
      this.logger.warn(`Ticket webhook call failed: ${(err as Error).message}`);
    }
  }

  /** Resolve ticket via external callback (e.g. GitHub/Claude push) */
  async resolveByWebhook(ticketId: string, secret: string, resolvedNote?: string) {
    const expected = process.env.TICKET_WEBHOOK_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException("Invalid webhook secret");
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { creator: { select: { id: true, name: true } } },
    });
    if (!ticket) throw new NotFoundException("Ticket no encontrado");

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.RESOLVED,
        ...(resolvedNote ? { adminNote: resolvedNote } : {}),
      },
    });

    // Create in-app notification for the ticket creator
    if (ticket.creatorId) {
      await this.prisma.notification.create({
        data: {
          tenantId: ticket.tenantId,
          userId: ticket.creatorId,
          type: "system",
          title: "Incidencia resuelta",
          message: `Tu incidencia "${ticket.title}" ha sido resuelta.${resolvedNote ? " " + resolvedNote : ""}`,
          entity: "ticket",
          entityId: ticketId,
        },
      }).catch(() => { /* non-critical */ });
    }

    return { ok: true, ticketId };
  }

  async create(tenantId: string, creatorId: string, dto: CreateTicketDto) {
    const { attachmentUrls, ...data } = dto;

    const ticket = await this.prisma.ticket.create({
      data: {
        tenantId,
        creatorId,
        title: data.title,
        description: data.description,
        priority: data.priority ?? "MEDIUM",
        ...(attachmentUrls?.length
          ? {
              attachments: {
                create: attachmentUrls.map((url) => ({
                  url,
                  filename: url.split("/").pop() ?? "archivo",
                  mimetype: "application/octet-stream",
                  size: 0,
                })),
              },
            }
          : {}),
      },
      include: TICKET_INCLUDE,
    });

    this.callWebhook(ticket).catch(() => {});

    return ticket;
  }

  async findAll(
    callerRole: string,
    callerTenantId: string | null,
    callerId: string,
    filters?: { status?: TicketStatus; tenantId?: string; creatorId?: string },
  ) {
    const where: Record<string, unknown> = {};

    if (callerRole === "ADMIN") {
      if (filters?.tenantId) where.tenantId = filters.tenantId;
      if (filters?.creatorId) where.creatorId = filters.creatorId;
    } else if (callerRole === "BUSINESS") {
      where.tenantId = callerTenantId;
      if (filters?.creatorId) where.creatorId = filters.creatorId;
    } else {
      // AGENT / VIEWER — own tickets only
      where.tenantId = callerTenantId;
      where.creatorId = callerId;
    }

    if (filters?.status) where.status = filters.status;

    return this.prisma.ticket.findMany({
      where,
      include: TICKET_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(
    id: string,
    callerRole: string,
    callerTenantId: string | null,
    callerId: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, include: TICKET_INCLUDE });
    if (!ticket) throw new NotFoundException("Ticket no encontrado");

    if (callerRole === "ADMIN") return ticket;
    if (ticket.tenantId !== callerTenantId) throw new ForbiddenException("Sin acceso");
    if (callerRole === "AGENT" && ticket.creatorId !== callerId) throw new ForbiddenException("Sin acceso");

    return ticket;
  }

  async update(
    id: string,
    dto: UpdateTicketDto,
    callerRole: string,
    callerTenantId: string | null,
    callerId: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("Ticket no encontrado");

    if (callerRole !== "ADMIN") {
      if (ticket.tenantId !== callerTenantId) throw new ForbiddenException("Sin acceso");

      // Non-admin can only edit own ticket while PENDING
      if (ticket.creatorId !== callerId) throw new ForbiddenException("Solo el creador puede editar");
      if (ticket.status !== TicketStatus.PENDING) throw new ForbiddenException("No se puede editar: ya no está en estado pendiente");

      // Non-admin can't change status or adminNote
      delete dto.status;
      delete dto.adminNote;
    }

    return this.prisma.ticket.update({
      where: { id },
      data: dto,
      include: TICKET_INCLUDE,
    });
  }

  async addAttachments(
    ticketId: string,
    attachments: { url: string; filename: string; mimetype: string; size: number }[],
    callerRole: string,
    callerTenantId: string | null,
    callerId: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException("Ticket no encontrado");

    if (callerRole !== "ADMIN") {
      if (ticket.tenantId !== callerTenantId) throw new ForbiddenException("Sin acceso");
      if (ticket.creatorId !== callerId) throw new ForbiddenException("Sin acceso");
      if (ticket.status !== TicketStatus.PENDING) throw new ForbiddenException("No se puede modificar: estado no es pendiente");
    }

    await this.prisma.ticketAttachment.createMany({
      data: attachments.map((a) => ({ ticketId, ...a })),
    });

    return this.prisma.ticket.findUnique({ where: { id: ticketId }, include: TICKET_INCLUDE });
  }

  async removeAttachment(
    attachmentId: string,
    callerRole: string,
    callerTenantId: string | null,
    callerId: string,
  ) {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
      include: { ticket: true },
    });
    if (!attachment) throw new NotFoundException("Adjunto no encontrado");

    if (callerRole !== "ADMIN") {
      if (attachment.ticket.tenantId !== callerTenantId) throw new ForbiddenException("Sin acceso");
      if (attachment.ticket.creatorId !== callerId) throw new ForbiddenException("Sin acceso");
      if (attachment.ticket.status !== TicketStatus.PENDING) throw new ForbiddenException("No se puede modificar");
    }

    await this.prisma.ticketAttachment.delete({ where: { id: attachmentId } });
  }

  async remove(id: string, callerRole: string, callerTenantId: string | null, callerId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("Ticket no encontrado");

    if (callerRole !== "ADMIN") {
      if (ticket.tenantId !== callerTenantId) throw new ForbiddenException("Sin acceso");
      if (ticket.creatorId !== callerId) throw new ForbiddenException("Solo el creador puede eliminar");
      if (ticket.status !== TicketStatus.PENDING) throw new ForbiddenException("No se puede eliminar: ya no está pendiente");
    }

    await this.prisma.ticket.delete({ where: { id } });
  }
}
