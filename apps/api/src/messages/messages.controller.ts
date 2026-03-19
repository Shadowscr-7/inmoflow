import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { JwtAuthGuard, TenantGuard, RolesGuard, Roles } from "../auth/guards";
import { TenantId } from "../auth/decorators";
import { SendMessageDto } from "../channels/dto";

@Controller("messages")
@UseGuards(JwtAuthGuard, TenantGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * GET /messages/history — full message history with filters (ADMIN / BUSINESS only)
   */
  @Get("history")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "BUSINESS")
  history(
    @TenantId() tenantId: string,
    @Query("direction") direction?: string,
    @Query("status") status?: string,
    @Query("channel") channel?: string,
    @Query("assigneeId") assigneeId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("search") search?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.messagesService.findHistory(tenantId, {
      direction: direction as "IN" | "OUT" | undefined,
      status: status || undefined,
      channel: channel || undefined,
      assigneeId: assigneeId || undefined,
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /**
   * GET /messages/:leadId — conversation for a lead
   */
  @Get(":leadId")
  findByLead(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.messagesService.findByLead(
      tenantId,
      leadId,
      limit ? parseInt(limit, 10) : undefined,
      offset ? parseInt(offset, 10) : undefined,
    );
  }

  /**
   * POST /messages/:leadId/send — send a message to a lead
   */
  @Post(":leadId/send")
  send(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
    @Body() body: SendMessageDto,
  ) {
    return this.messagesService.send(tenantId, leadId, body);
  }

  /**
   * POST /messages/:leadId/sync — pull messages from Evolution API into DB
   */
  @Post(":leadId/sync")
  sync(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
  ) {
    return this.messagesService.syncInbound(tenantId, leadId);
  }

  /**
   * POST /messages/:leadId/:messageId/retry — retry sending a failed message
   */
  @Post(":leadId/:messageId/retry")
  retry(
    @TenantId() tenantId: string,
    @Param("leadId") leadId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.messagesService.retryMessage(tenantId, leadId, messageId);
  }
}
