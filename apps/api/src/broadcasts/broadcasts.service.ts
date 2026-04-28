import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MessagesService } from "../messages/messages.service";
import { BroadcastStatus, BroadcastItemStatus, LeadSourceType } from "@inmoflow/db";
import { CreateBroadcastDto, UpdateItemsDto, SendBatchDto } from "./dto";

function resolveMessage(template: string, lead: { name?: string | null }, meta: Record<string, unknown> = {}): string {
  return template
    .replace(/\{nombre\}/g, lead.name ?? "cliente")
    .replace(/\{precio_nuevo\}/g, String(meta.newPrice ?? ""))
    .replace(/\{precio_anterior\}/g, String(meta.oldPrice ?? ""))
    .replace(/\{propiedad\}/g, String(meta.propertyTitle ?? ""));
}

const BATCH_INCLUDE = {
  creator: { select: { id: true, name: true, email: true } },
  _count: { select: { items: true } },
};

const ITEM_INCLUDE = {
  lead: { select: { id: true, name: true, phone: true, whatsappFrom: true, primaryChannel: true, status: true, stageId: true, stage: { select: { name: true } } } },
};

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  async create(tenantId: string, createdBy: string, dto: CreateBroadcastDto) {
    const meta = (dto.metadata ?? {}) as Record<string, unknown>;
    const autoStages = dto.autoApproveStageIds ?? [];

    // Resolve leads
    let leadIds: string[] = dto.leadIds ?? [];
    if (leadIds.length === 0 && dto.sourceId) {
      const leads = await this.prisma.lead.findMany({
        where: { tenantId, sourceId: dto.sourceId, phone: { not: null } },
        select: { id: true, name: true, stageId: true },
      });
      leadIds = leads.map((l) => l.id);
    } else if (leadIds.length === 0 && dto.sourceType) {
      const sources = await this.prisma.leadSource.findMany({
        where: { tenantId, type: dto.sourceType as LeadSourceType },
        select: { id: true },
      });
      if (sources.length > 0) {
        const leads = await this.prisma.lead.findMany({
          where: { tenantId, sourceId: { in: sources.map((s) => s.id) }, phone: { not: null } },
          select: { id: true, name: true, stageId: true },
        });
        leadIds = leads.map((l) => l.id);
      }
    }
    if (leadIds.length === 0) {
      throw new BadRequestException("No se encontraron leads para la difusión");
    }

    // Fetch lead details for message resolution + auto-approve check
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, tenantId },
      select: { id: true, name: true, stageId: true },
    });

    const batch = await this.prisma.broadcastBatch.create({
      data: {
        tenantId,
        createdBy,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: meta as any,
        status: BroadcastStatus.READY,
        autoApproveStageIds: autoStages,
        autoSend: dto.autoSend ?? false,
        items: {
          create: leads.map((lead) => ({
            leadId: lead.id,
            message: resolveMessage(dto.message, lead, meta),
            status: autoStages.length > 0 && lead.stageId && autoStages.includes(lead.stageId)
              ? BroadcastItemStatus.APPROVED
              : BroadcastItemStatus.PENDING,
          })),
        },
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
        items: { include: ITEM_INCLUDE },
      },
    });

    // Auto-send if requested
    if (dto.autoSend) {
      const approvedIds = batch.items
        .filter((i) => i.status === "APPROVED")
        .map((i) => i.id);
      if (approvedIds.length > 0) {
        this._sendItems(batch.id, tenantId, approvedIds).catch(() => {});
      }
    }

    return batch;
  }

  async findAll(tenantId: string) {
    return this.prisma.broadcastBatch.findMany({
      where: { tenantId },
      include: BATCH_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, tenantId: string) {
    const batch = await this.prisma.broadcastBatch.findFirst({
      where: { id, tenantId },
      include: { ...BATCH_INCLUDE, items: { include: ITEM_INCLUDE, orderBy: { createdAt: "asc" } } },
    });
    if (!batch) throw new NotFoundException("Difusión no encontrada");
    return batch;
  }

  async updateItems(batchId: string, tenantId: string, dto: UpdateItemsDto) {
    const batch = await this.prisma.broadcastBatch.findFirst({ where: { id: batchId, tenantId } });
    if (!batch) throw new NotFoundException("Difusión no encontrada");
    if (batch.status === BroadcastStatus.DONE || batch.status === BroadcastStatus.CANCELLED) {
      throw new ForbiddenException("No se puede modificar una difusión completada o cancelada");
    }

    await this.prisma.broadcastItem.updateMany({
      where: { batchId, id: { in: dto.itemIds }, status: { in: [BroadcastItemStatus.PENDING, BroadcastItemStatus.APPROVED, BroadcastItemStatus.REJECTED] } },
      data: { status: dto.status as BroadcastItemStatus },
    });

    return this.findOne(batchId, tenantId);
  }

  async send(batchId: string, tenantId: string, dto: SendBatchDto) {
    const batch = await this.prisma.broadcastBatch.findFirst({ where: { id: batchId, tenantId } });
    if (!batch) throw new NotFoundException("Difusión no encontrada");
    if (batch.status === BroadcastStatus.DONE || batch.status === BroadcastStatus.CANCELLED) {
      throw new ForbiddenException("Difusión ya finalizada");
    }

    const whereItems = dto.itemIds?.length
      ? { batchId, id: { in: dto.itemIds }, status: BroadcastItemStatus.APPROVED }
      : { batchId, status: BroadcastItemStatus.APPROVED };

    const items = await this.prisma.broadcastItem.findMany({ where: whereItems, select: { id: true } });
    if (items.length === 0) throw new BadRequestException("No hay ítems aprobados para enviar");

    await this.prisma.broadcastBatch.update({
      where: { id: batchId },
      data: { status: BroadcastStatus.SENDING },
    });

    // Fire and forget — results updated async
    this._sendItems(batchId, tenantId, items.map((i) => i.id)).catch(() => {});

    return { queued: items.length };
  }

  async cancel(batchId: string, tenantId: string) {
    const batch = await this.prisma.broadcastBatch.findFirst({ where: { id: batchId, tenantId } });
    if (!batch) throw new NotFoundException("Difusión no encontrada");
    if (batch.status === BroadcastStatus.SENDING) throw new ForbiddenException("No se puede cancelar mientras se está enviando");

    return this.prisma.broadcastBatch.update({
      where: { id: batchId },
      data: { status: BroadcastStatus.CANCELLED },
      include: BATCH_INCLUDE,
    });
  }

  private async _sendItems(batchId: string, tenantId: string, itemIds: string[]) {
    const items = await this.prisma.broadcastItem.findMany({
      where: { id: { in: itemIds }, batchId },
      select: { id: true, leadId: true, message: true },
    });

    let sentCount = 0;
    for (const item of items) {
      try {
        await this.messages.send(tenantId, item.leadId, {
          content: item.message ?? "",
        });
        await this.prisma.broadcastItem.update({
          where: { id: item.id },
          data: { status: BroadcastItemStatus.SENT, sentAt: new Date(), error: null },
        });
        sentCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await this.prisma.broadcastItem.update({
          where: { id: item.id },
          data: { status: BroadcastItemStatus.FAILED, error: msg },
        });
      }
    }

    // Check if batch is fully resolved
    const pending = await this.prisma.broadcastItem.count({
      where: { batchId, status: { in: [BroadcastItemStatus.PENDING, BroadcastItemStatus.APPROVED] } },
    });
    if (pending === 0) {
      await this.prisma.broadcastBatch.update({
        where: { id: batchId },
        data: { status: BroadcastStatus.DONE },
      });
    }

    return sentCount;
  }
}
