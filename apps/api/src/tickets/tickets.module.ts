import { Module } from "@nestjs/common";
import { TicketsController, TicketsPublicController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [TicketsController, TicketsPublicController],
  providers: [TicketsService],
})
export class TicketsModule {}
