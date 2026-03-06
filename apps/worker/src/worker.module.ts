import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { LeadProcessor } from "./processors/lead.processor";
import { MessageProcessor } from "./processors/message.processor";
import { WorkflowProcessor } from "./processors/workflow.processor";
import { RuleEngineService } from "./services/rule-engine.service";
import { NoResponseScheduler } from "./services/no-response.scheduler";
import { AiAgentService } from "./services/ai-agent.service";
import { MessageSenderService } from "./services/message-sender.service";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue(
      { name: "lead" },
      { name: "message" },
      { name: "workflow" },
    ),
    PrismaModule,
  ],
  providers: [
    AiAgentService,
    MessageSenderService,
    RuleEngineService,
    NoResponseScheduler,
    LeadProcessor,
    MessageProcessor,
    WorkflowProcessor,
  ],
})
export class WorkerModule {}
