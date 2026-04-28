import {
  PrismaClient,
  UserRole,
  LeadStatus,
  LeadSourceType,
  EventType,
  MessageDirection,
  MessageChannel,
  Plan,
  VisitStatus,
  CommissionStatus,
  OperationType,
  TicketStatus,
  TicketPriority,
  LeadTemperature,
  BroadcastStatus,
  BroadcastItemStatus,
} from "@prisma/client";

if (process.env.NODE_ENV === "production") {
  console.log("⚠️  Seed skipped in production. Use a dedicated migration instead.");
  process.exit(0);
}

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hashSync(password, 10);
}

const DEFAULT_STAGES = [
  { key: "NEW",         name: "Nuevo",        order: 0, isDefault: true  },
  { key: "CONTACTED",   name: "Contactado",   order: 1 },
  { key: "QUALIFIED",   name: "Calificado",   order: 2 },
  { key: "VISIT",       name: "Visita",       order: 3 },
  { key: "NEGOTIATION", name: "Negociación",  order: 4 },
  { key: "WON",         name: "Ganado",       order: 5 },
  { key: "LOST",        name: "Perdido",      order: 6 },
];

function daysAgo(days: number, hoursOffset = 0): Date {
  return new Date(Date.now() - days * 86400000 - hoursOffset * 3600000);
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function upsertLeadSource(tenantId: string, name: string, type: LeadSourceType, webFormKey?: string) {
  const existing = await prisma.leadSource.findFirst({ where: { tenantId, type, name } });
  if (existing) return existing;
  return prisma.leadSource.create({
    data: { tenantId, type, name, webFormKey, enabled: true },
  });
}

const FIRST_NAMES = [
  "María","Carlos","Ana","Roberto","Valentina","Diego","Sofía","Fernando","Lucía","Nicolás",
  "Isabella","Mateo","Julieta","Tomás","Agustín","Milagros","Santiago","Florencia","Emilia",
  "Benjamín","Renata","Ignacio","Paula","Gastón","Camila","Ezequiel","Verónica","Rodrigo",
  "Natalia","Sebastián","Daniela","Ramiro","Leticia","Maximiliano","Cecilia","Gonzalo","Paola",
  "Fabián","Mariana","Ariel","Andrea","Cristian","Lorena","Hugo","Graciela","Jorge","Patricia",
  "Oscar","Elena","Luis","Claudia","Adrián","Jimena","Marcelo","Karina","Hernán","Vanesa",
];

const LAST_NAMES = [
  "García","Rodríguez","Martínez","López","González","Pérez","Sánchez","Romero","Torres","Flores",
  "Rivera","Gómez","Díaz","Reyes","Cruz","Morales","Ortiz","Silva","Rojas","Herrera",
  "Medina","Castro","Vargas","Guerrero","Mendoza","Ramos","Jiménez","Suárez","Aguilar","Ruiz",
  "Acosta","Ríos","Vega","Molina","Cabrera","Mora","Muñoz","Luna","Ponce","Navarro",
  "Ibarra","Salazar","Vera","Cortés","Ferreira","Benitez","Delgado","Crespo","Blanco","Paz",
];

const ZONES = [
  "Palermo","Belgrano","Recoleta","Núñez","Caballito","Villa Urquiza","Saavedra",
  "Microcentro","San Telmo","Puerto Madero","Barracas","Almagro","Flores","Liniers",
  "Pilar","Tigre","Nordelta","Escobar","La Plata","Vicente López","San Isidro","Quilmes",
  "Avellaneda","Ramos Mejía","Morón","Olivos","Martínez","Acassuso","Boulogne","Adrogué",
];

const PROPERTY_TYPES = ["Departamento","Casa","PH","Lote","Local Comercial","Oficina","Cochera","Galpón"];
const AMENITIES_POOL = ["Pileta","Quincho","Parrilla","Gimnasio","Seguridad 24hs","Portero","SUM","Jardín","Terraza","Laundry","Sauna","Estacionamiento visitas"];

const INTENTS = [
  "Busca depto 2amb en Palermo, presupuesto USD 130k",
  "Interesado en casas zona norte, hasta USD 350k",
  "Consulta general por propiedades en alquiler",
  "Busca oficina en microcentro, ~60m²",
  "Inversión en pozo, zona Caballito",
  "Primera vivienda, matrimonio joven, USD 120-180k",
  "Busca PH con terraza, Recoleta o Palermo",
  "Lote en Pilar para construir, ~600m²",
  "Alquiler temporal por trabajo, 3 meses",
  "Inversión Airbnb, zona turística",
  "Permuta departamento actual + diferencia",
  "Busca local para negocio gastronómico",
  "Depto 3amb para familia con 2 hijos",
  "Casa en countries Zona Norte, USD 400-600k",
  "Duplex o PH en zona Belgrano o Núñez",
  "Alquiler oficina compartida, 1-2 escritorios",
  "Busca cochera en microcentro",
  "Galpón industrial 500m² mínimo",
];

async function main() {
  console.log("🌱 Seeding database (FULL DEMO)...");

  const tenantA = await prisma.tenant.upsert({
    where: { id: "tenant-a-seed-id" },
    update: { plan: Plan.PROFESSIONAL },
    create: {
      id: "tenant-a-seed-id",
      name: "Inmobiliaria Demo A",
      plan: Plan.PROFESSIONAL,
      timezone: "America/Argentina/Buenos_Aires",
      phoneCountryCode: "54",
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { id: "tenant-b-seed-id" },
    update: { plan: Plan.STARTER },
    create: {
      id: "tenant-b-seed-id",
      name: "Inmobiliaria Demo B",
      plan: Plan.STARTER,
      timezone: "America/Montevideo",
      phoneCountryCode: "598",
    },
  });

  const pwHash = await hashPassword("password123");

  await prisma.user.upsert({
    where: { id: "super-admin-seed-id" },
    update: { passwordHash: pwHash, isActive: true },
    create: {
      id: "super-admin-seed-id",
      tenantId: null,
      email: "admin@inmoflow.com",
      passwordHash: pwHash,
      role: UserRole.ADMIN,
      name: "Super Admin",
    },
  });

  // ── Users Tenant A ────────────────────────────────────
  const adminA = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "admin@demoa.com" } },
    update: { passwordHash: pwHash, isActive: true },
    create: { tenantId: tenantA.id, email: "admin@demoa.com", passwordHash: pwHash, isActive: true, role: UserRole.BUSINESS, name: "Admin A" },
  });
  const agentA1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "agent@demoa.com" } },
    update: { passwordHash: pwHash, isActive: true },
    create: { tenantId: tenantA.id, email: "agent@demoa.com", passwordHash: pwHash, isActive: true, role: UserRole.AGENT, name: "Lucía Torres" },
  });
  const agentA2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "agent2@demoa.com" } },
    update: { passwordHash: pwHash, isActive: true },
    create: { tenantId: tenantA.id, email: "agent2@demoa.com", passwordHash: pwHash, isActive: true, role: UserRole.AGENT, name: "Martín Ruiz" },
  });
  const agentA3 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "agent3@demoa.com" } },
    update: { passwordHash: pwHash, isActive: true },
    create: { tenantId: tenantA.id, email: "agent3@demoa.com", passwordHash: pwHash, isActive: true, role: UserRole.AGENT, name: "Gabriela Sosa" },
  });
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "viewer@demoa.com" } },
    update: { passwordHash: pwHash, isActive: true },
    create: { tenantId: tenantA.id, email: "viewer@demoa.com", passwordHash: pwHash, isActive: true, role: UserRole.VIEWER, name: "Carlos Méndez" },
  });
  const agentsA = [agentA1, agentA2, agentA3];

  // ── Stages ────────────────────────────────────────────
  const stageMapA: Record<string, string> = {};
  for (const stage of DEFAULT_STAGES) {
    const s = await prisma.leadStage.upsert({
      where: { tenantId_key: { tenantId: tenantA.id, key: stage.key } },
      update: {},
      create: { tenantId: tenantA.id, key: stage.key, name: stage.name, order: stage.order, isDefault: stage.isDefault ?? false },
    });
    stageMapA[stage.key] = s.id;
  }

  await prisma.domain.upsert({
    where: { host: "demoa.tuplataforma.com" },
    update: {},
    create: { tenantId: tenantA.id, host: "demoa.tuplataforma.com", isPrimary: true },
  });

  // ── Lead Sources ──────────────────────────────────────
  const srcManualA   = await upsertLeadSource(tenantA.id, "Manual",             LeadSourceType.MANUAL);
  const srcWebA      = await upsertLeadSource(tenantA.id, "Formulario Web",     LeadSourceType.WEB_FORM, "contact-form-a");
  const srcWhatsAppA = await upsertLeadSource(tenantA.id, "WhatsApp Entrante",  LeadSourceType.WHATSAPP_INBOUND);
  const srcFacebookA = await upsertLeadSource(tenantA.id, "Facebook Lead Ads",  LeadSourceType.META_LEAD_AD);
  const srcTelegramA = await upsertLeadSource(tenantA.id, "Telegram",           LeadSourceType.TELEGRAM_INBOUND);
  const srcWebhookA  = await upsertLeadSource(tenantA.id, "Webhook Externo",    LeadSourceType.WEBHOOK);
  const sourcesA = [srcManualA, srcWebA, srcWhatsAppA, srcFacebookA, srcTelegramA, srcWebhookA];

  // ── Tags ──────────────────────────────────────────────
  const tagsDataA = [
    { name: "VIP",              color: "#F59E0B" },
    { name: "Inversor",         color: "#8B5CF6" },
    { name: "Primera vivienda", color: "#10B981" },
    { name: "Urgente",          color: "#EF4444" },
    { name: "Referido",         color: "#3B82F6" },
    { name: "Airbnb",           color: "#06B6D4" },
    { name: "Permuta",          color: "#EC4899" },
    { name: "Zona norte",       color: "#84CC16" },
  ];
  const tagsA: { id: string; name: string }[] = [];
  for (const t of tagsDataA) {
    const tag = await prisma.tag.upsert({
      where: { tenantId_name: { tenantId: tenantA.id, name: t.name } },
      update: {},
      create: { tenantId: tenantA.id, name: t.name, color: t.color },
    });
    tagsA.push(tag);
  }

  // ── Custom Field Definitions ──────────────────────────
  const cfSource = await prisma.customFieldDefinition.upsert({
    where: { tenantId_name: { tenantId: tenantA.id, name: "Cómo nos conoció" } },
    update: {},
    create: { tenantId: tenantA.id, name: "Cómo nos conoció", fieldType: "SELECT", options: ["Instagram","Google","Recomendación","Cartel","Portal web"], order: 0 },
  });
  const cfTimeline = await prisma.customFieldDefinition.upsert({
    where: { tenantId_name: { tenantId: tenantA.id, name: "Tiempo para decidir" } },
    update: {},
    create: { tenantId: tenantA.id, name: "Tiempo para decidir", fieldType: "SELECT", options: ["Inmediato","1-3 meses","3-6 meses","Más de 6 meses"], order: 1 },
  });
  const cfPreapproved = await prisma.customFieldDefinition.upsert({
    where: { tenantId_name: { tenantId: tenantA.id, name: "Preaprobado bancario" } },
    update: {},
    create: { tenantId: tenantA.id, name: "Preaprobado bancario", fieldType: "BOOLEAN", options: [], order: 2 },
  });

  // ── Properties (20) ───────────────────────────────────
  const propertiesData = [
    { title: "Departamento 2 amb. luminoso en Palermo Soho", type: "Departamento", op: "sale",  price: 145000, currency: "USD", zone: "Palermo",      bedrooms: 2, bathrooms: 1, area: 58,  garage: false, floors: 5  },
    { title: "Casa 4 amb. con jardín en Belgrano R",         type: "Casa",         op: "sale",  price: 380000, currency: "USD", zone: "Belgrano",      bedrooms: 4, bathrooms: 3, area: 220, garage: true,  floors: 2  },
    { title: "PH con terraza privada, Recoleta",             type: "PH",           op: "sale",  price: 275000, currency: "USD", zone: "Recoleta",      bedrooms: 3, bathrooms: 2, area: 130, garage: true,  floors: 6  },
    { title: "Lote 600m² en Pilar Golf Club",                type: "Lote",         op: "sale",  price: 95000,  currency: "USD", zone: "Pilar",         bedrooms: 0, bathrooms: 0, area: 600, garage: false, floors: 0  },
    { title: "Oficina premium 80m² en microcentro",          type: "Oficina",      op: "rent",  price: 850000, currency: "ARS", zone: "Microcentro",   bedrooms: 0, bathrooms: 1, area: 80,  garage: false, floors: 10 },
    { title: "Casa en country Nordelta, 5 amb.",             type: "Casa",         op: "sale",  price: 520000, currency: "USD", zone: "Nordelta",      bedrooms: 5, bathrooms: 4, area: 320, garage: true,  floors: 2  },
    { title: "Depto 1 amb. en pozo — Caballito",             type: "Departamento", op: "sale",  price: 82000,  currency: "USD", zone: "Caballito",     bedrooms: 1, bathrooms: 1, area: 38,  garage: false, floors: 9  },
    { title: "Local comercial esquina San Telmo",            type: "Local Comercial",op:"rent",  price: 620000, currency: "ARS", zone: "San Telmo",     bedrooms: 0, bathrooms: 1, area: 95,  garage: false, floors: 1  },
    { title: "Casa de verano en Tigre, 3 amb.",              type: "Casa",         op: "rent",  price: 180000, currency: "ARS", zone: "Tigre",         bedrooms: 3, bathrooms: 2, area: 140, garage: false, floors: 1  },
    { title: "Duplex moderno Villa Urquiza",                 type: "PH",           op: "sale",  price: 198000, currency: "USD", zone: "Villa Urquiza", bedrooms: 3, bathrooms: 2, area: 105, garage: true,  floors: 2  },
    { title: "Departamento 3 amb. en Núñez, vista río",     type: "Departamento", op: "sale",  price: 235000, currency: "USD", zone: "Núñez",         bedrooms: 3, bathrooms: 2, area: 95,  garage: true,  floors: 14 },
    { title: "Galpón industrial 800m² en Avellaneda",       type: "Galpón",       op: "rent",  price: 1200000,currency: "ARS", zone: "Avellaneda",    bedrooms: 0, bathrooms: 2, area: 800, garage: true,  floors: 1  },
    { title: "Depto 2 amb. amueblado alquiler temporal",    type: "Departamento", op: "rent",  price: 900,    currency: "USD", zone: "Palermo",       bedrooms: 2, bathrooms: 1, area: 55,  garage: false, floors: 3  },
    { title: "Casa 3 amb. con pileta en Adrogué",           type: "Casa",         op: "sale",  price: 160000, currency: "USD", zone: "Adrogué",       bedrooms: 3, bathrooms: 2, area: 170, garage: true,  floors: 1  },
    { title: "Lote esquinero 450m² en Escobar",             type: "Lote",         op: "sale",  price: 48000,  currency: "USD", zone: "Escobar",       bedrooms: 0, bathrooms: 0, area: 450, garage: false, floors: 0  },
    { title: "Cochera cubierta microcentro",                type: "Cochera",      op: "rent",  price: 95000,  currency: "ARS", zone: "Microcentro",   bedrooms: 0, bathrooms: 0, area: 15,  garage: false, floors: -1 },
    { title: "Depto 4 amb. reciclado en Saavedra",         type: "Departamento", op: "sale",  price: 185000, currency: "USD", zone: "Saavedra",      bedrooms: 4, bathrooms: 2, area: 120, garage: true,  floors: 4  },
    { title: "Chalet 5 amb. en San Isidro",                 type: "Casa",         op: "sale",  price: 750000, currency: "USD", zone: "San Isidro",    bedrooms: 5, bathrooms: 4, area: 450, garage: true,  floors: 2  },
    { title: "Depto 2 amb. en Almagro, estrenar",          type: "Departamento", op: "sale",  price: 118000, currency: "USD", zone: "Almagro",       bedrooms: 2, bathrooms: 1, area: 62,  garage: false, floors: 7  },
    { title: "PH 3 amb. con parrilla en Flores",           type: "PH",           op: "sale",  price: 142000, currency: "USD", zone: "Flores",        bedrooms: 3, bathrooms: 2, area: 90,  garage: false, floors: 3  },
  ];

  const createdPropertiesA: string[] = [];
  for (let i = 0; i < propertiesData.length; i++) {
    const pd = propertiesData[i];
    const slug = `demo-prop-${i + 1}-${tenantA.id.slice(0, 6)}`;
    const amenities = JSON.stringify(AMENITIES_POOL.slice(0, rand(2, 6)));
    const existing = await prisma.property.findFirst({ where: { tenantId: tenantA.id, slug } });
    if (existing) { createdPropertiesA.push(existing.id); continue; }
    const p = await prisma.property.create({
      data: {
        tenantId: tenantA.id,
        assignedUserId: pick(agentsA).id,
        title: pd.title,
        propertyType: pd.type,
        operationType: pd.op,
        price: pd.price,
        currency: pd.currency,
        zone: pd.zone,
        bedrooms: pd.bedrooms,
        bathrooms: pd.bathrooms,
        areaM2: pd.area,
        hasGarage: pd.garage,
        floors: pd.floors,
        amenities,
        status: i < 16 ? "ACTIVE" : "PAUSED",
        slug,
        publishedAt: daysAgo(rand(5, 60)),
        description: `Excelente propiedad en ${pd.zone}. ${pd.type} de ${pd.area}m² con ${pd.bedrooms} dormitorios. Ideal para ${pd.op === "sale" ? "compra" : "alquiler"}.`,
        address: `${pd.zone} ${rand(100, 9999)}`,
      },
    });
    createdPropertiesA.push(p.id);
  }

  // ── 80 Leads ──────────────────────────────────────────
  type LeadSeed = {
    name: string; email: string; phone: string;
    status: LeadStatus; stageKey: string; score: number;
    assigneeIdx: number; sourceIdx: number;
    intent: string | null; dayOffset: number;
    temp: LeadTemperature | null;
  };

  const stageDistributions: Array<{ status: LeadStatus; key: string; scoreRange: [number,number]; tempOpts: (LeadTemperature | null)[]; count: number }> = [
    { status: LeadStatus.NEW,         key: "NEW",         scoreRange: [2,25],   tempOpts: ["COLD", null],           count: 18 },
    { status: LeadStatus.CONTACTED,   key: "CONTACTED",   scoreRange: [25,45],  tempOpts: ["COLD","WARM"],          count: 12 },
    { status: LeadStatus.QUALIFIED,   key: "QUALIFIED",   scoreRange: [45,70],  tempOpts: ["WARM","HOT"],           count: 12 },
    { status: LeadStatus.VISIT,       key: "VISIT",       scoreRange: [65,82],  tempOpts: ["WARM","HOT"],           count: 10 },
    { status: LeadStatus.NEGOTIATION, key: "NEGOTIATION", scoreRange: [80,92],  tempOpts: ["HOT"],                  count: 8  },
    { status: LeadStatus.WON,         key: "WON",         scoreRange: [95,100], tempOpts: ["HOT"],                  count: 14 },
    { status: LeadStatus.LOST,        key: "LOST",        scoreRange: [5,30],   tempOpts: ["COLD", null],           count: 6  },
  ];

  const leadsDataA: LeadSeed[] = [];
  let phoneCounter = 1;
  for (const st of stageDistributions) {
    for (let n = 0; n < st.count; n++) {
      leadsDataA.push({
        name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        email: `lead${phoneCounter}@example.com`,
        phone: `+549115555${String(phoneCounter).padStart(4, "0")}`,
        status: st.status,
        stageKey: st.key,
        score: rand(st.scoreRange[0], st.scoreRange[1]),
        assigneeIdx: rand(0, agentsA.length - 1),
        sourceIdx: rand(0, sourcesA.length - 1),
        intent: rand(0, 3) === 0 ? null : pick(INTENTS),
        dayOffset: rand(0, 90),
        temp: pick(st.tempOpts),
      });
      phoneCounter++;
    }
  }

  const createdLeadsA: { id: string; name: string | null; phone: string | null; email: string | null; status: string }[] = [];
  for (const ld of leadsDataA) {
    const existing = await prisma.lead.findFirst({ where: { tenantId: tenantA.id, email: ld.email } });
    if (!existing) {
      const lead = await prisma.lead.create({
        data: {
          tenantId: tenantA.id,
          name: ld.name,
          email: ld.email,
          phone: ld.phone,
          status: ld.status,
          stageId: stageMapA[ld.stageKey],
          score: ld.score,
          assigneeId: agentsA[ld.assigneeIdx].id,
          sourceId: sourcesA[ld.sourceIdx].id,
          intent: ld.intent,
          temperature: ld.temp,
          primaryChannel: pick([MessageChannel.WHATSAPP, MessageChannel.TELEGRAM, MessageChannel.WEB]),
          createdAt: daysAgo(ld.dayOffset, rand(0, 10)),
          updatedAt: daysAgo(Math.max(0, ld.dayOffset - rand(0, 5)), rand(0, 5)),
        },
      });
      createdLeadsA.push(lead);
    } else {
      createdLeadsA.push(existing);
    }
  }

  // ── Lead Profiles ─────────────────────────────────────
  const profileLeads = createdLeadsA.filter((l) =>
    [LeadStatus.QUALIFIED, LeadStatus.VISIT, LeadStatus.NEGOTIATION, LeadStatus.WON].includes(l.status as LeadStatus)
  );
  for (const lead of profileLeads) {
    const profileExists = await prisma.leadProfile.findUnique({ where: { leadId: lead.id } });
    if (!profileExists) {
      await prisma.leadProfile.create({
        data: {
          tenantId: tenantA.id,
          leadId: lead.id,
          budgetMin: rand(80, 200) * 1000,
          budgetMax: rand(200, 600) * 1000,
          currency: "USD",
          zones: [pick(ZONES), pick(ZONES)],
          propertyType: pick(PROPERTY_TYPES),
          bedroomsMin: rand(1, 2),
          bedroomsMax: rand(3, 5),
          hasGarage: rand(0, 1) === 1,
          timeline: pick(["Inmediato", "1-3 meses", "3-6 meses"]),
        },
      });
    }
  }

  // ── Lead Tags ─────────────────────────────────────────
  const existingLeadTags = await prisma.leadTag.count({ where: { lead: { tenantId: tenantA.id } } });
  if (existingLeadTags === 0) {
    for (const lead of createdLeadsA) {
      const numTags = rand(0, 2);
      const shuffled = [...tagsA].sort(() => Math.random() - 0.5).slice(0, numTags);
      for (const tag of shuffled) {
        await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tag.id } }).catch(() => {});
      }
    }
  }

  // ── Custom Field Values ───────────────────────────────
  const cfValuesExist = await prisma.customFieldValue.count({ where: { lead: { tenantId: tenantA.id } } });
  if (cfValuesExist === 0) {
    const srcOpts = ["Instagram","Google","Recomendación","Cartel","Portal web"];
    const timeOpts = ["Inmediato","1-3 meses","3-6 meses","Más de 6 meses"];
    for (const lead of createdLeadsA.slice(0, 55)) {
      if (rand(0,1) === 1) await prisma.customFieldValue.create({ data: { leadId: lead.id, definitionId: cfSource.id, value: pick(srcOpts) } }).catch(() => {});
      if (rand(0,1) === 1) await prisma.customFieldValue.create({ data: { leadId: lead.id, definitionId: cfTimeline.id, value: pick(timeOpts) } }).catch(() => {});
      if (rand(0,2) === 1) await prisma.customFieldValue.create({ data: { leadId: lead.id, definitionId: cfPreapproved.id, value: pick(["true","false"]) } }).catch(() => {});
    }
  }

  // ── Templates (12) ────────────────────────────────────
  const templatesA = [
    { key: "welcome_wa",      name: "Bienvenida WhatsApp",        ch: "WHATSAPP" as const, content: "¡Hola {{nombre}}! Gracias por contactar a Inmobiliaria Demo A. Un asesor se comunicará pronto con vos. ¿En qué zona estás buscando?" },
    { key: "welcome_tg",      name: "Bienvenida Telegram",        ch: "TELEGRAM" as const, content: "¡Hola {{nombre}}! Recibimos tu consulta, te responderemos a la brevedad." },
    { key: "followup_24h",    name: "Seguimiento 24hs",           ch: "WHATSAPP" as const, content: "Hola {{nombre}}, ¿pudiste revisar las opciones que te enviamos? Estamos para ayudarte con cualquier duda." },
    { key: "followup_72h",    name: "Seguimiento 72hs",           ch: "WHATSAPP" as const, content: "Hola {{nombre}}, ¿tuviste oportunidad de pensarlo? Tenemos nuevas opciones que pueden interesarte." },
    { key: "visit_confirm",   name: "Confirmación de Visita",     ch: "WHATSAPP" as const, content: "Hola {{nombre}}, te confirmamos la visita para el día acordado. ¿Necesitás reprogramar? Avisanos." },
    { key: "visit_reminder",  name: "Recordatorio de Visita",     ch: "WHATSAPP" as const, content: "Hola {{nombre}}, recordatorio: mañana tenemos la visita agendada. Te esperamos. ¿Alguna consulta?" },
    { key: "post_visit",      name: "Post Visita",                ch: "WHATSAPP" as const, content: "Hola {{nombre}}, ¿qué te pareció la propiedad que visitamos? Contanos tu opinión." },
    { key: "price_change",    name: "Cambio de Precio",           ch: "WHATSAPP" as const, content: "¡Hola {{nombre}}! Te avisamos que bajamos el precio de {{propiedad}} a USD {{precio_nuevo}}. ¿Te interesa verla?" },
    { key: "qualified_pack",  name: "Envío de Ficha Calificado",  ch: "WHATSAPP" as const, content: "Hola {{nombre}}, preparé un resumen de las 3 propiedades que mejor se ajustan a lo que buscás. Te las comparto." },
    { key: "won_congrats",    name: "Felicitación Cierre",        ch: "WHATSAPP" as const, content: "¡Felicitaciones {{nombre}}! Fue un placer acompañarte en este proceso. Cualquier consulta estamos. 🎉" },
    { key: "reactivation",    name: "Reactivación Lead Frío",    ch: "WHATSAPP" as const, content: "Hola {{nombre}}, hace un tiempo hablamos. Tenemos nuevas propiedades en {{zona}}. ¿Seguís buscando?" },
    { key: "appointment_req", name: "Solicitud de Cita IA",      ch: "WHATSAPP" as const, content: "Hola {{nombre}}, ¿te gustaría agendar una visita para el próximo jueves o viernes? Tenemos horarios disponibles." },
  ];
  for (const tpl of templatesA) {
    await prisma.template.upsert({
      where: { tenantId_key: { tenantId: tenantA.id, key: tpl.key } },
      update: {},
      create: { tenantId: tenantA.id, key: tpl.key, name: tpl.name, channel: tpl.ch, content: tpl.content, enabled: true },
    });
  }

  // ── Rules (10) ────────────────────────────────────────
  const rulesA = [
    { name: "Auto-asignar lead nuevo (round-robin)",  trigger: "lead.created",    priority: 10, conditions: {},                     actions: [{ type: "assign_round_robin" }] },
    { name: "Bienvenida WhatsApp",                    trigger: "lead.created",    priority: 20, conditions: { channel: "WHATSAPP" }, actions: [{ type: "send_template", templateKey: "welcome_wa" }] },
    { name: "Bienvenida Telegram",                    trigger: "lead.created",    priority: 20, conditions: { channel: "TELEGRAM" }, actions: [{ type: "send_template", templateKey: "welcome_tg" }] },
    { name: "Notificar agente asignado",              trigger: "lead.created",    priority: 30, conditions: {},                     actions: [{ type: "notify" }] },
    { name: "Seguimiento sin respuesta 24h",          trigger: "no_response",     priority: 50, conditions: { hoursElapsed: 24 },   actions: [{ type: "send_template", templateKey: "followup_24h" }] },
    { name: "Seguimiento sin respuesta 72h",          trigger: "no_response",     priority: 55, conditions: { hoursElapsed: 72 },   actions: [{ type: "send_template", templateKey: "followup_72h" }] },
    { name: "IA responde mensaje entrante",           trigger: "message.inbound", priority: 40, conditions: {},                     actions: [{ type: "send_ai_message" }] },
    { name: "Confirmar visita automáticamente",       trigger: "stage.changed",   priority: 60, conditions: { toStage: "VISIT" },   actions: [{ type: "send_template", templateKey: "visit_confirm" }] },
    { name: "Felicitación al cerrar operación",       trigger: "stage.changed",   priority: 60, conditions: { toStage: "WON" },     actions: [{ type: "send_template", templateKey: "won_congrats" }] },
    { name: "Reactivar lead frío a los 30 días",     trigger: "no_response",     priority: 80, conditions: { hoursElapsed: 720 },  actions: [{ type: "send_template", templateKey: "reactivation" }] },
  ];
  for (const rule of rulesA) {
    const existing = await prisma.rule.findFirst({ where: { tenantId: tenantA.id, name: rule.name } });
    if (!existing) {
      await prisma.rule.create({
        data: { tenantId: tenantA.id, name: rule.name, trigger: rule.trigger, priority: rule.priority, conditions: rule.conditions, actions: rule.actions, enabled: true },
      });
    }
  }

  // ── Messages (bulk conversations) ─────────────────────
  const msgsExist = await prisma.message.count({ where: { tenantId: tenantA.id } });
  if (msgsExist === 0) {
    const waConvs = [
      ["Hola, vi la publicación y me interesa la propiedad", "¡Hola! Gracias por contactarnos. ¿Qué zona estás buscando?", "Palermo o Belgrano", "Perfecto, tenemos varias opciones. ¿Qué presupuesto manejás?", "Entre 120 y 180 mil dólares", "Excelente, te armo un listado y te lo envío en breve."],
      ["Buenas tardes, busco casa con jardín para mi familia", "¡Hola! ¿Cuántos dormitorios necesitás?", "4 ambientes mínimo, y que tenga cochera", "Tenemos opciones en Belgrano y Saavedra. ¿Podés esta semana para una visita?", "El miércoles a la tarde me viene bien", "Perfecto, te agendo. Te confirmo la dirección mañana."],
      ["Quiero invertir en un depto para alquilar", "¡Hola! Muy buena decisión. ¿Tenés presupuesto definido?", "Hasta 150k USD", "Para ese presupuesto hay excelentes opciones en Caballito y Almagro.", "¿Cuál da mejor rentabilidad?", "Caballito tiene ~5% anual. Te comparto dos fichas.", "Genial, me interesa verlos"],
      ["Hola! Vieron mi consulta del formulario?", "¡Sí! Tu consulta llegó perfectamente. ¿Hablás ahora?", "Dale, el lote de Pilar tiene servicios?", "Sí, todos: luz, agua, gas y cloacas.", "Y cómo es el acceso?", "A 5 minutos de la autopista. ¿Coordinamos una visita?"],
      ["Me avisaron de un cambio de precio?", "¡Hola! Sí, bajamos el depto de Palermo de USD 155k a USD 145k.", "Perfecto! ¿Sigue disponible?", "Sí, aún no hay reserva.", "Quiero reservarlo. ¿Qué necesitan?", "Seña del 10% y DNI. Te paso los datos."],
      ["Buenos días, busco alquiler en Caballito", "¡Hola! Tenemos varios en Caballito. ¿Cuántos ambientes?", "2 ambientes, para una persona sola", "Perfecto. ¿Hasta cuánto de alquiler mensual?", "Hasta $400.000/mes", "Tengo 3 opciones en ese rango. ¿Las vemos?"],
      ["Consulta por el chalet de San Isidro", "¡Hola! Es una propiedad espectacular. ¿Es para uso propio?", "Sí, buscamos casa familiar grande", "Son 450m² con pileta y quincho. ¿Podés el fin de semana para visitar?", "El sábado a las 11 perfecto", "Anotado. Nos vemos el sábado."],
    ];
    const tgConvs = [
      ["Hola busco oficina en microcentro", "¡Hola! Tenemos varias. ¿Para cuántas personas?", "3-4 personas, con sala de reuniones", "Tenemos una excelente de 80m² con sala. ¿La vemos?"],
      ["Consulta por el galpón en Avellaneda", "¡Hola! Son 800m² cubiertos. ¿Qué necesitás para tu empresa?", "Puerta para camión y patio de maniobra", "Sí, tiene acceso de 4m de altura y patio.", "Cuánto es el alquiler?", "ARS 1.200.000/mes + expensas."],
    ];

    for (let i = 0; i < createdLeadsA.length; i++) {
      const lead = createdLeadsA[i];
      if (!lead) continue;
      const isTg = i % 7 === 0;
      const ch = isTg ? MessageChannel.TELEGRAM : MessageChannel.WHATSAPP;
      const conv = isTg ? pick(tgConvs) : pick(waConvs);
      const dOff = rand(0, 20);
      for (let mi = 0; mi < conv.length; mi++) {
        const isIn = mi % 2 === 0;
        await prisma.message.create({
          data: {
            tenantId: tenantA.id,
            leadId: lead.id,
            direction: isIn ? MessageDirection.IN : MessageDirection.OUT,
            channel: ch,
            from: isIn ? (lead.phone ?? "+5491100000000") : undefined,
            to: !isIn ? (lead.phone ?? "+5491100000000") : undefined,
            content: conv[mi],
            createdAt: daysAgo(dOff, (conv.length - mi) * 0.5),
          },
        });
      }
    }
  }

  // ── Visits (30) ───────────────────────────────────────
  const visitsExist = await prisma.visit.count({ where: { tenantId: tenantA.id } });
  if (visitsExist === 0) {
    const visitLeads = createdLeadsA.filter((l) =>
      [LeadStatus.VISIT, LeadStatus.NEGOTIATION, LeadStatus.WON, LeadStatus.LOST].includes(l.status as LeadStatus)
    );
    const vStatuses: VisitStatus[] = [VisitStatus.COMPLETED, VisitStatus.COMPLETED, VisitStatus.COMPLETED, VisitStatus.SCHEDULED, VisitStatus.CONFIRMED, VisitStatus.NO_SHOW, VisitStatus.CANCELLED];
    const visitNotes = ["El cliente quedó muy interesado","Necesita pensarlo","Quiere ver otra opción","Preguntó sobre financiación","Le gustó pero el precio es alto","Excelente visita, hará oferta","No se presentó sin aviso"];
    for (let i = 0; i < 30; i++) {
      const lead = visitLeads[i % Math.max(visitLeads.length, 1)];
      if (!lead) continue;
      const propId = createdPropertiesA[i % createdPropertiesA.length];
      const dOff = rand(0, 45);
      const vDate = daysAgo(dOff);
      vDate.setUTCHours(rand(10, 19), rand(0, 3) * 15, 0, 0); // 7-16h Uruguay (UTC-3)
      await prisma.visit.create({
        data: {
          tenantId: tenantA.id,
          leadId: lead.id,
          propertyId: propId,
          agentId: pick(agentsA).id,
          date: vDate,
          endDate: new Date(vDate.getTime() + 3600000),
          status: pick(vStatuses),
          notes: rand(0,1) === 1 ? pick(visitNotes) : null,
          address: `${pick(ZONES)} ${rand(100, 9999)}`,
          createdAt: daysAgo(dOff + 1),
        },
      });
    }
  }

  // ── Agent Goals (3 months) ────────────────────────────
  const months = ["2026-02", "2026-03", "2026-04"];
  for (const agent of agentsA) {
    for (const month of months) {
      await prisma.agentGoal.upsert({
        where: { tenantId_userId_month: { tenantId: tenantA.id, userId: agent.id, month } },
        update: {},
        create: { tenantId: tenantA.id, userId: agent.id, month, leadsTarget: rand(20, 40), visitsTarget: rand(8, 15), wonTarget: rand(3, 8) },
      });
    }
  }

  // ── Agent Availability ────────────────────────────────
  for (const agent of agentsA) {
    for (const day of [1, 2, 3, 4, 5]) {
      await prisma.agentAvailability.upsert({
        where: { userId_dayOfWeek: { userId: agent.id, dayOfWeek: day } },
        update: {},
        create: { tenantId: tenantA.id, userId: agent.id, dayOfWeek: day, startTime: "09:00", endTime: "18:00", active: true },
      });
    }
    await prisma.agentAvailability.upsert({
      where: { userId_dayOfWeek: { userId: agent.id, dayOfWeek: 6 } },
      update: {},
      create: { tenantId: tenantA.id, userId: agent.id, dayOfWeek: 6, startTime: "09:00", endTime: "13:00", active: true },
    });
  }

  // ── Commission Rules ──────────────────────────────────
  const commOpTypes: OperationType[] = [OperationType.SALE, OperationType.RENT, OperationType.RENT_TEMPORARY];
  const commPcts = [3.5, 5.0, 8.0];
  for (let i = 0; i < commOpTypes.length; i++) {
    await prisma.commissionRule.upsert({
      where: { tenantId_operationType: { tenantId: tenantA.id, operationType: commOpTypes[i] } },
      update: {},
      create: { tenantId: tenantA.id, operationType: commOpTypes[i], percentage: commPcts[i], splitAgentPct: 60, splitBizPct: 40, enabled: true },
    });
  }

  // ── Commissions (WON leads) ───────────────────────────
  const commissionsExist = await prisma.commission.count({ where: { tenantId: tenantA.id } });
  if (commissionsExist === 0) {
    const wonLeads = createdLeadsA.filter((l) => l.status === LeadStatus.WON);
    for (let i = 0; i < wonLeads.length; i++) {
      const lead = wonLeads[i];
      const dealAmount = rand(100, 500) * 1000;
      const pct = 3.5;
      const total = Math.round(dealAmount * pct / 100);
      const agentAmt = Math.round(total * 0.6);
      await prisma.commission.create({
        data: {
          tenantId: tenantA.id,
          agentId: pick(agentsA).id,
          leadId: lead.id,
          propertyId: createdPropertiesA[i % createdPropertiesA.length],
          operationType: OperationType.SALE,
          dealAmount,
          commissionPct: pct,
          commissionTotal: total,
          agentPct: 60,
          agentAmount: agentAmt,
          bizAmount: total - agentAmt,
          status: pick([CommissionStatus.PENDING, CommissionStatus.APPROVED, CommissionStatus.PAID]),
          paidAt: rand(0,1) === 1 ? daysAgo(rand(1,20)) : null,
          notes: "Comisión generada automáticamente desde seed",
          createdAt: daysAgo(rand(1, 30)),
        },
      });
    }
  }

  // ── Follow-Up Sequences ───────────────────────────────
  const seqExists = await prisma.followUpSequence.findFirst({ where: { tenantId: tenantA.id } });
  let seq1Id: string | null = null;
  if (!seqExists) {
    const seq1 = await prisma.followUpSequence.create({
      data: {
        tenantId: tenantA.id,
        name: "Secuencia bienvenida nuevo lead",
        enabled: true,
        trigger: "lead_created",
        steps: {
          create: [
            { order: 1, delayHours: 1,   channel: "WHATSAPP", content: "¡Hola {{nombre}}! Gracias por contactarnos. ¿Podemos ayudarte a encontrar tu propiedad ideal?" },
            { order: 2, delayHours: 24,  channel: "WHATSAPP", content: "Hola {{nombre}}, seguimos atentos a tu consulta. ¿Tuviste tiempo de revisar las opciones?" },
            { order: 3, delayHours: 72,  channel: "WHATSAPP", content: "Hola {{nombre}}, tenemos nuevas propiedades que se ajustan a lo que buscás. ¿Las vemos?" },
            { order: 4, delayHours: 168, channel: "WHATSAPP", content: "Hola {{nombre}}, última consulta — ¿seguís buscando? Tenemos buenas noticias del mercado." },
          ],
        },
      },
    });
    seq1Id = seq1.id;
    await prisma.followUpSequence.create({
      data: {
        tenantId: tenantA.id,
        name: "Secuencia post-visita",
        enabled: true,
        trigger: "stage_changed",
        steps: {
          create: [
            { order: 1, delayHours: 4,   channel: "WHATSAPP", content: "Hola {{nombre}}, ¿qué te pareció la propiedad? Contanos tu opinión." },
            { order: 2, delayHours: 48,  channel: "WHATSAPP", content: "Hola {{nombre}}, ¿estuviste pensando en lo que vimos? Podemos coordinar otra visita." },
            { order: 3, delayHours: 120, channel: "WHATSAPP", content: "Hola {{nombre}}, el propietario está abierto a negociar. ¿Hay algo que te frenó?" },
          ],
        },
      },
    });
    await prisma.followUpSequence.create({
      data: {
        tenantId: tenantA.id,
        name: "Reactivación leads fríos",
        enabled: true,
        trigger: "manual",
        steps: {
          create: [
            { order: 1, delayHours: 0,  channel: "WHATSAPP", content: "Hola {{nombre}}, te escribimos porque tenemos novedades en {{zona}} que pueden interesarte." },
            { order: 2, delayHours: 72, channel: "WHATSAPP", content: "Hola {{nombre}}, bajamos el precio de algunas propiedades. ¿Querés que te cuente?" },
          ],
        },
      },
    });
  } else {
    seq1Id = seqExists.id;
  }

  // ── Follow-Up Runs ────────────────────────────────────
  const runsExist = await prisma.followUpRun.count({ where: { tenantId: tenantA.id } });
  if (runsExist === 0 && seq1Id) {
    for (let i = 0; i < 20 && i < createdLeadsA.length; i++) {
      await prisma.followUpRun.create({
        data: {
          tenantId: tenantA.id,
          sequenceId: seq1Id,
          leadId: createdLeadsA[i].id,
          currentStep: rand(1, 4),
          status: pick(["ACTIVE", "ACTIVE", "COMPLETED", "PAUSED"]),
          nextRunAt: rand(0,1) === 1 ? new Date(Date.now() + rand(1,5) * 86400000) : null,
          createdAt: daysAgo(rand(1, 30)),
        },
      });
    }
  }

  // ── Tickets ───────────────────────────────────────────
  const ticketsExist = await prisma.ticket.count({ where: { tenantId: tenantA.id } });
  if (ticketsExist === 0) {
    const ticketData = [
      { title: "No puedo conectar WhatsApp Business",    desc: "Intenté varias veces y da error de QR.",             status: TicketStatus.IN_PROGRESS, priority: TicketPriority.HIGH,   note: "Revisando con Evolution API." },
      { title: "Error al importar leads desde Excel",    desc: "El CSV importa solo 10 de 50 registros.",            status: TicketStatus.RESOLVED,    priority: TicketPriority.MEDIUM, note: "Corregido en v2.3.1" },
      { title: "La regla de bienvenida no se dispara",   desc: "Creé la regla pero nuevos leads no la reciben.",     status: TicketStatus.PENDING,     priority: TicketPriority.HIGH,   note: null },
      { title: "Solicito acceso para nuevo agente",      desc: "Necesito dar de alta a Marcelo Vázquez.",            status: TicketStatus.CLOSED,      priority: TicketPriority.LOW,    note: "Usuario creado." },
      { title: "Dashboard no carga reportes de comisiones", desc: "Pantalla en blanco al entrar a reportes.",        status: TicketStatus.IN_PROGRESS, priority: TicketPriority.MEDIUM, note: "Bug identificado, fix en progreso." },
      { title: "Necesito exportar todos los leads a CSV", desc: "¿Hay opción de exportar?",                          status: TicketStatus.CLOSED,      priority: TicketPriority.LOW,    note: "Se explicó cómo usar el botón de export." },
    ];
    for (const t of ticketData) {
      await prisma.ticket.create({
        data: {
          tenantId: tenantA.id,
          creatorId: pick([agentA1.id, agentA2.id, agentA3.id, adminA.id]),
          title: t.title,
          description: t.desc,
          status: t.status,
          priority: t.priority,
          adminNote: t.note,
          createdAt: daysAgo(rand(1, 60)),
        },
      });
    }
  }

  // ── Broadcast Batches ─────────────────────────────────
  const broadcastsExist = await prisma.broadcastBatch.count({ where: { tenantId: tenantA.id } });
  if (broadcastsExist === 0) {
    const batch1 = await prisma.broadcastBatch.create({
      data: {
        tenantId: tenantA.id,
        type: "PRICE_CHANGE",
        title: "Baja de precio — Depto Palermo",
        message: "¡Hola {nombre}! El depto en Palermo que consultaste bajó de USD 155k a USD 145k. ¿Te interesa verlo ahora?",
        metadata: { oldPrice: 155000, newPrice: 145000, propertyTitle: "Departamento 2 amb. en Palermo Soho" },
        status: BroadcastStatus.DONE,
        autoApproveStageIds: [stageMapA["VISIT"], stageMapA["NEGOTIATION"]],
        autoSend: true,
        createdBy: adminA.id,
        createdAt: daysAgo(15),
      },
    });
    const batch2 = await prisma.broadcastBatch.create({
      data: {
        tenantId: tenantA.id,
        type: "ANNOUNCEMENT",
        title: "Nueva propiedad en San Isidro",
        message: "¡Hola {nombre}! Tenemos una nueva propiedad exclusiva en San Isidro. ¿Querés los detalles?",
        metadata: { propertyTitle: "Chalet 5 amb. en San Isidro" },
        status: BroadcastStatus.SENDING,
        autoApproveStageIds: [],
        autoSend: false,
        createdBy: adminA.id,
        createdAt: daysAgo(2),
      },
    });
    const contactedLeads = createdLeadsA.filter((l) => l.status !== LeadStatus.NEW).slice(0, 25);
    for (const lead of contactedLeads) {
      await prisma.broadcastItem.create({
        data: {
          batchId: batch1.id,
          leadId: lead.id,
          status: pick([BroadcastItemStatus.SENT, BroadcastItemStatus.SENT, BroadcastItemStatus.FAILED]),
          sentAt: daysAgo(14, rand(0, 10)),
          message: `¡Hola ${lead.name?.split(" ")[0]}! El depto en Palermo bajó a USD 145k. ¿Te interesa?`,
        },
      }).catch(() => {});
    }
    for (const lead of createdLeadsA.slice(0, 40)) {
      await prisma.broadcastItem.create({
        data: {
          batchId: batch2.id,
          leadId: lead.id,
          status: pick([BroadcastItemStatus.PENDING, BroadcastItemStatus.APPROVED, BroadcastItemStatus.SENT]),
        },
      }).catch(() => {});
    }
  }

  // ── Event Logs (50+) ──────────────────────────────────
  const eventsExist = await prisma.eventLog.count({ where: { tenantId: tenantA.id } });
  if (eventsExist === 0) {
    const rows = [
      ...createdLeadsA.slice(0, 20).map((l) => ({ type: EventType.lead_created,    entity: "Lead",    message: `Lead creado: ${l.name}`,                       dOff: rand(0,30) })),
      ...createdLeadsA.slice(5, 25).map((l) => ({ type: EventType.message_inbound, entity: "Lead",    message: `Mensaje entrante de ${l.name} por WhatsApp`,    dOff: rand(0,20) })),
      ...createdLeadsA.slice(3, 18).map((l) => ({ type: EventType.message_sent,    entity: "Lead",    message: `Respuesta automática enviada a ${l.name}`,       dOff: rand(0,20) })),
      ...createdLeadsA.filter(l => l.status !== LeadStatus.NEW).slice(0,15).map((l) => ({ type: EventType.lead_updated, entity: "Lead", message: `${l.name} → etapa actualizada`, dOff: rand(0,25) })),
      ...createdLeadsA.filter(l => l.status === LeadStatus.WON).map((l) => ({ type: EventType.lead_updated, entity: "Lead", message: `${l.name} → WON ✅`, dOff: rand(1,30) })),
      ...[1,2,3,4,5,6,7,8,9,10].map((i) => ({ type: EventType.workflow_executed, entity: "Rule", message: `Regla automática ejecutada #${i}`, dOff: rand(0,10) })),
      { type: EventType.channel_connected,    entity: "Channel",   message: "Canal WhatsApp conectado (Lucía Torres)",       dOff: 45 },
      { type: EventType.channel_connected,    entity: "Channel",   message: "Canal WhatsApp conectado (Martín Ruiz)",        dOff: 40 },
      { type: EventType.channel_connected,    entity: "Channel",   message: "Canal Telegram conectado (Gabriela Sosa)",      dOff: 30 },
      { type: EventType.template_created,     entity: "Template",  message: "Plantilla 'Bienvenida WhatsApp' creada",        dOff: 50 },
      { type: EventType.rule_created,         entity: "Rule",      message: "Regla 'IA responde mensaje' creada",             dOff: 48 },
      { type: EventType.rule_created,         entity: "Rule",      message: "Regla 'Auto-asignar (round-robin)' creada",      dOff: 50 },
      { type: EventType.workflow_failed,      entity: "Rule",      message: "Regla 'Bienvenida WhatsApp' falló — sin canal",  dOff: 2  },
      { type: EventType.provider_error,       entity: "Channel",   message: "Error Evolution API: timeout al enviar mensaje", dOff: 1  },
    ];
    await prisma.eventLog.createMany({
      data: rows.map((e) => ({
        tenantId: tenantA.id,
        type: e.type,
        entity: e.entity,
        message: e.message,
        createdAt: daysAgo(e.dOff, Math.random() * 10),
      })),
    });
  }

  // ── Notifications ─────────────────────────────────────
  const notifExist = await prisma.notification.count({ where: { tenantId: tenantA.id } });
  if (notifExist === 0) {
    const notifRows = [
      ...createdLeadsA.slice(0, 10).map((l, i) => ({ userId: agentsA[i % agentsA.length].id, type: "lead_assigned",  title: "Nuevo lead asignado",   message: `Se te asignó el lead ${l.name}`,              entityId: l.id, read: i > 4  })),
      ...createdLeadsA.slice(0, 8).map((l, i)  => ({ userId: agentsA[i % agentsA.length].id, type: "message_inbound", title: "Nuevo mensaje",          message: `${l.name} envió un mensaje por WhatsApp`,     entityId: l.id, read: i > 3  })),
      ...createdLeadsA.filter(l => l.status === LeadStatus.WON).map((l,i) => ({ userId: agentsA[i % agentsA.length].id, type: "stage_changed", title: "Lead ganado 🎉", message: `${l.name} cerró la operación`, entityId: l.id, read: true })),
      ...createdLeadsA.filter(l => l.status === LeadStatus.VISIT).slice(0,5).map((l,i) => ({ userId: agentsA[i % agentsA.length].id, type: "stage_changed", title: "Visita agendada", message: `${l.name} pasó a etapa Visita`, entityId: l.id, read: false })),
    ];
    await prisma.notification.createMany({
      data: notifRows.map((n) => ({
        tenantId: tenantA.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        entity: "lead",
        entityId: n.entityId,
        read: n.read,
      })),
    });
  }

  // ── AI Config ─────────────────────────────────────────
  const aiExists = await prisma.aiConfig.findFirst({ where: { tenantId: tenantA.id } });
  if (!aiExists) {
    await prisma.aiConfig.create({
      data: {
        tenantId: tenantA.id,
        provider: "OPENAI",
        apiKey: "sk-demo-key-placeholder",
        model: "gpt-4o",
        enabled: false,
        systemPrompt: "Eres un asistente de ventas inmobiliarias amigable y profesional para Inmobiliaria Demo A. Tu objetivo es entender qué propiedad busca el cliente y agendar una visita. Sé breve, cordial y en español rioplatense.",
        temperature: 0.7,
        maxTokens: 512,
      },
    });
  }

  // ══════════════════════════════════════════════════════
  // TENANT B — Modest demo (Starter)
  // ══════════════════════════════════════════════════════

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantB.id, email: "admin@demob.com" } },
    update: { passwordHash: pwHash, isActive: true },
    create: { tenantId: tenantB.id, email: "admin@demob.com", passwordHash: pwHash, isActive: true, role: UserRole.BUSINESS, name: "Admin B" },
  });
  const agentB = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantB.id, email: "agent@demob.com" } },
    update: { passwordHash: pwHash },
    create: { tenantId: tenantB.id, email: "agent@demob.com", passwordHash: pwHash, role: UserRole.AGENT, name: "Agente B" },
  });

  const stageMapB: Record<string, string> = {};
  for (const stage of DEFAULT_STAGES) {
    const s = await prisma.leadStage.upsert({
      where: { tenantId_key: { tenantId: tenantB.id, key: stage.key } },
      update: {},
      create: { tenantId: tenantB.id, key: stage.key, name: stage.name, order: stage.order, isDefault: stage.isDefault ?? false },
    });
    stageMapB[stage.key] = s.id;
  }

  await prisma.domain.upsert({
    where: { host: "demob.tuplataforma.com" },
    update: {},
    create: { tenantId: tenantB.id, host: "demob.tuplataforma.com", isPrimary: true },
  });

  const leadsB = [
    { name: "Julia Díaz",     email: "julia@exampleb.com",   phone: "+5491166660001", status: LeadStatus.NEW,         stageKey: "NEW",         score: 10  },
    { name: "Marcos Pérez",   email: "marcos@exampleb.com",  phone: "+5491166660002", status: LeadStatus.CONTACTED,   stageKey: "CONTACTED",   score: 30  },
    { name: "Lucía Romero",   email: "luciab@exampleb.com",  phone: "+5491166660003", status: LeadStatus.QUALIFIED,   stageKey: "QUALIFIED",   score: 55  },
    { name: "Pablo Herrera",  email: "pablo@exampleb.com",   phone: "+5491166660004", status: LeadStatus.WON,         stageKey: "WON",         score: 100 },
    { name: "Rocío Blanco",   email: "rocio@exampleb.com",   phone: "+5491166660005", status: LeadStatus.NEW,         stageKey: "NEW",         score: 5   },
    { name: "Andrés Silva",   email: "andres@exampleb.com",  phone: "+5491166660006", status: LeadStatus.VISIT,       stageKey: "VISIT",       score: 72  },
    { name: "Cecilia Moreno", email: "cecilia@exampleb.com", phone: "+5491166660007", status: LeadStatus.NEGOTIATION, stageKey: "NEGOTIATION", score: 88  },
    { name: "Tomás Vargas",   email: "tomasb@exampleb.com",  phone: "+5491166660008", status: LeadStatus.LOST,        stageKey: "LOST",        score: 15  },
  ];
  for (const ld of leadsB) {
    const existing = await prisma.lead.findFirst({ where: { tenantId: tenantB.id, email: ld.email } });
    if (!existing) {
      await prisma.lead.create({
        data: {
          tenantId: tenantB.id, name: ld.name, email: ld.email, phone: ld.phone,
          status: ld.status, stageId: stageMapB[ld.stageKey], score: ld.score,
          assigneeId: agentB.id, createdAt: daysAgo(rand(1, 60)),
        },
      });
    }
  }

  for (const tpl of [
    { key: "welcome_wa_b", name: "Bienvenida WhatsApp", ch: "WHATSAPP" as const, content: "¡Hola {{nombre}}! Gracias por contactarnos." },
    { key: "welcome_tg_b", name: "Bienvenida Telegram", ch: "TELEGRAM" as const, content: "¡Hola {{nombre}}! Te respondemos a la brevedad." },
    { key: "followup_b",   name: "Seguimiento 24hs",    ch: "WHATSAPP" as const, content: "Hola {{nombre}}, ¿hay algo más que podamos hacer por vos?" },
  ]) {
    await prisma.template.upsert({
      where: { tenantId_key: { tenantId: tenantB.id, key: tpl.key } },
      update: {},
      create: { tenantId: tenantB.id, key: tpl.key, name: tpl.name, channel: tpl.ch, content: tpl.content, enabled: true },
    });
  }

  // ═══════════════════════════════════════════════════
  console.log("✅ Seed completo!");
  console.log("");
  console.log("   Super Admin → admin@inmoflow.com / password123");
  console.log("");
  console.log("   Tenant A (PROFESSIONAL):");
  console.log("     → admin@demoa.com   / password123  (BUSINESS)");
  console.log("     → agent@demoa.com   / password123  (AGENT - Lucía Torres)");
  console.log("     → agent2@demoa.com  / password123  (AGENT - Martín Ruiz)");
  console.log("     → agent3@demoa.com  / password123  (AGENT - Gabriela Sosa)");
  console.log("     → viewer@demoa.com  / password123  (VIEWER)");
  console.log("     → 80 leads (all stages), 20 propiedades, 12 templates, 10 reglas");
  console.log("     → 30 visitas, 8 tags, 3 campos custom, perfiles de lead");
  console.log("     → comisiones, metas mensuales x3, disponibilidad semanal");
  console.log("     → 3 secuencias follow-up + 20 runs, 6 tickets, 2 difusiones");
  console.log("     → 60+ event logs, 35+ notificaciones, 400+ mensajes");
  console.log("     → AI config, commission rules x3");
  console.log("");
  console.log("   Tenant B (STARTER):");
  console.log("     → admin@demob.com  / password123  (BUSINESS)");
  console.log("     → agent@demob.com  / password123  (AGENT)");
  console.log("     → 8 leads, 3 templates");
}

main()
  .catch((e) => {
    console.error("❌ Seed falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
