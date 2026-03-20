import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as QRCode from "qrcode";

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get public property information — NO AUTH */
  async getPublicProperty(tenantId: string, slug: string) {
    const property = await this.prisma.property.findFirst({
      where: {
        tenantId,
        slug,
        status: "ACTIVE",
      },
      include: {
        media: { orderBy: { order: "asc" } },
        tenant: { select: { name: true } },
      },
    });

    if (!property) throw new NotFoundException("Propiedad no encontrada");

    // Return safe public data (no internal IDs exposed)
    return {
      id: property.id,
      title: property.title,
      description: property.description,
      price: property.price,
      currency: property.currency ?? "USD",
      propertyType: property.propertyType,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      areaM2: property.areaM2,
      hasGarage: property.hasGarage,
      zone: property.zone,
      address: property.address,
      lat: property.lat,
      lng: property.lng,
      slug: property.slug,
      publishedAt: property.publishedAt,
      media: property.media.map((m) => ({ url: m.url, kind: m.kind, order: m.order })),
      tenant: property.tenant.name,
      tenantId: property.tenantId,
    };
  }

  /** Submit a contact request from the public page */
  async submitContact(
    tenantId: string,
    slug: string,
    data: { name: string; phone?: string; email?: string; message?: string },
  ) {
    // Verify property exists
    const property = await this.prisma.property.findFirst({
      where: { tenantId, slug, status: "ACTIVE" },
    });
    if (!property) throw new NotFoundException("Propiedad no encontrada");

    // Create a lead from this contact
    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        status: "NEW",
        intent: `Interesado en: ${property.title}`,
        notes: data.message ? `Mensaje público: ${data.message}` : undefined,
      },
    });

    return { ok: true, leadId: lead.id };
  }

  /** Generate QR code SVG — uses MeLi permalink if available, else public page */
  async generateQrSvg(baseUrl: string, tenantId: string, slug: string): Promise<string> {
    const property = await this.prisma.property.findFirst({
      where: { tenantId, slug },
      select: { meliPermalink: true },
    });
    const url = property?.meliPermalink
      ? property.meliPermalink
      : `${baseUrl}/p/${tenantId}/${slug}`;
    return QRCode.toString(url, { type: "svg", margin: 2, width: 256 });
  }

  /** Get the public URL for a property */
  getPublicUrl(baseUrl: string, tenantId: string, slug: string): string {
    return `${baseUrl}/p/${tenantId}/${slug}`;
  }
}
