import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { EventProducerService } from "./event-producer.service";

@Global()
@Module({
  imports: [
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
  ],
  providers: [EventProducerService],
  exports: [EventProducerService],
})
export class EventProducerModule {}
