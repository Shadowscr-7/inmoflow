import { Module } from "@nestjs/common";
import { LeadRecoveryController } from "./lead-recovery.controller";
import { LeadRecoveryService } from "./lead-recovery.service";
import { PrismaModule } from "../prisma/prisma.module";
import { EventLogModule } from "../event-log/event-log.module";
import { EventProducerModule } from "../events/event-producer.module";
import { LeadSourcesModule } from "../lead-sources/lead-sources.module";

@Module({
  imports: [PrismaModule, EventLogModule, EventProducerModule, LeadSourcesModule],
  controllers: [LeadRecoveryController],
  providers: [LeadRecoveryService],
})
export class LeadRecoveryModule {}
