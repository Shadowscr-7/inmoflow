import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Plan, SubscriptionStatus, PaymentProvider } from "@inmoflow/db";

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { name: string; plan?: Plan }) {
    const DEFAULT_STAGES = [
      { key: "NEW", name: "Nuevo", order: 0, isDefault: true },
      { key: "CONTACTED", name: "Contactado", order: 1 },
      { key: "QUALIFIED", name: "Calificado", order: 2 },
      { key: "VISIT", name: "Visita", order: 3 },
      { key: "NEGOTIATION", name: "Negociación", order: 4 },
      { key: "WON", name: "Ganado", order: 5 },
      { key: "LOST", name: "Perdido", order: 6 },
    ];

    return this.prisma.tenant.create({
      data: {
        name: data.name,
        plan: data.plan ?? Plan.STARTER,
        leadStages: {
          create: DEFAULT_STAGES.map((s) => ({
            key: s.key,
            name: s.name,
            order: s.order,
            isDefault: s.isDefault ?? false,
          })),
        },
      },
      include: { leadStages: true },
    });
  }

  async findById(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      include: { domains: true, leadStages: { orderBy: { order: "asc" } } },
    });
  }

  /** Update tenant (plan, name, subscription) */
  async update(id: string, data: {
    name?: string;
    plan?: Plan;
    subscriptionStatus?: SubscriptionStatus;
    subscriptionStartedAt?: string | null;
    subscriptionEndsAt?: string | null;
    subscriptionGraceDays?: number;
    paymentProvider?: PaymentProvider | null;
    paymentReference?: string | null;
    paymentNotes?: string | null;
  }) {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.plan && { plan: data.plan }),
        ...(data.subscriptionStatus !== undefined && { subscriptionStatus: data.subscriptionStatus }),
        ...(data.subscriptionStartedAt !== undefined && { subscriptionStartedAt: data.subscriptionStartedAt ? new Date(data.subscriptionStartedAt) : null }),
        ...(data.subscriptionEndsAt !== undefined && { subscriptionEndsAt: data.subscriptionEndsAt ? new Date(data.subscriptionEndsAt) : null }),
        ...(data.subscriptionGraceDays !== undefined && { subscriptionGraceDays: data.subscriptionGraceDays }),
        ...(data.paymentProvider !== undefined && { paymentProvider: data.paymentProvider }),
        ...(data.paymentReference !== undefined && { paymentReference: data.paymentReference || null }),
        ...(data.paymentNotes !== undefined && { paymentNotes: data.paymentNotes || null }),
      },
    });
  }

  /** BUSINESS: update own tenant's notification settings */
  async updateMySettings(tenantId: string, data: {
    telegramNotifEnabled?: boolean;
    telegramNotifBotToken?: string;
    telegramNotifChatId?: string;
  }) {
    // Cannot enable without both token and chatId
    if (data.telegramNotifEnabled) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { telegramNotifBotToken: true, telegramNotifChatId: true },
      });
      const token = data.telegramNotifBotToken ?? tenant?.telegramNotifBotToken;
      const chatId = data.telegramNotifChatId ?? tenant?.telegramNotifChatId;
      if (!token || !chatId) {
        throw new Error("Debe configurar el bot token y el chat ID antes de activar las notificaciones");
      }
    }

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.telegramNotifEnabled !== undefined && { telegramNotifEnabled: data.telegramNotifEnabled }),
        ...(data.telegramNotifBotToken !== undefined && { telegramNotifBotToken: data.telegramNotifBotToken || null }),
        ...(data.telegramNotifChatId !== undefined && { telegramNotifChatId: data.telegramNotifChatId || null }),
      },
      select: {
        id: true,
        telegramNotifEnabled: true,
        telegramNotifBotToken: true,
        telegramNotifChatId: true,
      },
    });
  }

  /** ADMIN: list all tenants with user counts and subscription info */
  async findAll() {
    return this.prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        plan: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionStartedAt: true,
        subscriptionEndsAt: true,
        subscriptionGraceDays: true,
        paymentProvider: true,
        paymentReference: true,
        paymentNotes: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });
  }
}
