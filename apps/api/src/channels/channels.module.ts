import { Module } from "@nestjs/common";
import { ChannelsService } from "./channels.service";
import { ChannelsController } from "./channels.controller";
import { WebhooksController } from "./webhooks.controller";
import { EvolutionProvider } from "./providers/evolution.provider";
import { TelegramProvider } from "./providers/telegram.provider";

@Module({
  controllers: [WebhooksController, ChannelsController],
  providers: [ChannelsService, EvolutionProvider, TelegramProvider],
  exports: [ChannelsService, EvolutionProvider, TelegramProvider],
})
export class ChannelsModule {}
