import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.tag.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: { _count: { select: { leads: true } } },
    });
  }

  async create(tenantId: string, dto: { name: string; color?: string }) {
    try {
      return await this.prisma.tag.create({
        data: { tenantId, name: dto.name, color: dto.color ?? "#3B82F6" },
        include: { _count: { select: { leads: true } } },
      });
    } catch (e: any) {
      if (e.code === "P2002") throw new ConflictException("Tag name already exists");
      throw e;
    }
  }

  async update(tenantId: string, id: string, dto: { name?: string; color?: string }) {
    const tag = await this.prisma.tag.findFirst({ where: { id, tenantId } });
    if (!tag) throw new NotFoundException("Tag not found");
    try {
      return await this.prisma.tag.update({
        where: { id },
        data: dto,
        include: { _count: { select: { leads: true } } },
      });
    } catch (e: any) {
      if (e.code === "P2002") throw new ConflictException("Tag name already exists");
      throw e;
    }
  }

  async remove(tenantId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({ where: { id, tenantId } });
    if (!tag) throw new NotFoundException("Tag not found");
    await this.prisma.tag.delete({ where: { id } });
  }

  // ─── Lead-Tag assignments ──────────────────────────

  async getLeadTags(tenantId: string, leadId: string) {
    return this.prisma.leadTag.findMany({
      where: { lead: { id: leadId, tenantId } },
      include: { tag: true },
    });
  }

  async setLeadTags(tenantId: string, leadId: string, tagIds: string[]) {
    // Verify lead belongs to tenant
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException("Lead not found");

    // Verify all tags belong to tenant
    const validTags = await this.prisma.tag.findMany({
      where: { id: { in: tagIds }, tenantId },
    });
    const validIds = validTags.map((t) => t.id);

    // Remove all existing tags, then add new ones
    await this.prisma.$transaction([
      this.prisma.leadTag.deleteMany({ where: { leadId } }),
      ...validIds.map((tagId) =>
        this.prisma.leadTag.create({ data: { leadId, tagId } }),
      ),
    ]);

    return this.getLeadTags(tenantId, leadId);
  }

  async addLeadTag(tenantId: string, leadId: string, tagId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException("Lead not found");
    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, tenantId } });
    if (!tag) throw new NotFoundException("Tag not found");

    try {
      await this.prisma.leadTag.create({ data: { leadId, tagId } });
    } catch (e: any) {
      if (e.code === "P2002") return; // Already assigned, ignore
      throw e;
    }
    return this.getLeadTags(tenantId, leadId);
  }

  async removeLeadTag(tenantId: string, leadId: string, tagId: string) {
    await this.prisma.leadTag.deleteMany({ where: { leadId, tagId } });
    return this.getLeadTags(tenantId, leadId);
  }
}
