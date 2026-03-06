import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@inmoflow/db";

export interface CreateNotificationDto {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  entity?: string;
  entityId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a notification for a specific user */
  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        tenantId: dto.tenantId,
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        entity: dto.entity,
        entityId: dto.entityId,
      },
    });
  }

  /** Bulk-create notifications for multiple users */
  async createMany(
    dtos: CreateNotificationDto[],
  ): Promise<{ count: number }> {
    return this.prisma.notification.createMany({
      data: dtos.map((d) => ({
        tenantId: d.tenantId,
        userId: d.userId,
        type: d.type,
        title: d.title,
        message: d.message,
        entity: d.entity,
        entityId: d.entityId,
      })),
    });
  }

  /**
   * Get notifications for the current user.
   * ADMIN: all notifications across the platform (optionally filtered by tenantId header).
   * BUSINESS: own notifications + all agent notifications in the tenant.
   * AGENT/VIEWER: only own notifications.
   */
  async findForUser(
    tenantId: string,
    userId: string,
    role: string,
    opts?: { unreadOnly?: boolean; limit?: number; offset?: number },
  ) {
    if (!tenantId) return { data: [], total: 0, unread: 0 };

    const where: Prisma.NotificationWhereInput = { tenantId };

    if (role === "ADMIN") {
      // Admin sees all in the tenant (or all if no tenant)
    } else if (role === "BUSINESS") {
      // Business sees all notifications within their tenant
    } else {
      // Agent/Viewer sees only own
      where.userId = userId;
    }

    if (opts?.unreadOnly) where.read = false;

    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: opts?.limit ?? 30,
        skip: opts?.offset ?? 0,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { ...where, read: false },
      }),
    ]);

    return { data, total, unread };
  }

  /** Mark a single notification as read */
  async markRead(tenantId: string, id: string, userId: string, role: string) {
    const where: Prisma.NotificationWhereInput = { id, tenantId };
    // Only allow marking own notifications unless ADMIN/BUSINESS
    if (role !== "ADMIN" && role !== "BUSINESS") {
      where.userId = userId;
    }

    const notif = await this.prisma.notification.findFirst({ where });
    if (!notif) return null;

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  /** Mark all notifications as read for a user/tenant */
  async markAllRead(tenantId: string, userId: string, role: string) {
    const where: Prisma.NotificationWhereInput = { tenantId, read: false };

    if (role !== "ADMIN" && role !== "BUSINESS") {
      where.userId = userId;
    }

    return this.prisma.notification.updateMany({
      where,
      data: { read: true },
    });
  }

  // ─── Notification Preferences ─────────────────────

  /** Get notification preferences for a user (create defaults if not exist) */
  async getPreferences(tenantId: string, userId: string) {
    if (!tenantId) return null;

    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({
        data: { tenantId, userId },
      });
    }

    return prefs;
  }

  /** Update notification preferences */
  async updatePreferences(
    tenantId: string,
    userId: string,
    data: {
      pushEnabled?: boolean;
      emailDigest?: "NONE" | "DAILY" | "WEEKLY";
      pushSubscription?: unknown;
    },
  ) {
    if (!tenantId) return null;

    return this.prisma.notificationPreference.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: {
        tenantId,
        userId,
        pushEnabled: data.pushEnabled ?? true,
        emailDigest: data.emailDigest ?? "NONE",
        pushSubscription: data.pushSubscription as any,
      },
      update: {
        ...(data.pushEnabled !== undefined && { pushEnabled: data.pushEnabled }),
        ...(data.emailDigest !== undefined && { emailDigest: data.emailDigest }),
        ...(data.pushSubscription !== undefined && { pushSubscription: data.pushSubscription as any }),
      },
    });
  }

  /** Get digest summary for a tenant-user (unread notifications since last digest) */
  async getDigestSummary(tenantId: string, userId: string, since: Date) {
    const notifications = await this.prisma.notification.findMany({
      where: {
        tenantId,
        userId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const byType: Record<string, number> = {};
    for (const n of notifications) {
      byType[n.type] = (byType[n.type] ?? 0) + 1;
    }

    return {
      total: notifications.length,
      byType,
      recent: notifications.slice(0, 10),
    };
  }
}
