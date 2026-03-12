import { Module } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { GoogleCalendarService } from "./google-calendar.service";
import { CalendarController } from "./calendar.controller";

@Module({
  providers: [CalendarService, GoogleCalendarService],
  controllers: [CalendarController],
  exports: [CalendarService, GoogleCalendarService],
})
export class CalendarModule {}
