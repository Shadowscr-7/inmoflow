import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LeadScoringService } from "./lead-scoring.service";
import { LeadScoringController } from "./lead-scoring.controller";

@Module({
  imports: [PrismaModule],
  controllers: [LeadScoringController],
  providers: [LeadScoringService],
  exports: [LeadScoringService],
})
export class LeadScoringModule {}
