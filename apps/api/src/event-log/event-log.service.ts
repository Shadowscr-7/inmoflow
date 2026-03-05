import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EventType, Prisma } from "@inmoflow/db";

@Injectable()
export class EventLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    tenantId: string;
    type: EventType;
    entity?: string;
    entityId?: string;
    status?: string;
    message?: string;
    payload?: Record<string, unknown>;
  }) {
    return this.prisma.eventLog.create({
      data: {
        tenantId: params.tenantId,
        type: params.type,
        entity: params.entity,
        entityId: params.entityId,
        status: params.status ?? "OK",
        message: params.message,
        payload: (params.payload as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async findByTenant(
    tenantId: string,
    params?: {
      entity?: string;
      entityId?: string;
      type?: EventType;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (params?.entity) where.entity = params.entity;
    if (params?.entityId) where.entityId = params.entityId;
    if (params?.type) where.type = params.type;

    return this.prisma.eventLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params?.limit ?? 50,
      skip: params?.offset ?? 0,
    });
  }
}
