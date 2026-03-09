import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CustomFieldType } from "@inmoflow/db";

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Definitions ─────────────────────────────────

  async findAllDefinitions(tenantId: string, filters?: { limit?: number; offset?: number }) {
    const take = filters?.limit ?? 100;
    const skip = filters?.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.customFieldDefinition.findMany({
        where: { tenantId },
        orderBy: { order: "asc" },
        take,
        skip,
      }),
      this.prisma.customFieldDefinition.count({ where: { tenantId } }),
    ]);

    return { data, total, limit: take, offset: skip };
  }

  async createDefinition(tenantId: string, dto: {
    name: string;
    fieldType?: CustomFieldType;
    options?: string[];
    required?: boolean;
    order?: number;
  }) {
    try {
      return await this.prisma.customFieldDefinition.create({
        data: {
          tenantId,
          name: dto.name,
          fieldType: dto.fieldType ?? CustomFieldType.TEXT,
          options: dto.options ?? [],
          required: dto.required ?? false,
          order: dto.order ?? 0,
        },
      });
    } catch (e: any) {
      if (e.code === "P2002") throw new ConflictException("Field name already exists");
      throw e;
    }
  }

  async updateDefinition(tenantId: string, id: string, dto: {
    name?: string;
    options?: string[];
    required?: boolean;
    order?: number;
  }) {
    const def = await this.prisma.customFieldDefinition.findFirst({ where: { id, tenantId } });
    if (!def) throw new NotFoundException("Custom field not found");
    try {
      return await this.prisma.customFieldDefinition.update({
        where: { id },
        data: dto,
      });
    } catch (e: any) {
      if (e.code === "P2002") throw new ConflictException("Field name already exists");
      throw e;
    }
  }

  async removeDefinition(tenantId: string, id: string) {
    const def = await this.prisma.customFieldDefinition.findFirst({ where: { id, tenantId } });
    if (!def) throw new NotFoundException("Custom field not found");
    await this.prisma.customFieldDefinition.delete({ where: { id } });
  }

  // ─── Values (per-lead) ──────────────────────────

  async getLeadValues(tenantId: string, leadId: string) {
    return this.prisma.customFieldValue.findMany({
      where: { lead: { id: leadId, tenantId } },
      include: { definition: true },
    });
  }

  async setLeadValues(tenantId: string, leadId: string, values: { definitionId: string; value: string }[]) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException("Lead not found");

    // Upsert each value
    const ops = values.map((v) =>
      this.prisma.customFieldValue.upsert({
        where: { leadId_definitionId: { leadId, definitionId: v.definitionId } },
        create: { leadId, definitionId: v.definitionId, value: v.value },
        update: { value: v.value },
      }),
    );

    await this.prisma.$transaction(ops);
    return this.getLeadValues(tenantId, leadId);
  }
}
