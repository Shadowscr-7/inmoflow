import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { TenantsModule } from "./tenants/tenants.module";
import { HealthModule } from "./health/health.module";
import { EventLogModule } from "./event-log/event-log.module";
import { EventProducerModule } from "./events/event-producer.module";
import { LeadsModule } from "./leads/leads.module";
import { UsersModule } from "./users/users.module";
import { ChannelsModule } from "./channels/channels.module";
import { MessagesModule } from "./messages/messages.module";
import { LeadSourcesModule } from "./lead-sources/lead-sources.module";
import { TemplatesModule } from "./templates/templates.module";
import { RulesModule } from "./rules/rules.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { MetaOAuthModule } from "./meta/meta-oauth.module";
import { AiModule } from "./ai/ai.module";
import { PlanModule } from "./plan/plan.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { TagsModule } from "./tags/tags.module";
import { CustomFieldsModule } from "./custom-fields/custom-fields.module";
import { PropertiesModule } from "./properties/properties.module";
import { VisitsModule } from "./visits/visits.module";
import { FollowUpsModule } from "./follow-ups/follow-ups.module";
import { ImportModule } from "./import/import.module";
import { ReportsModule } from "./reports/reports.module";
import { LeadScoringModule } from "./lead-scoring/lead-scoring.module";
import { PublicModule } from "./public/public.module";
import { AgentPerformanceModule } from "./agent-performance/agent-performance.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { QueuedActionsModule } from "./queued-actions/queued-actions.module";
import { CalendarModule } from "./calendar/calendar.module";
import { MeliModule } from "./meli/meli.module";
import { LeadRecoveryModule } from "./lead-recovery/lead-recovery.module";
import { EncryptionModule } from "./common/encryption.module";
import { UploadsModule } from "./uploads/uploads.module";
import { ReelVideoModule } from "./reel-video/reel-video.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    EncryptionModule,
    PrismaModule,
    PlanModule,
    AuthModule,
    EventLogModule,
    EventProducerModule,
    TenantsModule,
    UsersModule,
    LeadsModule,
    ChannelsModule,
    MessagesModule,
    LeadSourcesModule,
    TemplatesModule,
    RulesModule,
    NotificationsModule,
    MetaOAuthModule,
    AiModule,
    DashboardModule,
    TagsModule,
    CustomFieldsModule,
    PropertiesModule,
    VisitsModule,
    FollowUpsModule,
    ImportModule,
    ReportsModule,
    LeadScoringModule,
    PublicModule,
    AgentPerformanceModule,
    CommissionsModule,
    QueuedActionsModule,
    CalendarModule,
    MeliModule,
    LeadRecoveryModule,
    UploadsModule,
    ReelVideoModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
