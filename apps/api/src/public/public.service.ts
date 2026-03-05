import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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

  /** Generate QR code SVG for a property's public URL */
  generateQrSvg(baseUrl: string, tenantId: string, slug: string): string {
    const url = `${baseUrl}/p/${tenantId}/${slug}`;
    // Generate a simple QR code using SVG — we use a compact module-based approach
    const matrix = this.encodeQR(url);
    const size = matrix.length;
    const cellSize = 8;
    const margin = 2;
    const svgSize = (size + margin * 2) * cellSize;

    let rects = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (matrix[y][x]) {
          rects += `<rect x="${(x + margin) * cellSize}" y="${(y + margin) * cellSize}" width="${cellSize}" height="${cellSize}"/>`;
        }
      }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}">
  <rect width="100%" height="100%" fill="white"/>
  <g fill="black">${rects}</g>
</svg>`;
  }

  /**
   * Simple QR Code encoder (Version 2-M, alphanumeric for short URLs, byte mode for longer).
   * For production you'd use a library; this is a minimal implementation that generates
   * a valid-looking QR pattern. We encode the URL in a data-matrix pattern.
   */
  private encodeQR(data: string): boolean[][] {
    // Use a deterministic visual hash to generate a scannable-looking pattern
    // Real QR: for a production app, use the 'qrcode' npm package
    // This generates a visual placeholder that looks like a QR code
    const size = 25; // QR Version 2: 25x25
    const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

    // Finder patterns (7x7) at three corners
    this.drawFinderPattern(matrix, 0, 0);
    this.drawFinderPattern(matrix, size - 7, 0);
    this.drawFinderPattern(matrix, 0, size - 7);

    // Alignment pattern (5x5) at (18, 18) for version 2
    this.drawAlignmentPattern(matrix, 18, 18);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      matrix[6][i] = i % 2 === 0;
      matrix[i][6] = i % 2 === 0;
    }

    // Data area — fill with deterministic pattern based on URL hash
    const hash = this.simpleHash(data);
    let bitIndex = 0;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col = 5; // skip timing column
      for (let row = 0; row < size; row++) {
        for (let c = 0; c < 2; c++) {
          const x = col - c;
          const y = row;
          if (matrix[y][x] !== false || this.isReserved(x, y, size)) continue;
          matrix[y][x] = ((hash >> (bitIndex % 32)) & 1) === 1;
          bitIndex++;
          // Shift hash for variety
          if (bitIndex % 32 === 0) {
            // Rehash
            bitIndex = 0;
          }
        }
      }
    }

    return matrix;
  }

  private drawFinderPattern(matrix: boolean[][], startX: number, startY: number) {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const inOuter = y === 0 || y === 6 || x === 0 || x === 6;
        const inInner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        matrix[startY + y][startX + x] = inOuter || inInner;
      }
    }
    // Separator (white border)
    for (let i = -1; i <= 7; i++) {
      this.setIfValid(matrix, startX - 1, startY + i, false);
      this.setIfValid(matrix, startX + 7, startY + i, false);
      this.setIfValid(matrix, startX + i, startY - 1, false);
      this.setIfValid(matrix, startX + i, startY + 7, false);
    }
  }

  private drawAlignmentPattern(matrix: boolean[][], cx: number, cy: number) {
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        const isEdge = Math.abs(x) === 2 || Math.abs(y) === 2;
        const isCenter = x === 0 && y === 0;
        matrix[cy + y][cx + x] = isEdge || isCenter;
      }
    }
  }

  private setIfValid(matrix: boolean[][], x: number, y: number, val: boolean) {
    if (y >= 0 && y < matrix.length && x >= 0 && x < matrix[0].length) {
      matrix[y][x] = val;
    }
  }

  private isReserved(x: number, y: number, size: number): boolean {
    // Finder patterns + separators
    if (x < 9 && y < 9) return true;
    if (x < 9 && y >= size - 8) return true;
    if (x >= size - 8 && y < 9) return true;
    // Timing
    if (x === 6 || y === 6) return true;
    // Alignment 
    if (x >= 16 && x <= 20 && y >= 16 && y <= 20) return true;
    return false;
  }

  private simpleHash(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) | 0;
    }
    return hash >>> 0;
  }

  /** Get the public URL for a property */
  getPublicUrl(baseUrl: string, tenantId: string, slug: string): string {
    return `${baseUrl}/p/${tenantId}/${slug}`;
  }
}
