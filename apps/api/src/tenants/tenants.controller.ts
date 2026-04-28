import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles, TenantId, CurrentUser } from "../auth";
import { CreateTenantDto } from "./dto";

@Controller("tenants")
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /** ADMIN only: create a new tenant */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async create(@Body() body: CreateTenantDto) {
    return this.tenantsService.create(body);
  }

  /** Authenticated: get current tenant info */
  @Get("me")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async me(@TenantId() tenantId: string) {
    return this.tenantsService.findById(tenantId);
  }

  /** ADMIN only: list all tenants */
  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN")
  async findAll() {
    return this.tenantsService.findAll();
  }

  /** BUSINESS: update own tenant notification settings */
  @Patch("me/settings")
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  async updateMySettings(
    @TenantId() tenantId: string,
    @Body() body: {
      telegramNotifEnabled?: boolean;
      telegramNotifBotToken?: string;
      telegramNotifChatId?: string;
    },
  ) {
    try {
      return await this.tenantsService.updateMySettings(tenantId, body);
    } catch (err: unknown) {
      throw new BadRequestException(err instanceof Error ? err.message : "Error al actualizar configuración");
    }
  }

  /** ADMIN only: update a tenant (plan, name, subscription) */
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async update(
    @Param("id") id: string,
    @Body() body: {
      name?: string;
      plan?: string;
      subscriptionStatus?: string;
      subscriptionStartedAt?: string | null;
      subscriptionEndsAt?: string | null;
      subscriptionGraceDays?: number;
      paymentProvider?: string | null;
      paymentReference?: string | null;
      paymentNotes?: string | null;
    },
  ) {
    return this.tenantsService.update(id, body as Parameters<typeof this.tenantsService.update>[1]);
  }
}
