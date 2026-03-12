import { Module } from "@nestjs/common";
import { VisitsService } from "./visits.service";
import { VisitsController } from "./visits.controller";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [CalendarModule],
  providers: [VisitsService],
  controllers: [VisitsController],
  exports: [VisitsService],
})
export class VisitsModule {}
