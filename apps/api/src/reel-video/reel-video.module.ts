import { Module } from "@nestjs/common";
import { ReelVideoService } from "./reel-video.service";
import { ReelVideoController } from "./reel-video.controller";
import { PropertiesModule } from "../properties/properties.module";

@Module({
  imports: [PropertiesModule],
  providers: [ReelVideoService],
  controllers: [ReelVideoController],
})
export class ReelVideoModule {}
