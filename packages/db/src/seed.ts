import {
  PrismaClient,
  UserRole,
  LeadStatus,
  LeadSourceType,
  EventType,
  MessageDirection,
  MessageChannel,
  Plan,
} from "@prisma/client";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hashSync(password, 10);
}

const DEFAULT_STAGES = [
  { key: "NEW", name: "Nuevo", order: 0, isDefault: true },
  { key: "CONTACTED", name: "Contactado", order: 1 },
  { key: "QUALIFIED", name: "Calificado", order: 2 },
  { key: "VISIT", name: "Visita", order: 3 },
  { key: "NEGOTIATION", name: "Negociación", order: 4 },
  { key: "WON", name: "Ganado", order: 5 },
  { key: "LOST", name: "Perdido", order: 6 },
];

// ─── Helper: date offset from now ────────────────────
function daysAgo(days: number, hoursOffset = 0): Date {
  return new Date(Date.now() - days * 86400000 - hoursOffset * 3600000);
}

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Tenant A (PROFESSIONAL — main demo) ──────────
  const tenantA = await prisma.tenant.upsert({
    where: { id: "tenant-a-seed-id" },
    update: { plan: Plan.PROFESSIONAL },
    create: {
      id: "tenant-a-seed-id",
      name: "Inmobiliaria Demo A",
      plan: Plan.PROFESSIONAL,
    },
  });

  // ─── Tenant B (STARTER) ────────────────────────────
  const tenantB = await prisma.tenant.upsert({
    where: { id: "tenant-b-seed-id" },
    update: { plan: Plan.STARTER },
    create: {
      id: "tenant-b-seed-id",
      name: "Inmobiliaria Demo B",
      plan: Plan.STARTER,
    },
  });

  const pwHash = await hashPassword("password123");

  // ─── Super-Admin ───────────────────────────────────
  await prisma.user.upsert({
    where: { id: "super-admin-seed-id" },
    update: {},
    create: {
      id: "super-admin-seed-id",
      tenantId: null,
      email: "admin@inmoflow.com",
      passwordHash: pwHash,
      role: UserRole.ADMIN,
      name: "Super Admin",
    },
  });

  // ══════════════════════════════════════════════════════
  // TENANT A — Rich demo data
  // ══════════════════════════════════════════════════════

  // ─── Users ─────────────────────────────────────────
  const adminA = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "admin@demoa.com" } },
    update: {},
    create: { tenantId: tenantA.id, email: "admin@demoa.com", passwordHash: pwHash, role: UserRole.BUSINESS, name: "Admin A" },
  });

  const agentA1 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "agent@demoa.com" } },
    update: {},
    create: { tenantId: tenantA.id, email: "agent@demoa.com", passwordHash: pwHash, role: UserRole.AGENT, name: "Lucía Torres" },
  });

  const agentA2 = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "agent2@demoa.com" } },
    update: {},
    create: { tenantId: tenantA.id, email: "agent2@demoa.com", passwordHash: pwHash, role: UserRole.AGENT, name: "Martín Ruiz" },
  });

  const viewerA = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantA.id, email: "viewer@demoa.com" } },
    update: {},
    create: { tenantId: tenantA.id, email: "viewer@demoa.com", passwordHash: pwHash, role: UserRole.VIEWER, name: "Carlos Méndez" },
  });

  // ─── Default stages ────────────────────────────────
  const stageMapA: Record<string, string> = {};
  for (const stage of DEFAULT_STAGES) {
    const s = await prisma.leadStage.upsert({
      where: { tenantId_key: { tenantId: tenantA.id, key: stage.key } },
      update: {},
      create: { tenantId: tenantA.id, key: stage.key, name: stage.name, order: stage.order, isDefault: stage.isDefault ?? false },
    });
    stageMapA[stage.key] = s.id;
  }

  // ─── Domain ────────────────────────────────────────
  await prisma.domain.upsert({
    where: { host: "demoa.tuplataforma.com" },
    update: {},
    create: { tenantId: tenantA.id, host: "demoa.tuplataforma.com", isPrimary: true },
  });

  // ─── Lead Sources ──────────────────────────────────
  const srcManualA = await upsertLeadSource(tenantA.id, "Manual", LeadSourceType.MANUAL);
  const srcWebA = await upsertLeadSource(tenantA.id, "Formulario Web", LeadSourceType.WEB_FORM, "contact-form-a");
  const srcWhatsAppA = await upsertLeadSource(tenantA.id, "WhatsApp Entrante", LeadSourceType.WHATSAPP_INBOUND);
  const srcFacebookA = await upsertLeadSource(tenantA.id, "Facebook Lead Ads", LeadSourceType.META_LEAD_AD);
  const srcTelegramA = await upsertLeadSource(tenantA.id, "Telegram", LeadSourceType.TELEGRAM_INBOUND);

  // ─── 24 Sample Leads for Tenant A ──────────────────
  const leadsDataA = [
    // ── NEW (5) ────────────────────────────────────────
    { name: "María García", email: "maria@example.com", phone: "+5491155550001", status: LeadStatus.NEW, stageKey: "NEW", score: 15, assignee: agentA1.id, source: srcWhatsAppA, intent: "Busca depto 2amb en Palermo", dayOffset: 0, hour: 2 },
    { name: "Roberto Sánchez", email: "roberto@example.com", phone: "+5491155550002", status: LeadStatus.NEW, stageKey: "NEW", score: 10, assignee: agentA2.id, source: srcWebA, intent: "Interesado en casas zona norte", dayOffset: 0, hour: 5 },
    { name: "Valentina Perez", email: "valentina@example.com", phone: "+5491155550003", status: LeadStatus.NEW, stageKey: "NEW", score: 5, assignee: agentA1.id, source: srcFacebookA, intent: "Consulta general", dayOffset: 1, hour: 3 },
    { name: "Diego Morales", email: "diego@example.com", phone: "+5491155550004", status: LeadStatus.NEW, stageKey: "NEW", score: 20, assignee: agentA2.id, source: srcTelegramA, intent: "Busca oficina en microcentro", dayOffset: 1, hour: 8 },
    { name: "Camila Ortiz", email: "camila@example.com", phone: "+5491155550005", status: LeadStatus.NEW, stageKey: "NEW", score: 8, assignee: agentA1.id, source: srcWhatsAppA, intent: null, dayOffset: 2, hour: 1 },
    // ── CONTACTED (4) ──────────────────────────────────
    { name: "Carlos López", email: "carlos@example.com", phone: "+5491155550010", status: LeadStatus.CONTACTED, stageKey: "CONTACTED", score: 30, assignee: agentA1.id, source: srcManualA, intent: "Busca PH en Belgrano", dayOffset: 3, hour: 4 },
    { name: "Ana Martínez", email: "ana@example.com", phone: "+5491155550011", status: LeadStatus.CONTACTED, stageKey: "CONTACTED", score: 35, assignee: agentA2.id, source: srcWhatsAppA, intent: "Interesada en lotes en Pilar", dayOffset: 4, hour: 6 },
    { name: "Fernando Gómez", email: "fernando@example.com", phone: "+5491155550012", status: LeadStatus.CONTACTED, stageKey: "CONTACTED", score: 25, assignee: agentA1.id, source: srcWebA, intent: "Busca alquiler temporal", dayOffset: 5, hour: 2 },
    { name: "Sofía Luna", email: "sofia@example.com", phone: "+5491155550013", status: LeadStatus.CONTACTED, stageKey: "CONTACTED", score: 40, assignee: agentA2.id, source: srcFacebookA, intent: "Inversión en pozo", dayOffset: 5, hour: 9 },
    // ── QUALIFIED (4) ──────────────────────────────────
    { name: "Pedro Rodríguez", email: "pedro@example.com", phone: "+5491155550020", status: LeadStatus.QUALIFIED, stageKey: "QUALIFIED", score: 60, assignee: agentA1.id, source: srcManualA, intent: "Compra casa 4amb USD 250k", dayOffset: 7, hour: 3 },
    { name: "Laura Fernández", email: "laura@example.com", phone: "+5491155550021", status: LeadStatus.QUALIFIED, stageKey: "QUALIFIED", score: 55, assignee: agentA2.id, source: srcWhatsAppA, intent: "Busca depto 3amb en Recoleta", dayOffset: 8, hour: 5 },
    { name: "Nicolás Acosta", email: "nicolas@example.com", phone: "+5491155550022", status: LeadStatus.QUALIFIED, stageKey: "QUALIFIED", score: 70, assignee: agentA1.id, source: srcWebA, intent: "Inversión Airbnb zona turística", dayOffset: 9, hour: 7 },
    { name: "Isabella Moreno", email: "isabella@example.com", phone: "+5491155550023", status: LeadStatus.QUALIFIED, stageKey: "QUALIFIED", score: 50, assignee: agentA2.id, source: srcFacebookA, intent: "Primera vivienda, matrimonio joven", dayOffset: 10, hour: 1 },
    // ── VISIT (3) ──────────────────────────────────────
    { name: "Mateo Herrera", email: "mateo@example.com", phone: "+5491155550030", status: LeadStatus.VISIT, stageKey: "VISIT", score: 75, assignee: agentA1.id, source: srcManualA, intent: "Visita programada lunes", dayOffset: 10, hour: 4 },
    { name: "Julieta Romero", email: "julieta@example.com", phone: "+5491155550031", status: LeadStatus.VISIT, stageKey: "VISIT", score: 80, assignee: agentA2.id, source: srcWhatsAppA, intent: "Visitó 2 deptos, muy interesada", dayOffset: 12, hour: 6 },
    { name: "Tomás Díaz", email: "tomas@example.com", phone: "+5491155550032", status: LeadStatus.VISIT, stageKey: "VISIT", score: 70, assignee: agentA1.id, source: srcTelegramA, intent: "Quiere ver casa en Tigre", dayOffset: 11, hour: 2 },
    // ── NEGOTIATION (2) ────────────────────────────────
    { name: "Agustín Vega", email: "agustin@example.com", phone: "+5491155550040", status: LeadStatus.NEGOTIATION, stageKey: "NEGOTIATION", score: 90, assignee: agentA1.id, source: srcWebA, intent: "Oferta USD 180k depto Palermo", dayOffset: 14, hour: 3 },
    { name: "Milagros Castro", email: "milagros@example.com", phone: "+5491155550041", status: LeadStatus.NEGOTIATION, stageKey: "NEGOTIATION", score: 85, assignee: agentA2.id, source: srcManualA, intent: "Negociando casa Nordelta", dayOffset: 13, hour: 5 },
    // ── WON (4) ────────────────────────────────────────
    { name: "Santiago Ruiz", email: "santiago@example.com", phone: "+5491155550050", status: LeadStatus.WON, stageKey: "WON", score: 100, assignee: agentA1.id, source: srcWhatsAppA, intent: "Cerrado - Depto Belgrano USD 195k", dayOffset: 20, hour: 2 },
    { name: "Florencia Paz", email: "florencia@example.com", phone: "+5491155550051", status: LeadStatus.WON, stageKey: "WON", score: 100, assignee: agentA2.id, source: srcFacebookA, intent: "Cerrado - Casa Pilar", dayOffset: 25, hour: 4 },
    { name: "Emilia Suárez", email: "emilia@example.com", phone: "+5491155550052", status: LeadStatus.WON, stageKey: "WON", score: 100, assignee: agentA1.id, source: srcManualA, intent: "Cerrado - Lote Escobar", dayOffset: 18, hour: 6 },
    { name: "Benjamín Ríos", email: "benjamin@example.com", phone: "+5491155550053", status: LeadStatus.WON, stageKey: "WON", score: 100, assignee: agentA2.id, source: srcWebA, intent: "Cerrado - Oficina Microcentro", dayOffset: 22, hour: 1 },
    // ── LOST (2) ────────────────────────────────────────
    { name: "Renata Flores", email: "renata@example.com", phone: "+5491155550060", status: LeadStatus.LOST, stageKey: "LOST", score: 20, assignee: agentA1.id, source: srcTelegramA, intent: "No califica - presupuesto bajo", dayOffset: 28, hour: 3 },
    { name: "Ignacio Ponce", email: "ignacio@example.com", phone: "+5491155550061", status: LeadStatus.LOST, stageKey: "LOST", score: 15, assignee: agentA2.id, source: srcWhatsAppA, intent: "Eligió otra inmobiliaria", dayOffset: 26, hour: 5 },
  ];

  const createdLeadsA: Array<{ id: string; name: string | null; phone: string | null; email: string | null; status: string }> = [];

  for (const ld of leadsDataA) {
    const existing = await prisma.lead.findFirst({
      where: { tenantId: tenantA.id, email: ld.email },
    });
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
          assigneeId: ld.assignee,
          sourceId: ld.source?.id,
          intent: ld.intent,
          createdAt: daysAgo(ld.dayOffset, ld.hour),
          updatedAt: daysAgo(ld.dayOffset, ld.hour),
        },
      });
      createdLeadsA.push(lead);
    } else {
      createdLeadsA.push(existing);
    }
  }

  // ─── Lead Profiles (for qualified+ leads) ──────────
  const profilesToCreate = [
    { lead: createdLeadsA[9], budgetMin: 200000, budgetMax: 280000, currency: "USD", zones: ["Recoleta", "Palermo", "Belgrano"], propertyType: "Casa", bedroomsMin: 3, bedroomsMax: 4 },
    { lead: createdLeadsA[10], budgetMin: 150000, budgetMax: 220000, currency: "USD", zones: ["Recoleta"], propertyType: "Departamento", bedroomsMin: 3, bedroomsMax: 3 },
    { lead: createdLeadsA[11], budgetMin: 80000, budgetMax: 150000, currency: "USD", zones: ["San Telmo", "La Boca", "Puerto Madero"], propertyType: "Departamento", bedroomsMin: 1, bedroomsMax: 2 },
    { lead: createdLeadsA[12], budgetMin: 120000, budgetMax: 180000, currency: "USD", zones: ["Villa Urquiza", "Saavedra"], propertyType: "Departamento", bedroomsMin: 2, bedroomsMax: 3 },
    { lead: createdLeadsA[13], budgetMin: 160000, budgetMax: 250000, currency: "USD", zones: ["Núñez", "Belgrano"], propertyType: "Casa", bedroomsMin: 3, bedroomsMax: 4 },
    { lead: createdLeadsA[14], budgetMin: 180000, budgetMax: 300000, currency: "USD", zones: ["Palermo", "Recoleta"], propertyType: "Departamento", bedroomsMin: 2, bedroomsMax: 3 },
    { lead: createdLeadsA[16], budgetMin: 170000, budgetMax: 200000, currency: "USD", zones: ["Palermo", "Villa Crespo"], propertyType: "Departamento", bedroomsMin: 2, bedroomsMax: 3 },
    { lead: createdLeadsA[17], budgetMin: 250000, budgetMax: 400000, currency: "USD", zones: ["Nordelta", "Tigre"], propertyType: "Casa", bedroomsMin: 4, bedroomsMax: 5 },
  ];

  for (const p of profilesToCreate) {
    if (!p.lead) continue;
    const profileExists = await prisma.leadProfile.findUnique({ where: { leadId: p.lead.id } });
    if (!profileExists) {
      await prisma.leadProfile.create({
        data: {
          tenantId: tenantA.id,
          leadId: p.lead.id,
          budgetMin: p.budgetMin,
          budgetMax: p.budgetMax,
          currency: p.currency,
          zones: p.zones,
          propertyType: p.propertyType,
          bedroomsMin: p.bedroomsMin,
          bedroomsMax: p.bedroomsMax,
        },
      });
    }
  }

  // ─── Templates ─────────────────────────────────────
  const templatesA = [
    { key: "welcome_wa", name: "Bienvenida WhatsApp", channel: "WHATSAPP" as const, content: "¡Hola {{nombre}}! Gracias por contactar a Inmobiliaria Demo A. Un asesor se comunicará pronto con vos. ¿En qué zona estás buscando?" },
    { key: "welcome_tg", name: "Bienvenida Telegram", channel: "TELEGRAM" as const, content: "¡Hola {{nombre}}! Recibimos tu consulta, te responderemos a la brevedad." },
    { key: "followup_24h", name: "Seguimiento 24hs", channel: "WHATSAPP" as const, content: "Hola {{nombre}}, ¿pudiste revisar las opciones que te enviamos? Estamos para ayudarte con cualquier duda." },
    { key: "visit_confirm", name: "Confirmación de Visita", channel: "WHATSAPP" as const, content: "Hola {{nombre}}, te confirmamos la visita para el día acordado. ¿Necesitás reprogramar? Avisanos." },
    { key: "post_visit", name: "Post Visita", channel: "WHATSAPP" as const, content: "Hola {{nombre}}, ¿qué te pareció la propiedad que visitamos? Contanos tu opinión." },
  ];

  for (const tpl of templatesA) {
    await prisma.template.upsert({
      where: { tenantId_key: { tenantId: tenantA.id, key: tpl.key } },
      update: {},
      create: { tenantId: tenantA.id, key: tpl.key, name: tpl.name, channel: tpl.channel, content: tpl.content, enabled: true },
    });
  }

  // ─── Rules ─────────────────────────────────────────
  const rulesA = [
    { name: "Auto-asignar lead nuevo (round-robin)", trigger: "lead.created", priority: 10, conditions: {}, actions: [{ type: "assign_round_robin" }] },
    { name: "Bienvenida WhatsApp", trigger: "lead.created", priority: 20, conditions: { channel: "WHATSAPP" }, actions: [{ type: "send_template", templateKey: "welcome_wa" }] },
    { name: "Bienvenida Telegram", trigger: "lead.created", priority: 20, conditions: { channel: "TELEGRAM" }, actions: [{ type: "send_template", templateKey: "welcome_tg" }] },
    { name: "Notificar agente asignado", trigger: "lead.created", priority: 30, conditions: {}, actions: [{ type: "notify" }] },
    { name: "Seguimiento sin respuesta 24h", trigger: "no_response", priority: 50, conditions: { hoursElapsed: 24 }, actions: [{ type: "send_template", templateKey: "followup_24h" }] },
    { name: "IA responde mensaje entrante", trigger: "message.inbound", priority: 40, conditions: {}, actions: [{ type: "send_ai_message" }] },
  ];

  for (const rule of rulesA) {
    const existing = await prisma.rule.findFirst({ where: { tenantId: tenantA.id, name: rule.name } });
    if (!existing) {
      await prisma.rule.create({
        data: { tenantId: tenantA.id, name: rule.name, trigger: rule.trigger, priority: rule.priority, conditions: rule.conditions, actions: rule.actions, enabled: true },
      });
    }
  }

  // ─── Messages (realistic conversations) ────────────
  const msgsExist = await prisma.message.count({ where: { tenantId: tenantA.id } });
  if (msgsExist === 0 && createdLeadsA.length > 0) {
    const conversations = [
      // Lead 0: María — WhatsApp conversation
      { leadIdx: 0, msgs: [
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Hola, me interesa la propiedad de 2 ambientes en Palermo que publicaron", daysAgo: 0, h: 3 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "¡Hola María! Gracias por contactarnos. Tenemos varias opciones en Palermo. ¿Qué presupuesto manejás?", daysAgo: 0, h: 2.5 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Entre 120 y 160 mil dólares", daysAgo: 0, h: 2 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "Perfecto, te armo un listado con las mejores opciones y te lo envío. ¿Te parece?", daysAgo: 0, h: 1.5 },
      ]},
      // Lead 5: Carlos — contacted
      { leadIdx: 5, msgs: [
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Buenas tardes, busco un PH en Belgrano. ¿Tienen algo disponible?", daysAgo: 3, h: 8 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "¡Hola Carlos! Sí, tenemos 3 PHs en Belgrano. Te comparto las fichas.", daysAgo: 3, h: 7 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Dale, esperando", daysAgo: 3, h: 6 },
      ]},
      // Lead 6: Ana — WhatsApp
      { leadIdx: 6, msgs: [
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Hola! Estoy buscando lotes en Pilar para construir. ¿Qué opciones tienen?", daysAgo: 4, h: 10 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "¡Hola Ana! En Pilar tenemos lotes en 3 barrios diferentes. ¿Querés que te pase info?", daysAgo: 4, h: 9 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Sí por favor! Y me gustaría saber si aceptan financiación", daysAgo: 4, h: 8 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "Sí, algunos desarrollos ofrecen financiación directo en hasta 36 cuotas. Te preparo un email con todo el detalle.", daysAgo: 4, h: 7 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Genial, mi mail es ana@example.com", daysAgo: 4, h: 6 },
      ]},
      // Lead 9: Pedro — qualified
      { leadIdx: 9, msgs: [
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Hola, quiero comprar una casa de 4 ambientes. Presupuesto USD 250k", daysAgo: 7, h: 12 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "¡Hola Pedro! Excelente presupuesto. Tenemos casas en Belgrano, Núñez y Olivos. ¿Qué zona preferís?", daysAgo: 7, h: 11 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Belgrano o Núñez. Necesito cochera y patio", daysAgo: 7, h: 10 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "Tengo 2 opciones que se ajustan perfecto. ¿Podés esta semana para una visita?", daysAgo: 7, h: 9 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "El jueves a la tarde me vendría bien", daysAgo: 7, h: 8 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "Perfecto, te agendo para el jueves a las 16hs. Te envío la dirección.", daysAgo: 6, h: 5 },
      ]},
      // Lead 13: Mateo — visit
      { leadIdx: 13, msgs: [
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Confirmo la visita para mañana lunes", daysAgo: 10, h: 5 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "Perfecto Mateo, nos vemos mañana a las 10hs. ¿Necesitás la dirección nuevamente?", daysAgo: 10, h: 4 },
      ]},
      // Lead 14: Julieta — visit
      { leadIdx: 14, msgs: [
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Me encantó el segundo departamento que visitamos!", daysAgo: 12, h: 8 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "¡Qué bueno Julieta! Es una excelente opción. ¿Te gustaría que armemos una propuesta?", daysAgo: 12, h: 7 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Sí, me interesa. ¿Cuánto es la seña?", daysAgo: 12, h: 6 },
      ]},
      // Lead 3: Diego — Telegram
      { leadIdx: 3, msgs: [
        { dir: "IN" as const, ch: "TELEGRAM" as const, content: "Hola, busco oficina en microcentro, 50m2 mínimo", daysAgo: 1, h: 10 },
        { dir: "OUT" as const, ch: "TELEGRAM" as const, content: "¡Hola Diego! Tenemos varias oficinas en microcentro. ¿Para alquiler o compra?", daysAgo: 1, h: 9 },
        { dir: "IN" as const, ch: "TELEGRAM" as const, content: "Alquiler, presupuesto hasta $800k/mes", daysAgo: 1, h: 8 },
      ]},
      // Lead 16: Agustín — negotiation
      { leadIdx: 16, msgs: [
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Quiero hacer una oferta por el depto de Palermo. USD 180k.", daysAgo: 14, h: 6 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "Excelente Agustín. Voy a presentar la oferta al propietario. Te aviso en las próximas horas.", daysAgo: 14, h: 5 },
        { dir: "OUT" as const, ch: "WHATSAPP" as const, content: "Agustín, el propietario aceptó tu oferta de USD 180k. ¡Felicitaciones! Coordinemos fecha para la reserva.", daysAgo: 13, h: 3 },
        { dir: "IN" as const, ch: "WHATSAPP" as const, content: "Excelente!! ¿El viernes podemos firmar?", daysAgo: 13, h: 2 },
      ]},
    ];

    for (const conv of conversations) {
      const lead = createdLeadsA[conv.leadIdx];
      if (!lead) continue;
      for (const m of conv.msgs) {
        await prisma.message.create({
          data: {
            tenantId: tenantA.id,
            leadId: lead.id,
            direction: m.dir === "IN" ? MessageDirection.IN : MessageDirection.OUT,
            channel: m.ch === "WHATSAPP" ? MessageChannel.WHATSAPP : MessageChannel.TELEGRAM,
            from: m.dir === "IN" ? (lead.phone ?? "+5491100000000") : undefined,
            to: m.dir === "OUT" ? (lead.phone ?? "+5491100000000") : undefined,
            content: m.content,
            createdAt: daysAgo(m.daysAgo, m.h),
          },
        });
      }
    }
  }

  // ─── Event Logs (rich) ─────────────────────────────
  const eventsExist = await prisma.eventLog.count({ where: { tenantId: tenantA.id } });
  if (eventsExist === 0) {
    const events = [
      { type: EventType.lead_created, entity: "Lead", message: "Lead creado: María García (WhatsApp)", daysAgo: 0 },
      { type: EventType.lead_created, entity: "Lead", message: "Lead creado: Roberto Sánchez (Web)", daysAgo: 0 },
      { type: EventType.lead_created, entity: "Lead", message: "Lead creado: Diego Morales (Telegram)", daysAgo: 1 },
      { type: EventType.message_inbound, entity: "Lead", message: "Mensaje entrante de María García por WhatsApp", daysAgo: 0 },
      { type: EventType.message_sent, entity: "Lead", message: "Respuesta automática enviada a María García", daysAgo: 0 },
      { type: EventType.lead_updated, entity: "Lead", message: "Carlos López → estado CONTACTED", daysAgo: 3 },
      { type: EventType.lead_updated, entity: "Lead", message: "Pedro Rodríguez → estado QUALIFIED", daysAgo: 7 },
      { type: EventType.message_inbound, entity: "Lead", message: "Mensaje entrante de Pedro Rodríguez por WhatsApp", daysAgo: 7 },
      { type: EventType.lead_updated, entity: "Lead", message: "Julieta Romero → etapa VISIT", daysAgo: 12 },
      { type: EventType.message_sent, entity: "Lead", message: "Template 'Seguimiento 24hs' enviado a Ana Martínez", daysAgo: 3 },
      { type: EventType.workflow_executed, entity: "Rule", message: "Regla 'Auto-asignar lead nuevo' ejecutada", daysAgo: 0 },
      { type: EventType.workflow_executed, entity: "Rule", message: "Regla 'Bienvenida WhatsApp' ejecutada", daysAgo: 0 },
      { type: EventType.workflow_executed, entity: "Rule", message: "Regla 'IA responde mensaje' ejecutada", daysAgo: 1 },
      { type: EventType.lead_updated, entity: "Lead", message: "Agustín Vega → etapa NEGOTIATION (oferta USD 180k)", daysAgo: 14 },
      { type: EventType.lead_updated, entity: "Lead", message: "Santiago Ruiz → etapa WON ✅", daysAgo: 20 },
      { type: EventType.lead_updated, entity: "Lead", message: "Florencia Paz → etapa WON ✅", daysAgo: 25 },
      { type: EventType.template_created, entity: "Template", message: "Plantilla 'Bienvenida WhatsApp' creada", daysAgo: 30 },
      { type: EventType.rule_created, entity: "Rule", message: "Regla 'Auto-asignar (round-robin)' creada", daysAgo: 30 },
      { type: EventType.rule_created, entity: "Rule", message: "Regla 'IA responde mensaje' creada", daysAgo: 28 },
      { type: EventType.channel_connected, entity: "Channel", message: "Canal WhatsApp conectado (agente Lucía Torres)", daysAgo: 29 },
    ];

    await prisma.eventLog.createMany({
      data: events.map((e) => ({
        tenantId: tenantA.id,
        type: e.type,
        entity: e.entity,
        message: e.message,
        createdAt: daysAgo(e.daysAgo, Math.random() * 10),
      })),
    });
  }

  // ─── Notifications (rich) ──────────────────────────
  const notifExist = await prisma.notification.count({ where: { tenantId: tenantA.id } });
  if (notifExist === 0) {
    await prisma.notification.createMany({
      data: [
        { tenantId: tenantA.id, userId: agentA1.id, type: "lead_assigned", title: "Nuevo lead asignado", message: "Se te asignó el lead María García", entity: "lead", entityId: createdLeadsA[0]?.id },
        { tenantId: tenantA.id, userId: agentA1.id, type: "message_inbound", title: "Nuevo mensaje", message: "María García envió un mensaje por WhatsApp", entity: "lead", entityId: createdLeadsA[0]?.id },
        { tenantId: tenantA.id, userId: agentA2.id, type: "lead_assigned", title: "Nuevo lead asignado", message: "Se te asignó el lead Roberto Sánchez", entity: "lead", entityId: createdLeadsA[1]?.id },
        { tenantId: tenantA.id, userId: agentA1.id, type: "stage_changed", title: "Etapa actualizada", message: "Pedro Rodríguez pasó a Calificado", entity: "lead", entityId: createdLeadsA[9]?.id, read: true },
        { tenantId: tenantA.id, userId: agentA2.id, type: "stage_changed", title: "Etapa actualizada", message: "Julieta Romero pasó a Visita", entity: "lead", entityId: createdLeadsA[14]?.id, read: true },
        { tenantId: tenantA.id, userId: agentA1.id, type: "lead_assigned", title: "Lead ganado 🎉", message: "Santiago Ruiz cerró la operación", entity: "lead", entityId: createdLeadsA[18]?.id, read: true },
        { tenantId: tenantA.id, userId: agentA2.id, type: "message_inbound", title: "Nuevo mensaje", message: "Agustín Vega envió una oferta por WhatsApp", entity: "lead", entityId: createdLeadsA[16]?.id },
      ],
    });
  }

  // ══════════════════════════════════════════════════════
  // TENANT B — Minimal data (Starter)
  // ══════════════════════════════════════════════════════

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantB.id, email: "admin@demob.com" } },
    update: {},
    create: { tenantId: tenantB.id, email: "admin@demob.com", passwordHash: pwHash, role: UserRole.BUSINESS, name: "Admin B" },
  });

  const agentB = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantB.id, email: "agent@demob.com" } },
    update: {},
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

  // 5 simple leads for tenant B
  const leadsB = [
    { name: "Julia Díaz", email: "julia@exampleb.com", phone: "+5491166660001", status: LeadStatus.NEW, stageKey: "NEW", score: 10 },
    { name: "Marcos Pérez", email: "marcos@exampleb.com", phone: "+5491166660002", status: LeadStatus.CONTACTED, stageKey: "CONTACTED", score: 30 },
    { name: "Lucía Romero", email: "luciab@exampleb.com", phone: "+5491166660003", status: LeadStatus.QUALIFIED, stageKey: "QUALIFIED", score: 55 },
    { name: "Pablo Herrera", email: "pablo@exampleb.com", phone: "+5491166660004", status: LeadStatus.WON, stageKey: "WON", score: 100 },
    { name: "Rocío Blanco", email: "rocio@exampleb.com", phone: "+5491166660005", status: LeadStatus.NEW, stageKey: "NEW", score: 5 },
  ];

  for (const ld of leadsB) {
    const existing = await prisma.lead.findFirst({ where: { tenantId: tenantB.id, email: ld.email } });
    if (!existing) {
      await prisma.lead.create({
        data: {
          tenantId: tenantB.id, name: ld.name, email: ld.email, phone: ld.phone, status: ld.status,
          stageId: stageMapB[ld.stageKey], score: ld.score, assigneeId: agentB.id,
        },
      });
    }
  }

  for (const tpl of [
    { key: "welcome_wa_b", name: "Bienvenida WhatsApp", channel: "WHATSAPP" as const, content: "¡Hola {{nombre}}! Gracias por contactarnos." },
    { key: "welcome_tg_b", name: "Bienvenida Telegram", channel: "TELEGRAM" as const, content: "¡Hola {{nombre}}! Te respondemos a la brevedad." },
  ]) {
    await prisma.template.upsert({
      where: { tenantId_key: { tenantId: tenantB.id, key: tpl.key } },
      update: {},
      create: { tenantId: tenantB.id, key: tpl.key, name: tpl.name, channel: tpl.channel, content: tpl.content, enabled: true },
    });
  }

  // ═══════════════════════════════════════════════════
  console.log("✅ Seed complete!");
  console.log("");
  console.log("   Super Admin → admin@inmoflow.com / password123 (ADMIN)");
  console.log("   Tenant A (PROFESSIONAL):");
  console.log("     → admin@demoa.com  / password123 (BUSINESS)");
  console.log("     → agent@demoa.com  / password123 (AGENT - Lucía Torres)");
  console.log("     → agent2@demoa.com / password123 (AGENT - Martín Ruiz)");
  console.log("     → viewer@demoa.com / password123 (VIEWER)");
  console.log("     → 24 leads, 5 templates, 6 rules, 5 lead sources, 20 events, 7 notifications, 30+ messages");
  console.log("   Tenant B (STARTER):");
  console.log("     → admin@demob.com / password123 (BUSINESS)");
  console.log("     → agent@demob.com / password123 (AGENT)");
  console.log("     → 5 leads, 2 templates");
}

// ─── Utils ──────────────────────────────────────────────
async function upsertLeadSource(tenantId: string, name: string, type: LeadSourceType, webFormKey?: string) {
  const existing = await prisma.leadSource.findFirst({ where: { tenantId, type, name } });
  if (existing) return existing;
  return prisma.leadSource.create({
    data: { tenantId, type, name, webFormKey, enabled: true },
  });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
