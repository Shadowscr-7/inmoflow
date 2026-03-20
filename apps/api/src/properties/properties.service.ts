import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { Prisma } from "@inmoflow/db";
import { PrismaService } from "../prisma/prisma.service";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, filters?: {
    status?: string;
    zone?: string;
    propertyType?: string;
    minPrice?: number;
    maxPrice?: number;
    bedrooms?: number;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.PropertyWhereInput = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.zone) where.zone = { contains: filters.zone, mode: "insensitive" };
    if (filters?.propertyType) where.propertyType = filters.propertyType;
    if (filters?.bedrooms) where.bedrooms = { gte: filters.bedrooms };
    if (filters?.minPrice || filters?.maxPrice) {
      where.price = {};
      if (filters.minPrice) where.price.gte = filters.minPrice;
      if (filters.maxPrice) where.price.lte = filters.maxPrice;
    }
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { code: { contains: filters.search, mode: "insensitive" } },
        { address: { contains: filters.search, mode: "insensitive" } },
        { zone: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(filters?.limit ?? 50, 200),
        skip: filters?.offset ?? 0,
        include: {
          media: { orderBy: { order: "asc" }, take: 5 },
          assignedUser: { select: { id: true, name: true, email: true } },
          _count: { select: { visits: true } },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return { data, total, limit: filters?.limit ?? 50, offset: filters?.offset ?? 0 };
  }

  async findOne(tenantId: string, id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, tenantId },
      include: {
        media: { orderBy: { order: "asc" } },
        assignedUser: { select: { id: true, name: true, email: true } },
        visits: {
          orderBy: { date: "desc" },
          take: 10,
          include: {
            lead: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });
    if (!property) throw new NotFoundException("Property not found");
    return property;
  }

  async create(tenantId: string, dto: {
    title: string;
    code?: string;
    description?: string;
    status?: string;
    price?: number;
    currency?: string;
    propertyType?: string;
    bedrooms?: number;
    bathrooms?: number;
    areaM2?: number;
    hasGarage?: boolean;
    zone?: string;
    address?: string;
    lat?: number;
    lng?: number;
  }) {
    let slug = slugify(dto.title);
    // Ensure unique slug within tenant
    const existing = await this.prisma.property.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    return this.prisma.property.create({
      data: {
        tenantId,
        ...dto,
        slug,
        status: dto.status ?? "ACTIVE",
        currency: dto.currency ?? "USD",
      },
      include: { media: { orderBy: { order: "asc" } } },
    });
  }

  async update(tenantId: string, id: string, dto: {
    title?: string;
    code?: string;
    description?: string;
    status?: string;
    price?: number;
    currency?: string;
    propertyType?: string;
    operationType?: string;
    bedrooms?: number;
    bathrooms?: number;
    areaM2?: number;
    floors?: number;
    hasGarage?: boolean;
    zone?: string;
    address?: string;
    amenities?: string;
    lat?: number;
    lng?: number;
  }) {
    const property = await this.prisma.property.findFirst({ where: { id, tenantId } });
    if (!property) throw new NotFoundException("Property not found");

    const data: Record<string, unknown> = { ...dto };
    if (dto.title && dto.title !== property.title) {
      let slug = slugify(dto.title);
      const existing = await this.prisma.property.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (existing && existing.id !== id) slug = `${slug}-${Date.now().toString(36)}`;
      data.slug = slug;
    }

    return this.prisma.property.update({
      where: { id },
      data,
      include: { media: { orderBy: { order: "asc" } } },
    });
  }

  async remove(tenantId: string, id: string) {
    const property = await this.prisma.property.findFirst({ where: { id, tenantId } });
    if (!property) throw new NotFoundException("Property not found");
    await this.prisma.property.delete({ where: { id } });
  }

  // ─── Media ──────────────────────────────────────

  async addMedia(
    tenantId: string,
    propertyId: string,
    items: Array<{ url: string; kind?: string; thumbnailUrl?: string }>,
  ) {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, tenantId } });
    if (!property) throw new NotFoundException("Property not found");

    const maxOrder = await this.prisma.propertyMedia.findFirst({
      where: { propertyId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    let nextOrder = (maxOrder?.order ?? -1) + 1;
    const media = await Promise.all(
      items.map((item) => {
        const kind = item.kind ?? this.detectMediaKind(item.url);
        const thumbnailUrl = item.thumbnailUrl ?? this.generateThumbnail(item.url, kind);
        return this.prisma.propertyMedia.create({
          data: { tenantId, propertyId, url: item.url, kind, thumbnailUrl, order: nextOrder++ },
        });
      }),
    );
    return media;
  }

  /** Detect media kind from URL */
  private detectMediaKind(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
    if (lower.includes("vimeo.com")) return "vimeo";
    if (/\.(mp4|webm|mov|avi)(\?|$)/.test(lower)) return "video";
    return "image";
  }

  /** Generate thumbnail URL for video platforms */
  private generateThumbnail(url: string, kind: string): string | null {
    if (kind === "youtube") {
      const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
    }
    return null;
  }

  async removeMedia(tenantId: string, mediaId: string) {
    const media = await this.prisma.propertyMedia.findFirst({ where: { id: mediaId, tenantId } });
    if (!media) throw new NotFoundException("Media not found");
    await this.prisma.propertyMedia.delete({ where: { id: mediaId } });
  }

  // Stats
  async getStats(tenantId: string) {
    const [total, byStatus, byType] = await Promise.all([
      this.prisma.property.count({ where: { tenantId } }),
      this.prisma.property.groupBy({ by: ["status"], where: { tenantId }, _count: true }),
      this.prisma.property.groupBy({ by: ["propertyType"], where: { tenantId }, _count: true }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byType: Object.fromEntries(byType.filter((t) => t.propertyType).map((t) => [t.propertyType!, t._count])),
    };
  }
}
