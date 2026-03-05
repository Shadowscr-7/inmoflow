import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiConfigService } from "./ai-config.service";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiConfigService, AiService],
  exports: [AiConfigService, AiService],
})
export class AiModule {}
