import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { MeliService } from "./meli.service";
import { JwtAuthGuard, TenantGuard, TenantId } from "../auth";

/**
 * MeliController — MercadoLibre OAuth + sync endpoints.
 *
 * Routes:
 *   GET  /meli/auth-url       → Get MeLi OAuth redirect URL
 *   GET  /meli/callback       → Handle OAuth callback (triggered from frontend)
 *   GET  /meli/status         → Check connection status
 *   POST /meli/sync           → Import all items from MeLi
 *   GET  /meli/items          → Preview items before importing
 *   DELETE /meli              → Disconnect MeLi
 */
@Controller("meli")
@UseGuards(JwtAuthGuard, TenantGuard)
export class MeliController {
  constructor(private readonly meliService: MeliService) {}

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
}
