import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { PropertiesService } from "./properties.service";
import { CreatePropertyDto, UpdatePropertyDto } from "./dto";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId } from "../auth";
import { UserRole } from "@inmoflow/db";

@Controller("properties")
@UseGuards(JwtAuthGuard, TenantGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  findAll(
    @TenantId() tenantId: string,
    @Query("status") status?: string,
    @Query("zone") zone?: string,
    @Query("propertyType") propertyType?: string,
    @Query("minPrice") minPrice?: string,
    @Query("maxPrice") maxPrice?: string,
    @Query("bedrooms") bedrooms?: string,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.propertiesService.findAll(tenantId, {
      status,
      zone,
      propertyType,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
      bedrooms: bedrooms ? parseInt(bedrooms, 10) : undefined,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get("stats")
  getStats(@TenantId() tenantId: string) {
    return this.propertiesService.getStats(tenantId);
  }

  @Get(":id")
  findOne(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.propertiesService.findOne(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  create(@TenantId() tenantId: string, @Body() dto: CreatePropertyDto) {
    return this.propertiesService.create(tenantId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdatePropertyDto) {
    return this.propertiesService.update(tenantId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  remove(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.propertiesService.remove(tenantId, id);
  }

  // ─── Media ────────────────────────────────────

  @Post(":id/media")
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS, UserRole.AGENT)
  addMedia(
    @TenantId() tenantId: string,
    @Param("id") propertyId: string,
    @Body() body: { urls?: string[]; items?: Array<{ url: string; kind?: string; thumbnailUrl?: string }> },
  ) {
    // Support legacy { urls: [...] } or richer { items: [...] }
    const items = body.items ?? (body.urls ?? []).map((url) => ({ url }));
    return this.propertiesService.addMedia(tenantId, propertyId, items);
  }

  @Delete("media/:mediaId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.BUSINESS)
  removeMedia(@TenantId() tenantId: string, @Param("mediaId") mediaId: string) {
    return this.propertiesService.removeMedia(tenantId, mediaId);
  }

  // ─── WhatsApp Share ───────────────────────────

  @Get(":id/share-whatsapp")
  async getWhatsAppShareLink(
    @TenantId() tenantId: string,
    @Param("id") id: string,
  ) {
    const property = await this.propertiesService.findOne(tenantId, id);

    const priceStr = property.price
      ? `${property.currency ?? "USD"} ${property.price.toLocaleString("es")}`
      : "Consultar precio";

    const features: string[] = [];
    if (property.bedrooms) features.push(`${property.bedrooms} dormitorios`);
    if (property.bathrooms) features.push(`${property.bathrooms} baños`);
    if (property.areaM2) features.push(`${property.areaM2} m²`);
    if (property.hasGarage) features.push("garaje");

    const lines = [
      `🏠 *${property.title}*`,
      `📍 ${property.zone ?? property.address ?? ""}`,
      `💰 ${priceStr}`,
    ];
    if (features.length > 0) lines.push(`✨ ${features.join(" · ")}`);
    if (property.description) {
      const desc = property.description.length > 150
        ? property.description.slice(0, 147) + "..."
        : property.description;
      lines.push(`\n${desc}`);
    }

    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const frontendUrl = process.env.FRONTEND_URL ?? `${protocol}://localhost:3000`;
    const publicUrl = `${frontendUrl}/p/${tenantId}/${property.slug}`;
    lines.push(`\n🔗 Ver propiedad: ${publicUrl}`);

    const text = encodeURIComponent(lines.join("\n"));
    const whatsappUrl = `https://wa.me/?text=${text}`;

    return {
      whatsappUrl,
      message: lines.join("\n"),
      publicUrl,
    };
  }
}
