import { Module } from "@nestjs/common";
import { FollowUpsService } from "./follow-ups.service";
import { FollowUpsController } from "./follow-ups.controller";

@Module({
  providers: [FollowUpsService],
  controllers: [FollowUpsController],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
