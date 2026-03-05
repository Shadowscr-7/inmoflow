import { Global, Module } from "@nestjs/common";
import { PlanService } from "./plan.service";
import { PlanController } from "./plan.controller";

@Global()
@Module({
  controllers: [PlanController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
