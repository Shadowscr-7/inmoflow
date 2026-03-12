import { Module } from "@nestjs/common";
import { QueuedActionsService } from "./queued-actions.service";
import { QueuedActionsController } from "./queued-actions.controller";

@Module({
  controllers: [QueuedActionsController],
  providers: [QueuedActionsService],
  exports: [QueuedActionsService],
})
export class QueuedActionsModule {}
