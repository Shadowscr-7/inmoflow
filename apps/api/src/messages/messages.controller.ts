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
import { JwtAuthGuard, TenantGuard } from "../auth/guards";
import { TenantId } from "../auth/decorators";
import { SendMessageDto } from "../channels/dto";

@Controller("messages")
@UseGuards(JwtAuthGuard, TenantGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

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
}
