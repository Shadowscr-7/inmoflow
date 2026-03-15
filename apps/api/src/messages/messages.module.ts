import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { MessagesService } from "./messages.service";
import { MessagesController } from "./messages.controller";
import { ChannelsModule } from "../channels/channels.module";

@Module({
  imports: [BullModule.registerQueue({ name: "message" }), ChannelsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
