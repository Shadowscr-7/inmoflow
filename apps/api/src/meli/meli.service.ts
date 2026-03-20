import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../common/encryption.service";

/**
 * MeliService — Handles MercadoLibre OAuth2 and API communication.
 *
 * MeLi OAuth: https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion
 * Items API: https://developers.mercadolibre.com.ar/es_ar/publica-y-administra-tus-publicaciones
 *
 * Env vars: MELI_CLIENT_ID, MELI_CLIENT_SECRET, MELI_REDIRECT_URI
 */
@Injectable()
export class MeliService {
  private readonly logger = new Logger(MeliService.name);

  private readonly clientId = process.env.MELI_CLIENT_ID;
  private readonly clientSecret = process.env.MELI_CLIENT_SECRET;
  private readonly redirectUri = process.env.MELI_REDIRECT_URI;
  private readonly API_BASE = "https://api.mercadolibre.com";

  get isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirectUri);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  // ─── OAuth2 ──────────────────────────────────────────

  /**
   * Get MercadoLibre authorization URL.
   * User is redirected to MeLi to grant access, then back to the redirect URI.
   */
  getAuthUrl(tenantId: string): string {
    if (!this.isConfigured) {
      throw new BadRequestException("MercadoLibre no está configurado en el servidor");
    }
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId!,
      redirect_uri: this.redirectUri!,
      state: tenantId,
    });
    return `https://auth.mercadolibre.com/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access + refresh tokens.
   */
  async handleCallback(code: string, tenantId: string): Promise<void> {
    if (!this.isConfigured) {
      this.logger.error(`MeLi NOT configured. clientId=${this.clientId}, secret=${this.clientSecret ? '***' : 'EMPTY'}, redirectUri=${this.redirectUri}`);
      throw new BadRequestException("MercadoLibre no está configurado");
    }

    this.logger.log(`MeLi callback: code=${code}, tenant=${tenantId}, redirectUri=${this.redirectUri}`);

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      code,
      redirect_uri: this.redirectUri!,
    });

    this.logger.log(`MeLi token request body: ${body.toString()}`);

    const res = await fetch(`${this.API_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`MeLi token exchange failed (HTTP ${res.status}): ${err}`);
      throw new BadRequestException(`Error al conectar con MercadoLibre: ${err}`);
    }

    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      user_id: number;
      expires_in: number;
    };

    this.logger.log(`MeLi tokens received: userId=${tokens.user_id}, expiresIn=${tokens.expires_in}`);

    try {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          meliAccessToken: this.encryption.encrypt(tokens.access_token),
          meliRefreshToken: this.encryption.encrypt(tokens.refresh_token),
          meliUserId: String(tokens.user_id),
          meliEnabled: true,
        },
      });
    } catch (dbErr) {
      this.logger.error(`MeLi DB update failed: ${dbErr}`);
      throw dbErr;
    }

    this.logger.log(`MeLi connected for tenant ${tenantId} (user ${tokens.user_id})`);
  }

  /** Disconnect MercadoLibre for a tenant */
  async disconnect(tenantId: string): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        meliAccessToken: null,
        meliRefreshToken: null,
        meliUserId: null,
        meliEnabled: false,
        meliLastSync: null,
      },
    });
  }

  /** Check if MeLi is connected for a tenant */
  async getStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        meliEnabled: true,
        meliUserId: true,
        meliLastSync: true,
      },
    });
    return {
      connected: !!(tenant?.meliEnabled && tenant?.meliUserId),
      userId: tenant?.meliUserId ?? null,
      lastSync: tenant?.meliLastSync ?? null,
    };
  }

  // ─── Token Refresh ───────────────────────────────────

  /** Get a valid access token, refreshing if needed */
  async getAccessToken(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { meliAccessToken: true, meliRefreshToken: true, meliEnabled: true },
    });

    if (!tenant?.meliEnabled || !tenant?.meliRefreshToken) return null;

    const decryptedRefresh = this.encryption.decrypt(tenant.meliRefreshToken);

    // Try the existing token first — if it returns 401 we'll refresh
    // MeLi tokens last 6 hours, so we always try refresh
    const res = await fetch(`${this.API_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        refresh_token: decryptedRefresh,
      }),
    });

    if (!res.ok) {
      this.logger.error(`MeLi token refresh failed for tenant ${tenantId}`);
      await this.disconnect(tenantId);
      return null;
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
    };

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        meliAccessToken: this.encryption.encrypt(data.access_token),
        meliRefreshToken: this.encryption.encrypt(data.refresh_token),
      },
    });

    return data.access_token;
  }

  // ─── API Requests ────────────────────────────────────

  /** Make an authenticated request to the MeLi API */
  async apiGet<T = unknown>(tenantId: string, path: string): Promise<T | null> {
    const token = await this.getAccessToken(tenantId);
    if (!token) return null;

    const res = await fetch(`${this.API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      this.logger.error(`MeLi API ${path} failed: ${res.status} ${await res.text()}`);
      return null;
    }

    return res.json() as Promise<T>;
  }

  // ─── Items / Listings ────────────────────────────────

  /**
   * Get all item IDs posted by the connected MeLi user.
   * MeLi returns paginated results (50 per page).
   */
  async getUserItemIds(tenantId: string): Promise<string[]> {
    const status = await this.getStatus(tenantId);
    if (!status.connected || !status.userId) return [];

    const allIds: string[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const data = await this.apiGet<{ results: string[]; paging: { total: number } }>(
        tenantId,
        `/users/${status.userId}/items/search?offset=${offset}&limit=${limit}`,
      );
      if (!data || !data.results?.length) break;

      allIds.push(...data.results);
      offset += limit;
      if (offset >= data.paging.total) break;
    }

    return allIds;
  }

  /**
   * Get full details for a list of MeLi items (batched by 20).
   */
  async getItemsDetails(tenantId: string, itemIds: string[]): Promise<MeliItem[]> {
    const items: MeliItem[] = [];

    // MeLi multiget supports up to 20 items at once
    for (let i = 0; i < itemIds.length; i += 20) {
      const batch = itemIds.slice(i, i + 20);
      const data = await this.apiGet<MeliMultigetResponse[]>(
        tenantId,
        `/items?ids=${batch.join(",")}&attributes=id,title,price,currency_id,category_id,permalink,status,pictures,video_id,condition,listing_type_id,sale_terms,location,attributes,descriptions`,
      );
      if (data) {
        for (const entry of data) {
          if (entry.code === 200 && entry.body) {
            items.push(entry.body);
          }
        }
      }
    }

    return items;
  }

  /**
   * Get item description (separate endpoint in MeLi).
   */
  async getItemDescription(tenantId: string, itemId: string): Promise<string> {
    const data = await this.apiGet<{ plain_text?: string; text?: string }>(
      tenantId,
      `/items/${itemId}/description`,
    );
    return data?.plain_text || data?.text || "";
  }

  /**
   * Import a single MeLi item into InmoFlow as a Property.
   * Creates or updates the property if it already exists (matched by meliItemId).
   */
  async importItem(tenantId: string, item: MeliItem): Promise<{ id: string; action: "created" | "updated" }> {
    const description = await this.getItemDescription(tenantId, item.id);

    // Map MeLi data to our property fields
    const propertyType = this.mapPropertyType(item);
    const operationType = this.mapOperationType(item);
    const bedrooms = this.extractAttributeNumber(item, "BEDROOMS");
    const bathrooms = this.extractAttributeNumber(item, "FULL_BATHROOMS") ??
                      this.extractAttributeNumber(item, "BATHROOMS");
    const areaM2 = this.extractAttributeNumber(item, "COVERED_AREA") ??
                   this.extractAttributeNumber(item, "TOTAL_AREA");
    const floors = this.extractAttributeNumber(item, "FLOORS");
    const hasGarage = this.extractAttributeBoolean(item, "HAS_PARKING");

    const zone = item.location?.neighborhood?.name ??
                 item.location?.city?.name ??
                 null;
    const address = item.location?.address_line ?? null;
    const lat = item.location?.latitude ?? null;
    const lng = item.location?.longitude ?? null;

    const slug = this.slugify(item.title);

    // Check if property already exists
    const existing = await this.prisma.property.findFirst({
      where: { tenantId, meliItemId: item.id },
    });

    const propertyData = {
      title: item.title,
      description: description || item.title,
      price: item.price ? Math.round(item.price) : null,
      currency: item.currency_id ?? "USD",
      propertyType,
      operationType,
      bedrooms,
      bathrooms,
      areaM2,
      floors,
      hasGarage,
      zone,
      address,
      lat,
      lng,
      meliItemId: item.id,
      meliPermalink: item.permalink ?? null,
      meliSyncedAt: new Date(),
      meliStatus: item.status ?? null,
      status: item.status === "active" ? "ACTIVE" : "INACTIVE",
    };

    let propertyId: string;
    let action: "created" | "updated";

    if (existing) {
      const updated = await this.prisma.property.update({
        where: { id: existing.id },
        data: propertyData,
      });
      propertyId = updated.id;
      action = "updated";
    } else {
      // Ensure unique slug
      let finalSlug = slug;
      const slugExists = await this.prisma.property.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (slugExists) finalSlug = `${slug}-${Date.now().toString(36)}`;

      const created = await this.prisma.property.create({
        data: { tenantId, ...propertyData, slug: finalSlug },
      });
      propertyId = created.id;
      action = "created";
    }

    // Sync media (images + video)
    await this.syncMedia(tenantId, propertyId, item);

    return { id: propertyId, action };
  }

  /**
   * Sync images and video from a MeLi item to PropertyMedia.
   */
  private async syncMedia(tenantId: string, propertyId: string, item: MeliItem): Promise<void> {
    // Get existing media for this property
    const existing = await this.prisma.propertyMedia.findMany({
      where: { propertyId },
      select: { id: true, url: true },
    });
    const existingUrls = new Set(existing.map((m) => m.url));

    let order = existing.length;

    // Import images
    if (item.pictures?.length) {
      for (const pic of item.pictures) {
        const url = pic.secure_url || pic.url;
        if (!url || existingUrls.has(url)) continue;

        await this.prisma.propertyMedia.create({
          data: {
            tenantId,
            propertyId,
            url,
            kind: "image",
            order: order++,
          },
        });
      }
    }

    // Import video (MeLi uses YouTube video IDs)
    if (item.video_id) {
      const videoUrl = `https://www.youtube.com/watch?v=${item.video_id}`;
      const thumbUrl = `https://img.youtube.com/vi/${item.video_id}/hqdefault.jpg`;
      if (!existingUrls.has(videoUrl)) {
        await this.prisma.propertyMedia.create({
          data: {
            tenantId,
            propertyId,
            url: videoUrl,
            kind: "youtube",
            thumbnailUrl: thumbUrl,
            order: order++,
          },
        });
      }
    }
  }

  /**
   * Full sync — import all items from MeLi account.
   * Returns summary of operations.
   */
  async syncAll(tenantId: string): Promise<{
    total: number;
    created: number;
    updated: number;
    errors: number;
  }> {
    const itemIds = await this.getUserItemIds(tenantId);
    if (!itemIds.length) {
      return { total: 0, created: 0, updated: 0, errors: 0 };
    }

    const items = await this.getItemsDetails(tenantId, itemIds);
    let created = 0, updated = 0, errors = 0;

    for (const item of items) {
      try {
        const result = await this.importItem(tenantId, item);
        if (result.action === "created") created++;
        else updated++;
      } catch (err) {
        this.logger.error(`Failed to import MeLi item ${item.id}: ${err}`);
        errors++;
      }
    }

    // Update last sync timestamp
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { meliLastSync: new Date() },
    });

    this.logger.log(`MeLi sync complete for tenant ${tenantId}: ${created} created, ${updated} updated, ${errors} errors`);

    return { total: items.length, created, updated, errors };
  }

  // ─── Field Mapping Helpers ───────────────────────────

  private mapPropertyType(item: MeliItem): string | null {
    // Try to infer from category or attributes
    const category = item.category_id ?? "";
    const MAP: Record<string, string> = {
      // MeLi Real Estate categories (common patterns)
      MLU1459: "Apartamento", MLU1461: "Apartamento",
      MLU1467: "Casa", MLU1466: "Casa",
      MLU1464: "Terreno", MLU1468: "Terreno",
      MLU1471: "Local comercial",
      MLU1472: "Oficina",
      MLU1474: "Campo",
    };
    if (MAP[category]) return MAP[category];

    // Try attribute PROPERTY_TYPE
    const attr = item.attributes?.find((a) => a.id === "PROPERTY_TYPE");
    if (attr?.value_name) {
      const name = attr.value_name.toLowerCase();
      if (name.includes("departamento") || name.includes("apartamento")) return "Apartamento";
      if (name.includes("casa")) return "Casa";
      if (name.includes("terreno") || name.includes("lote")) return "Terreno";
      if (name.includes("local")) return "Local comercial";
      if (name.includes("oficina")) return "Oficina";
      if (name.includes("campo")) return "Campo";
    }

    return null;
  }

  private mapOperationType(item: MeliItem): string | null {
    // Check sale_terms or listing category
    const attr = item.attributes?.find((a) => a.id === "OPERATION");
    if (attr?.value_id === "242073" || attr?.value_name?.toLowerCase().includes("venta")) return "sale";
    if (attr?.value_id === "242075" || attr?.value_name?.toLowerCase().includes("alquiler")) return "rent";

    // Check category pattern
    const cat = item.category_id ?? "";
    if (cat.includes("VENTA") || cat.includes("sale")) return "sale";
    if (cat.includes("ALQUILER") || cat.includes("rent")) return "rent";

    return null;
  }

  private extractAttributeNumber(item: MeliItem, attrId: string): number | null {
    const attr = item.attributes?.find((a) => a.id === attrId);
    if (!attr?.value_name) return null;
    const n = parseFloat(attr.value_name);
    return isNaN(n) ? null : Math.round(n);
  }

  private extractAttributeBoolean(item: MeliItem, attrId: string): boolean | null {
    const attr = item.attributes?.find((a) => a.id === attrId);
    if (!attr) return null;
    return attr.value_id?.toString().includes("242085") || // Si
           attr.value_name?.toLowerCase() === "sí" ||
           attr.value_name?.toLowerCase() === "yes" || false;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
}

// ─── MeLi API Types ───────────────────────────────────

export interface MeliItem {
  id: string;
  title: string;
  price: number | null;
  currency_id: string | null;
  category_id: string | null;
  permalink: string | null;
  status: string | null;
  pictures: { id: string; url: string; secure_url: string }[] | null;
  video_id: string | null;
  condition: string | null;
  listing_type_id: string | null;
  location: {
    address_line: string | null;
    city: { name: string } | null;
    state: { name: string } | null;
    neighborhood: { name: string } | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  attributes: { id: string; name?: string; value_id?: string; value_name?: string }[] | null;
  sale_terms: { id: string; value_name?: string }[] | null;
}

interface MeliMultigetResponse {
  code: number;
  body: MeliItem;
}
