import { Module } from "@nestjs/common";
import { BroadcastsController } from "./broadcasts.controller";
import { BroadcastsService } from "./broadcasts.service";
import { PrismaModule } from "../prisma/prisma.module";
import { MessagesModule } from "../messages/messages.module";

@Module({
  imports: [PrismaModule, MessagesModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
})
export class BroadcastsModule {}
