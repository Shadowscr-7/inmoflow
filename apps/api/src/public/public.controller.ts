import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  Headers,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsString, IsOptional, IsEmail, MaxLength } from "class-validator";
import { Response } from "express";
import { PublicService } from "./public.service";

class SubmitContactDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}

/**
 * Public controller — NO authentication required.
 * Serves public property pages and QR codes for offline marketing.
 */
@Controller("public")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  /** Get public property data */
  @Get("properties/:tenantId/:slug")
  getProperty(
    @Param("tenantId") tenantId: string,
    @Param("slug") slug: string,
  ) {
    return this.publicService.getPublicProperty(tenantId, slug);
  }

  /** Submit a contact request from the public property page */
  @Post("properties/:tenantId/:slug/contact")
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // 5 submissions per minute per IP
  submitContact(
    @Param("tenantId") tenantId: string,
    @Param("slug") slug: string,
    @Body() dto: SubmitContactDto,
  ) {
    return this.publicService.submitContact(tenantId, slug, dto);
  }

  /** Generate QR code SVG for a property */
  @Get("properties/:tenantId/:slug/qr")
  async getQrCode(
    @Param("tenantId") tenantId: string,
    @Param("slug") slug: string,
    @Headers("host") host: string,
    @Res() res: Response,
  ) {
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const frontendUrl = process.env.FRONTEND_URL ?? `${protocol}://${host?.split(":")[0] ?? "localhost"}:3000`;
    const svg = await this.publicService.generateQrSvg(frontendUrl, tenantId, slug);
    res.set("Content-Type", "image/svg+xml");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(svg);
  }

  /** Get public URL and QR URL for a property (used by authenticated frontend) */
  @Get("properties/:tenantId/:slug/urls")
  getPropertyUrls(
    @Param("tenantId") tenantId: string,
    @Param("slug") slug: string,
    @Headers("host") host: string,
  ) {
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    const frontendUrl = process.env.FRONTEND_URL ?? `${protocol}://${host?.split(":")[0] ?? "localhost"}:3000`;
    const apiBase = process.env.API_URL ?? `${protocol}://${host ?? "localhost:4000"}`;
    return {
      publicUrl: this.publicService.getPublicUrl(frontendUrl, tenantId, slug),
      qrUrl: `${apiBase}/api/public/properties/${tenantId}/${slug}/qr`,
    };
  }
}
