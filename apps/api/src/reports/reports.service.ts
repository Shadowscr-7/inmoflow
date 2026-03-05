import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build leads export data
   */
  async getLeadsExport(tenantId: string, filters?: {
    from?: string;
    to?: string;
    status?: string;
    stageId?: string;
    assigneeId?: string;
  }) {
    const where: any = { tenantId };
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    if (filters?.status) where.status = filters.status;
    if (filters?.stageId) where.stageId = filters.stageId;
    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;

    const leads = await this.prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        stage: { select: { name: true, key: true } },
        assignee: { select: { name: true, email: true } },
        source: { select: { name: true, type: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
    });

    return leads.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      email: l.email,
      status: l.status,
      stage: l.stage?.name ?? "",
      assignee: l.assignee?.name ?? l.assignee?.email ?? "",
      source: l.source?.name ?? "",
      sourceType: l.source?.type ?? "",
      tags: l.tags.map((t) => t.tag.name).join(", "),
      intent: l.intent ?? "",
      score: l.score,
      notes: l.notes ?? "",
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }));
  }

  /**
   * Build properties export data
   */
  async getPropertiesExport(tenantId: string, filters?: { status?: string }) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;

    const properties = await this.prisma.property.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return properties.map((p) => ({
      id: p.id,
      code: p.code ?? "",
      title: p.title,
      status: p.status,
      price: p.price,
      currency: p.currency ?? "",
      propertyType: p.propertyType ?? "",
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      areaM2: p.areaM2,
      hasGarage: p.hasGarage ? "Sí" : "No",
      zone: p.zone ?? "",
      address: p.address ?? "",
      createdAt: p.createdAt.toISOString(),
    }));
  }

  /**
   * Convert data array to CSV string
   */
  toCSV(data: Record<string, unknown>[]): string {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? "");
        // Escape if contains comma, newline, or quotes
        if (val.includes(",") || val.includes("\n") || val.includes('"')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(","),
    );
    return [headers.join(","), ...rows].join("\n");
  }

  /**
   * Generate summary report
   */
  async getSummaryReport(tenantId: string, from?: string, to?: string) {
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const createdAt = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

    const [
      totalLeads,
      leadsByStatus,
      leadsByStage,
      leadsBySource,
      totalProperties,
      totalVisits,
      visitsByStatus,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { tenantId, ...(createdAt ? { createdAt } : {}) } }),
      this.prisma.lead.groupBy({ by: ["status"], where: { tenantId, ...(createdAt ? { createdAt } : {}) }, _count: true }),
      this.prisma.lead.groupBy({
        by: ["stageId"],
        where: { tenantId, ...(createdAt ? { createdAt } : {}) },
        _count: true,
      }),
      this.prisma.lead.groupBy({
        by: ["sourceId"],
        where: { tenantId, ...(createdAt ? { createdAt } : {}) },
        _count: true,
      }),
      this.prisma.property.count({ where: { tenantId } }),
      this.prisma.visit.count({ where: { tenantId, ...(createdAt ? { createdAt } : {}) } }),
      this.prisma.visit.groupBy({ by: ["status"], where: { tenantId, ...(createdAt ? { createdAt } : {}) }, _count: true }),
    ]);

    // Resolve stage names
    const stageIds = leadsByStage.map((s) => s.stageId).filter(Boolean) as string[];
    const stages = stageIds.length > 0
      ? await this.prisma.leadStage.findMany({ where: { id: { in: stageIds } }, select: { id: true, name: true } })
      : [];
    const stageMap = Object.fromEntries(stages.map((s) => [s.id, s.name]));

    // Resolve source names
    const sourceIds = leadsBySource.map((s) => s.sourceId).filter(Boolean) as string[];
    const sources = sourceIds.length > 0
      ? await this.prisma.leadSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } })
      : [];
    const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s.name]));

    return {
      period: { from: from ?? "all", to: to ?? "all" },
      leads: {
        total: totalLeads,
        byStatus: Object.fromEntries(leadsByStatus.map((s) => [s.status, s._count])),
        byStage: Object.fromEntries(
          leadsByStage.map((s) => [stageMap[s.stageId!] ?? "Sin etapa", s._count]),
        ),
        bySource: Object.fromEntries(
          leadsBySource.map((s) => [sourceMap[s.sourceId!] ?? "Sin fuente", s._count]),
        ),
      },
      properties: { total: totalProperties },
      visits: {
        total: totalVisits,
        byStatus: Object.fromEntries(visitsByStatus.map((s) => [s.status, s._count])),
      },
    };
  }
}
