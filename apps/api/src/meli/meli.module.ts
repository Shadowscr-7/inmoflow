import { Module } from "@nestjs/common";
import { MeliService } from "./meli.service";
import { MeliController } from "./meli.controller";

@Module({
  providers: [MeliService],
  controllers: [MeliController],
  exports: [MeliService],
})
export class MeliModule {}
