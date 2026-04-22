import { Module } from "@nestjs/common";
import { ReelVideoService } from "./reel-video.service";
import { ReelVideoController } from "./reel-video.controller";
import { TtsService } from "./tts.service";
import { PropertiesModule } from "../properties/properties.module";

@Module({
  imports: [PropertiesModule],
  providers: [ReelVideoService, TtsService],
  controllers: [ReelVideoController],
})
export class ReelVideoModule {}
