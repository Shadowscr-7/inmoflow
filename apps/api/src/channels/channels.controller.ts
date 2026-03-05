import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ChannelsService } from "./channels.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId, CurrentUser } from "../auth/decorators";
import { CreateChannelDto } from "./dto";

@Controller("channels")
@UseGuards(JwtAuthGuard, TenantGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  /** All channels for the tenant (includes user info) */
  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.channelsService.findAll(tenantId);
  }

  /** Channels for the current user only */
  @Get("mine")
  findMine(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.channelsService.findByUser(tenantId, user.userId);
  }

  @Get(":id")
  findById(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.channelsService.findById(tenantId, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: { userId: string },
    @Body() body: CreateChannelDto,
  ) {
    return this.channelsService.create(tenantId, user.userId, body);
  }

  @Post(":id/disconnect")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS", "AGENT")
  disconnect(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.channelsService.disconnect(tenantId, id);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  delete(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.channelsService.delete(tenantId, id);
  }
}
