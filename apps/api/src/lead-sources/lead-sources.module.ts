import { Module } from "@nestjs/common";
import { LeadSourcesService } from "./lead-sources.service";
import { LeadSourcesController } from "./lead-sources.controller";
import { MetaWebhookController } from "./meta-webhook.controller";
import { InboundWebhookController } from "./inbound-webhook.controller";

@Module({
  controllers: [LeadSourcesController, MetaWebhookController, InboundWebhookController],
  providers: [LeadSourcesService],
  exports: [LeadSourcesService],
})
export class LeadSourcesModule {}
