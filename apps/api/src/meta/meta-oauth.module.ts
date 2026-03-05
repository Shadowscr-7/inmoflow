import { Module } from "@nestjs/common";
import { MetaOAuthController } from "./meta-oauth.controller";
import { MetaOAuthService } from "./meta-oauth.service";

@Module({
  controllers: [MetaOAuthController],
  providers: [MetaOAuthService],
  exports: [MetaOAuthService],
})
export class MetaOAuthModule {}
