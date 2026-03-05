import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentPerformanceService } from "./agent-performance.service";
import { AgentPerformanceController } from "./agent-performance.controller";

@Module({
  imports: [PrismaModule],
  controllers: [AgentPerformanceController],
  providers: [AgentPerformanceService],
  exports: [AgentPerformanceService],
})
export class AgentPerformanceModule {}
