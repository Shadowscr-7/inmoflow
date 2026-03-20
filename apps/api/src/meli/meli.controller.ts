import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import { MeliService } from "./meli.service";
import { JwtAuthGuard, TenantGuard, TenantId } from "../auth";
import { PrismaService } from "../prisma/prisma.service";

/**
 * MeliController — MercadoLibre OAuth + sync endpoints.
 *
 * Routes:
 *   GET  /meli/auth-url       → Get MeLi OAuth redirect URL
 *   GET  /meli/callback       → Handle OAuth callback (triggered from frontend)
 *   GET  /meli/status         → Check connection status
 *   POST /meli/sync           → Import all items from MeLi
 *   GET  /meli/items          → Preview items before importing
 *   POST /meli/assign-seller  → Map MeLi seller to InmoFlow agent
 *   DELETE /meli              → Disconnect MeLi
 */
@Controller("meli")
@UseGuards(JwtAuthGuard, TenantGuard)
export class MeliController {
  constructor(
    private readonly meliService: MeliService,
    private readonly prisma: PrismaService,
  ) {}

  /** Is MercadoLibre integration configured on this server? */
  @Get("configured")
  getConfigured() {
    return { configured: this.meliService.isConfigured };
  }

  /** Get OAuth redirect URL */
  @Get("auth-url")
  getAuthUrl(@TenantId() tenantId: string) {
    const url = this.meliService.getAuthUrl(tenantId);
    return { url };
  }

  /** OAuth callback — frontend sends the code here */
  @Get("callback")
  async handleCallback(
    @TenantId() tenantId: string,
    @Query("code") code: string,
  ) {
    await this.meliService.handleCallback(code, tenantId);
    return { ok: true, message: "MercadoLibre conectado exitosamente" };
  }

  /** Check MeLi connection status */
  @Get("status")
  async getStatus(@TenantId() tenantId: string) {
    return this.meliService.getStatus(tenantId);
  }

  /** Preview items available to import */
  @Get("items")
  async getItems(@TenantId() tenantId: string) {
    const ids = await this.meliService.getUserItemIds(tenantId);
    if (!ids.length) return { items: [], total: 0 };
    const items = await this.meliService.getItemsDetails(tenantId, ids);
    return {
      items: items.map((i) => ({
        id: i.id,
        title: i.title,
        price: i.price,
        currency: i.currency_id,
        permalink: i.permalink,
        status: i.status,
        thumbnail: i.pictures?.[0]?.secure_url ?? i.pictures?.[0]?.url ?? null,
        hasVideo: !!i.video_id,
        pictureCount: i.pictures?.length ?? 0,
      })),
      total: ids.length,
    };
  }

  /** Sync / import all MeLi items */
  @Post("sync")
  async syncAll(@TenantId() tenantId: string) {
    return this.meliService.syncAll(tenantId);
  }

  /** Disconnect MercadoLibre */
  @Delete()
  async disconnect(@TenantId() tenantId: string) {
    await this.meliService.disconnect(tenantId);
    return { ok: true };
  }

  /** Manually assign a MeLi seller to an InmoFlow agent */
  @Post("assign-seller")
  async assignSeller(
    @TenantId() tenantId: string,
    @Body() body: { meliSellerId: string; agentId: string },
  ) {
    // Update all properties from this seller
    const result = await this.prisma.property.updateMany({
      where: { tenantId, meliSellerId: body.meliSellerId },
      data: { assignedUserId: body.agentId },
    });
    return { ok: true, updated: result.count };
  }
}
