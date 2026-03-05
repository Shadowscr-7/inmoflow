import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Plan } from "@inmoflow/db";

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

  /** Update tenant (plan, name) */
  async update(id: string, data: { name?: string; plan?: Plan }) {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.plan && { plan: data.plan }),
      },
    });
  }

  /** ADMIN: list all tenants with user counts */
  async findAll() {
    return this.prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        plan: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: { name: "asc" },
    });
  }
}
