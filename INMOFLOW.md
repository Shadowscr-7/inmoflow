# INMOFLOW — Especificación Técnica Completa

> **Plataforma SaaS multi-tenant para inmobiliarias**
> Versión: MVP · Fecha: 2026-03-03

---

## Tabla de Contenidos

- [0. Contexto del Producto](#0-contexto-del-producto)
- [1. Stack Tecnológico](#1-stack-tecnológico)
- [2. Definiciones Clave](#2-definiciones-clave)
- [3. Prisma Schema (MVP)](#3-prisma-schema-mvp)
- [4. Contrato de Eventos](#4-contrato-de-eventos)
- [5. Plan por Fases](#5-plan-por-fases)
  - [Fase 1 — Fundaciones multi-tenant + Docker-first](#fase-1--fundaciones-multi-tenant--docker-first-días-15)
  - [Fase 2 — CRM MVP](#fase-2--crm-mvp-días-610)
  - [Fase 3 — Canales self-service: WhatsApp + Telegram](#fase-3--canales-self-service-whatsapp--telegram-días-1117)
  - [Fase 4 — Meta Lead Ads](#fase-4--meta-lead-ads-días-1821)
  - [Fase 5 — Event-driven + BullMQ](#fase-5--event-driven--bullmq-días-2225)
  - [Fase 6 — Web pública multi-tenant + dominios](#fase-6--web-pública-multi-tenant--dominios-días-2630)
  - [Fase 7 (V2) — Respuestas con contexto (Agent MVP)](#fase-7-v2--respuestas-con-contexto-agent-mvp)
- [6. Issues por Épica (estilo GitHub)](#6-issues-por-épica-estilo-github)
- [7. Orden de Modelado](#7-orden-de-modelado)
- [8. Checklist MVP Vendible](#8-checklist-mvp-vendible)
- [9. Web Personalizada (sin romper el producto)](#9-web-personalizada-sin-romper-el-producto)

---

## 0. Contexto del Producto

### Qué estamos construyendo

Una plataforma SaaS para inmobiliarias que incluye:

| Módulo | Descripción |
|--------|-------------|
| **Web pública** | Sitio de propiedades por tenant + dominios personalizados |
| **Captación de leads** | Desde Web + Meta + WhatsApp + Telegram |
| **CRM multi-tenant** | Clasificar/seguir leads (pipeline) |
| **Automatizaciones** | Asignación, mensajes, IA opcional |
| **Agente/Bot** | Responde con contexto: qué busca el cliente + catálogo de propiedades |

### Principios No Negociables

- **Una sola base de código** — monorepo único
- **Una sola infraestructura** — por servidor
- **Una sola DB** — multi-tenant por `tenantId`
- **Todo se configura por DB** — rules, templates, channels, theme, domains
- **Integraciones** — webhooks únicos; WhatsApp/Telegram "self-service"

---

## 1. Stack Tecnológico

### Repo / Build / Deploy

| Herramienta | Uso |
|-------------|-----|
| `pnpm` | Package manager |
| `Turborepo` | Monorepo build system |
| `Docker` + `Docker Compose` | Containerización y orquestación |
| GitHub Actions *(opcional, recomendado)* | CI/CD — build & push imágenes |

### Backend

| Herramienta | Uso |
|-------------|-----|
| `NestJS` | Framework API |
| `Prisma` | ORM |
| `PostgreSQL` | Base de datos |
| `Redis` + `BullMQ` | Colas y jobs |
| `Zod` | Validación de env y DTOs compartidos |

### Frontend

| Herramienta | Uso |
|-------------|-----|
| `Next.js` (App Router) | Framework web |
| `Tailwind CSS` | Estilos |
| `shadcn/ui` *(opcional)* | Componentes |
| ISR/SSR | Propiedades públicas |

### Integraciones

| Integración | Implementación |
|-------------|---------------|
| **WhatsApp** | Evolution API multi-sesión por QR (por tenant) |
| **Telegram** | 1 bot global con `/start TENANT_nonce` |
| **Meta Lead Ads** | Webhook único + mapeo `page_id`/`form_id` → `tenantId` |

### Observabilidad (MVP)

| Componente | Implementación |
|------------|---------------|
| Logs | Estructurados por tenant (DB + consola) |
| Health | Endpoint `/health` + healthchecks en compose |
| Backups | `pg_dump` por cron |

---

## 2. Definiciones Clave

| Concepto | Descripción |
|----------|-------------|
| **Tenant** | La "inmobiliaria" dentro del SaaS. Todo cuelga de `tenantId`. |
| **Channel** | Conexión de mensajería o fuente: WhatsApp (sesión Evolution), Telegram (chatId), Meta (mapping form/page), Web (form embebido). |
| **Lead** | Persona que consulta. Un lead puede venir de cualquier canal. |
| **Message** | Mensajes IN/OUT asociados al lead (WhatsApp/Telegram/Web). |
| **LeadProfile** | Representación estructurada de lo que el lead busca: zona, presupuesto, tipo, dormitorios, etc. |
| **Events** | Hechos del sistema (event-driven): `lead.created`, `message.inbound`, `lead.profile.updated`, `message.sent`. |
| **Rules (Workflow)** | Reglas configurables por tenant: ej. "si `lead.created` y `source=Meta` → asignar agente X y enviar template Y". |

---

## 3. Prisma Schema (MVP)

> **Enfoque:** Single DB, multi-tenant por `tenantId`.
> **Incluye:** tenants/usuarios/domains, CRM (leads/pipeline), canales (WA/Telegram/Meta/Web), mensajería, reglas/plantillas, propiedades, lead profile, logs.
> **Ubicación:** `packages/db/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ────────────────────────────────────────────

enum UserRole {
  OWNER
  ADMIN
  AGENT
  VIEWER
}

enum ChannelType {
  WHATSAPP
  TELEGRAM
  META
  WEB
}

enum ChannelStatus {
  CONNECTING
  CONNECTED
  DISCONNECTED
  ERROR
}

enum LeadSourceType {
  WEB_FORM
  META_LEAD_AD
  WHATSAPP_INBOUND
  TELEGRAM_INBOUND
  MANUAL
}

enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  VISIT
  NEGOTIATION
  WON
  LOST
}

enum MessageDirection {
  IN
  OUT
}

enum MessageChannel {
  WHATSAPP
  TELEGRAM
  WEB
}

enum EventType {
  lead_created
  lead_updated
  message_inbound
  message_sent
  channel_connected
  channel_disconnected
  workflow_executed
  workflow_failed
  provider_error
}

// ─── TENANT & AUTH ────────────────────────────────────

model Tenant {
  id          String   @id @default(uuid())
  name        String
  plan        String   @default("MVP")
  timezone    String   @default("America/Montevideo")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users       User[]
  domains     Domain[]
  channels    Channel[]
  leadStages  LeadStage[]
  leads       Lead[]
  messages    Message[]
  templates   Template[]
  rules       Rule[]
  properties  Property[]
  leadSources LeadSource[]
  eventLogs   EventLog[]
}

model Domain {
  id        String   @id @default(uuid())
  tenantId  String
  host      String   @unique   // ej: inmoA.tuplataforma.com o www.inmoA.com
  isPrimary Boolean  @default(false)
  createdAt DateTime @default(now())

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

model User {
  id           String   @id @default(uuid())
  tenantId     String
  email        String
  passwordHash String
  role         UserRole @default(AGENT)
  name         String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  assignedLeads Lead[] @relation("LeadAssignee")

  @@unique([tenantId, email])
  @@index([tenantId, role])
}

// ─── CHANNELS ─────────────────────────────────────────

model Channel {
  id                 String        @id @default(uuid())
  tenantId           String
  type               ChannelType
  status             ChannelStatus @default(CONNECTING)
  providerInstanceId String?       // WHATSAPP (Evolution): sesión/instancia
  telegramChatId     String?       // TELEGRAM: chatId conectado
  metaPageId         String?       // META: pageId global (mapping fino en LeadSource)
  lastError          String?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, type])
  @@index([tenantId, status])
}

// ─── CRM: LEADS & PIPELINE ───────────────────────────

model LeadStage {
  id        String   @id @default(uuid())
  tenantId  String
  key       String   // NEW, CONTACTED, QUALIFIED, VISIT, NEGOTIATION, WON, LOST
  name      String
  order     Int
  isDefault Boolean  @default(false)

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  leads     Lead[]

  @@unique([tenantId, key])
  @@index([tenantId, order])
}

model LeadSource {
  id         String         @id @default(uuid())
  tenantId   String
  type       LeadSourceType
  name       String
  metaPageId String?        // META mapping
  metaFormId String?        // META mapping
  webFormKey String?        // WEB (distinguir forms)
  enabled    Boolean        @default(true)
  createdAt  DateTime       @default(now())

  tenant     Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, type])
  @@unique([tenantId, type, metaPageId, metaFormId])
}

model Lead {
  id             String          @id @default(uuid())
  tenantId       String
  sourceId       String?
  source         LeadSource?     @relation(fields: [sourceId], references: [id], onDelete: SetNull)
  stageId        String?
  stage          LeadStage?      @relation(fields: [stageId], references: [id], onDelete: SetNull)
  status         LeadStatus      @default(NEW)
  name           String?
  phone          String?
  email          String?
  primaryChannel MessageChannel?
  whatsappFrom   String?         // número/jid
  telegramUserId String?
  assigneeId     String?
  assignee       User?           @relation("LeadAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  intent         String?         // compra/venta/alquiler/curioso
  score          Int?            // 0-100
  notes          String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  tenant    Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  messages  Message[]
  profile   LeadProfile?

  @@index([tenantId, status])
  @@index([tenantId, stageId])
  @@index([tenantId, assigneeId])
  @@index([tenantId, createdAt])
  @@index([tenantId, phone])
}

model LeadProfile {
  id            String   @id @default(uuid())
  tenantId      String
  leadId        String   @unique
  intent        String?
  budgetMin     Int?
  budgetMax     Int?
  currency      String?  // USD/UYU
  zones         String[] // Postgres text[]
  propertyType  String?  // apto/casa/terreno
  bedroomsMin   Int?
  bedroomsMax   Int?
  bathroomsMin  Int?
  hasGarage     Boolean?
  mustHaves     String[]
  timeline      String?  // "inmediato", "3 meses"
  lastSummary   String?  // resumen textual para contexto
  updatedAt     DateTime @updatedAt
  createdAt     DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lead   Lead   @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

// ─── MESSAGING ────────────────────────────────────────

model Message {
  id                String           @id @default(uuid())
  tenantId          String
  leadId            String
  direction         MessageDirection
  channel           MessageChannel
  providerMessageId String?
  from              String?
  to                String?
  content           String
  rawPayload        Json?
  status            String?          // sent, delivered, failed
  error             String?
  createdAt         DateTime         @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  lead   Lead   @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([tenantId, leadId, createdAt])
  @@index([tenantId, channel])
}

// ─── TEMPLATES & RULES ───────────────────────────────

model Template {
  id        String          @id @default(uuid())
  tenantId  String
  key       String          // "welcome_buy", "ask_budget"
  name      String
  channel   MessageChannel?
  content   String          // texto con placeholders {{name}}, {{zone}}
  enabled   Boolean         @default(true)
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, key])
  @@index([tenantId, enabled])
}

model Rule {
  id         String   @id @default(uuid())
  tenantId   String
  name       String
  enabled    Boolean  @default(true)
  trigger    String   // ej: "lead.created" / "message.inbound"
  priority   Int      @default(100)
  conditions Json     // { sourceType: "META_LEAD_AD", intent: "compra" }
  actions    Json     // [{ type:"assign", ... }, { type:"send_template", ... }]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, enabled])
  @@index([tenantId, trigger, priority])
}

// ─── PROPERTIES ───────────────────────────────────────

model Property {
  id           String   @id @default(uuid())
  tenantId     String
  code         String?  // código interno
  title        String
  description  String?
  status       String   @default("ACTIVE") // ACTIVE/INACTIVE/SOLD/RENTED
  price        Int?
  currency     String?  // USD/UYU
  propertyType String?  // apto/casa/terreno
  bedrooms     Int?
  bathrooms    Int?
  areaM2       Int?
  hasGarage    Boolean?
  zone         String?
  address      String?
  lat          Float?
  lng          Float?
  slug         String
  publishedAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  media  PropertyMedia[]

  @@unique([tenantId, slug])
  @@index([tenantId, status])
  @@index([tenantId, zone])
  @@index([tenantId, price])
}

model PropertyMedia {
  id         String   @id @default(uuid())
  tenantId   String
  propertyId String
  url        String
  kind       String?  // image/video
  order      Int      @default(0)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  property Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@index([tenantId, propertyId])
}

// ─── EVENT LOG ────────────────────────────────────────

model EventLog {
  id        String    @id @default(uuid())
  tenantId  String
  type      EventType
  entity    String?   // "lead" | "message" | "channel"
  entityId  String?
  status    String    @default("OK") // OK/ERROR
  message   String?
  payload   Json?
  createdAt DateTime  @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, type, createdAt])
  @@index([tenantId, status, createdAt])
}
```

### Notas del Schema

| Decisión | Motivo |
|----------|--------|
| `Rule.conditions` y `Rule.actions` en **JSON** | Workflow engine flexible sin migraciones cada semana |
| `Domain.host` | Web multi-tenant por subdominio y dominio custom |
| `LeadProfile` | Base del "contexto" del agente IA |
| `EventLog` | Debug por tenant sin entrar al server — baja soporte |

---

## 4. Contrato de Eventos

> **Ubicación:** `packages/shared/src/events/`
> **Regla:** Todo webhook o acción importante genera un evento; el worker procesa por topic.

### Topics

```typescript
// packages/shared/src/events/topics.ts

export const Topics = {
  LEAD_CREATED:           "lead.created",
  LEAD_UPDATED:           "lead.updated",
  MESSAGE_INBOUND:        "message.inbound",
  MESSAGE_SEND_REQUESTED: "message.send_requested",
  MESSAGE_SENT:           "message.sent",
  CHANNEL_CONNECTED:      "channel.connected",
  CHANNEL_DISCONNECTED:   "channel.disconnected",
  WORKFLOW_EXECUTE:       "workflow.execute",
  WORKFLOW_EXECUTED:      "workflow.executed",
  WORKFLOW_FAILED:        "workflow.failed",
  PROVIDER_ERROR:         "provider.error",
} as const;

export type Topic = (typeof Topics)[keyof typeof Topics];
```

### Payloads Tipados

```typescript
// packages/shared/src/events/types.ts

export type BaseEvent<T extends string, P> = {
  id: string;              // uuid del evento
  topic: T;
  tenantId: string;
  occurredAt: string;      // ISO 8601
  correlationId?: string;  // request-id / trace
  payload: P;
};

export type LeadCreatedPayload = {
  leadId: string;
  sourceType: "WEB_FORM" | "META_LEAD_AD" | "WHATSAPP_INBOUND" | "TELEGRAM_INBOUND" | "MANUAL";
};

export type MessageInboundPayload = {
  leadId: string;
  messageId: string;
  channel: "WHATSAPP" | "TELEGRAM" | "WEB";
  from?: string;
  content: string;
};

export type MessageSendRequestedPayload = {
  leadId: string;
  channel: "WHATSAPP" | "TELEGRAM";
  templateKey?: string;
  text?: string;
  variables?: Record<string, string | number | boolean>;
};

export type ChannelConnectedPayload = {
  channelId: string;
  type: "WHATSAPP" | "TELEGRAM" | "META" | "WEB";
};

export type WorkflowExecutePayload = {
  trigger: "lead.created" | "message.inbound" | string;
  leadId: string;
  messageId?: string;
};

export type ProviderErrorPayload = {
  provider: "EVOLUTION" | "TELEGRAM" | "META";
  detail: string;
  context?: Record<string, unknown>;
};
```

### Reglas de Oro (Event-Driven)

1. **Webhook → persistencia → evento** (rápido, no bloquea)
2. **Worker** hace IA, matching, envíos, retries
3. Todo evento lleva **`tenantId`** + **`correlationId`**
4. Si falla: **EventLog** + `workflow.failed` + retry si aplica

---

## 5. Plan por Fases

### Fase 1 — Fundaciones multi-tenant + Docker-first (Días 1–5)

#### Objetivo
Tener la plataforma arrancada, con DB multi-tenant, auth, y corriendo 100% en Docker.

#### Qué construyes

| Componente | Detalle |
|------------|---------|
| Monorepo | Turborepo + pnpm |
| Estructura | `apps/api`, `apps/web`, `apps/worker`, `packages/db`, `packages/shared` |
| Docker | Dockerfiles por app + compose: postgres + redis + api + worker + web + nginx (opcional) |
| Prisma schema | Tenant, User, Domain, Channel, Lead, Message, EventLog, Rule |
| Datos mínimos | Todo con `tenantId`; `Domain(host → tenantId)` para resolver sitios |

#### Entregables
- [ ] `docker compose up -d` levanta todo
- [ ] `migrate` corre automáticamente
- [ ] `/health` responde OK
- [ ] Login + crear tenant + crear usuario

#### "Listo" cuando
- Puedes crear **2 tenants** y no se ven datos entre sí
- Deploy reproducible en otro server con `.env` distinto

---

### Fase 2 — CRM MVP (Días 6–10)

#### Objetivo
Que una inmobiliaria ya pueda operar: ver leads, moverlos por estados, notas y etiquetas.

#### Qué construyes

| Componente | Detalle |
|------------|---------|
| Leads CRUD | Por tenant |
| Pipeline básico | Stages: `NEW → CONTACTED → QUALIFIED → VISIT → NEGOTIATION → WON / LOST` |
| UI | Lista + filtros, detalle lead + historial + mensajes |

#### Entregables
- [ ] Panel `/dashboard/leads`
- [ ] Cambiar status desde UI
- [ ] `EventLog` en cada cambio

#### "Listo" cuando
- Puedes gestionar leads manuales sin integraciones
- Queda historial claro de actividad

---

### Fase 3 — Canales self-service: WhatsApp + Telegram (Días 11–17)

#### Objetivo
Que el admin conecte canales sin intervención manual del desarrollador.

#### WhatsApp (Evolution multi-sesión)

| Paso | Detalle |
|------|---------|
| UI | "Conectar WhatsApp" → muestra QR |
| Backend | Crea instancia en Evolution, guarda `providerInstanceId`, recibe webhook `connected` |
| Inbound | Messages → crea/actualiza lead + message + event |

#### Telegram (bot global)

| Paso | Detalle |
|------|---------|
| Bot | 1 bot único para toda la plataforma |
| UI | "Conectar Telegram" → genera link `t.me/bot?start=TENANT_nonce` |
| Backend | Valida nonce y guarda `chatId` |

#### Entregables
- [ ] Conectar/desconectar canal
- [ ] Enviar mensaje manual desde CRM
- [ ] Recibir mensajes crea lead automáticamente

#### "Listo" cuando
- Dos tenants pueden conectar cada uno su WhatsApp y **no se cruzan mensajes**
- Telegram se conecta por chatId y notifica

---

### Fase 4 — Meta Lead Ads (Días 18–21)

#### Objetivo
Captar leads de Meta sin crear webhooks nuevos.

#### Qué construyes

| Componente | Detalle |
|------------|---------|
| Webhook único | `/webhooks/meta` |
| Tabla | `LeadSource` con mapping: `tenantId`, `pageId`, `formId`, `enabled` |
| UI (MVP) | Pegar `pageId`/`formId` manualmente (luego OAuth V2) |

#### Entregables
- [ ] Lead creado por Meta
- [ ] Workflow disparado

#### "Listo" cuando
- Puedes mapear **2 forms de 2 tenants** distintos y cada lead cae en el CRM correcto

---

### Fase 5 — Event-driven + BullMQ (Días 22–25)

#### Objetivo
Bajar mantenimiento: todo entra por eventos y se procesa con retry, sin romper la API.

#### Qué construyes

| Componente | Detalle |
|------------|---------|
| Producer | Webhook → encola en BullMQ |
| Worker | Procesa `lead.created`, `message.inbound` |
| Retries | Dead-letter queue (mínimo: log a EventLog) |
| UI Logs | Actividad por tenant (errores, envíos, conexiones) |

#### Entregables
- [ ] Colas + retries
- [ ] Pantalla de logs de actividad

#### "Listo" cuando
- Si Evolution falla, el job **reintenta** y queda log
- **No se pierden leads** aunque un proveedor se caiga

---

### Fase 6 — Web pública multi-tenant + dominios (Días 26–30)

#### Objetivo
Que cada inmobiliaria tenga su web pública (exponer propiedades) conectada al mismo core.

#### Qué construyes

| Componente | Detalle |
|------------|---------|
| Resolver tenant | Middleware en Next.js: lookup `Domain.host` en DB (cache en Redis) |
| Propiedades | Tabla `Property` + `PropertyMedia` + `PropertyLocation` |
| Web pública | Listado + filtros + detalle + formulario "quiero info" → crea lead |
| Theming | Por tenant: logo, colores, copy (DB) |

#### Entregables
- [ ] `inmoA.tuplataforma.com` muestra propiedades del tenant A
- [ ] Formulario crea lead en CRM del tenant A
- [ ] *(Opcional)* Botón WhatsApp del tenant

#### "Listo" cuando
- Con **2 dominios distintos** ves **2 webs distintas** sin deploy extra
- Leads desde web disparan automatización

---

### Fase 7 (V2) — Respuestas con contexto (Agent MVP)

> Se puede empezar al final de Fase 6. Marcado como V2 porque es "inteligencia".

#### Objetivo
Que el bot responda con contexto de búsqueda + propiedades reales.

#### Qué construyes

| Componente | Detalle |
|------------|---------|
| LeadProfile | Estado de búsqueda estructurado |
| Extractor IA | De un mensaje → actualiza profile |
| Matching MVP | SQL: filtra propiedades por zona/precio/dormitorios/tipo |
| Respuesta | Si hay matches → top 3–5 con links; si faltan datos → preguntas concretas; si baja confianza → escalar humano |

#### "Listo" cuando
- Un lead escribe _"busco apto 2 dorm en Pocitos hasta 180k"_
- El sistema responde con **3 propiedades reales** del tenant y **1 pregunta final**

---

## 6. Issues por Épica (estilo GitHub)

### EPIC 0 — Repo / Infra / Docker-first

| # | Issue | DoD (Definition of Done) |
|---|-------|--------------------------|
| 0.1 | **[Infra]** Init monorepo Turborepo + pnpm | `pnpm -v`, `pnpm install`, `pnpm dev` corre (aunque sea "hello world") |
| 0.2 | **[Infra]** Docker compose: postgres + redis + api + worker + web + nginx | `docker compose up -d` levanta todo; healthchecks pasan |
| 0.3 | **[Infra]** CI build & push images con tags (GHCR) | Push a `main` genera `re-web`, `re-api`, `re-worker` con tag `sha` |
| 0.4 | **[Infra]** Compose prod: pull + up (sin build) | En server limpio, `compose pull && compose up -d` funciona |

### EPIC 1 — DB + Multi-tenant Core

| # | Issue | DoD |
|---|-------|-----|
| 1.1 | **[DB]** Prisma schema MVP + migrations | Migración aplicada; tablas creadas; seed crea tenant+owner |
| 1.2 | **[API]** PrismaService + Repository pattern base | API usa Prisma desde `@db`; no hay imports circulares |
| 1.3 | **[API]** Auth JWT (`tenantId` en token) | Login devuelve JWT; middleware extrae `tenantId` |
| 1.4 | **[API]** TenantGuard (enforce `tenantId` en endpoints) | Intentar acceder a otro tenant falla; tests básicos |

### EPIC 2 — CRM MVP (Leads)

| # | Issue | DoD |
|---|-------|-----|
| 2.1 | **[API]** Leads CRUD + filtros | Listar/crear/editar por tenant; paginación simple |
| 2.2 | **[WEB]** Dashboard shell + auth guard | Layout sidebar; rutas protegidas |
| 2.3 | **[WEB]** Leads board (sin drag) + detalle | Cambiar status/assignee; ver historial |
| 2.4 | **[API]** EventLog en cambios clave | Crear lead y cambiar stage deja `EventLog` |

### EPIC 3 — Channels Self-Service

| # | Issue | DoD |
|---|-------|-----|
| 3.1 | **[API]** Channels module + estados CONNECTING/CONNECTED | CRUD de channels por tenant |
| 3.2 | **[WA]** Evolution provider: create instance + get QR | Endpoint devuelve QR para tenant |
| 3.3 | **[WA]** Webhook WhatsApp inbound → Lead + Message | Mensaje entrante crea lead si no existe |
| 3.4 | **[WEB]** UI Conectar WhatsApp (QR view + status) | Admin escanea QR; status cambia a CONNECTED |
| 3.5 | **[TG]** Bot global: `/start TENANT_nonce` claim | Link start vincula chatId con tenant |
| 3.6 | **[WEB]** UI Conectar Telegram (start link) | Muestra link; confirma conectado |

### EPIC 4 — Mensajería Saliente + Templates

| # | Issue | DoD |
|---|-------|-----|
| 4.1 | **[API]** Templates CRUD | Crear template por tenant |
| 4.2 | **[API]** Send message endpoint (WhatsApp/Telegram) | Enviar texto o template; registra Message OUT |
| 4.3 | **[WEB]** Lead conversation UI | Ver IN/OUT; enviar desde UI |

### EPIC 5 — Meta Lead Ads (Webhook Único)

| # | Issue | DoD |
|---|-------|-----|
| 5.1 | **[API]** LeadSource META mapping (pageId/formId) | UI/endpoint para registrar mapping |
| 5.2 | **[API]** Webhook Meta inbound → Lead creado | Lead cae en tenant correcto; EventLog |

### EPIC 6 — Event-Driven + Worker + Retries

| # | Issue | DoD |
|---|-------|-----|
| 6.1 | **[Jobs]** BullMQ setup + producers | Webhook encola jobs; worker consume |
| 6.2 | **[Worker]** Processor: `lead.created` → run workflow | Workflow ejecuta acciones base (assign + send) |
| 6.3 | **[Worker]** Processor: `message.inbound` → update LeadProfile + reply (placeholder) | Al menos genera "pregunta siguiente" simple |
| 6.4 | **[WEB]** Logs/Actividad por tenant | Ver errors, envíos, conexiones en UI |

### EPIC 7 — Web Pública Multi-Tenant + Properties

| # | Issue | DoD |
|---|-------|-----|
| 7.1 | **[DB/API]** Properties CRUD + media | Crear/listar/activar propiedades por tenant |
| 7.2 | **[WEB]** Public site: listado + detalle + ISR | Tenant-domain muestra catálogo propio |
| 7.3 | **[WEB]** Formulario "Consultar" → crea lead + dispara workflow | Lead en CRM + mensaje automático |

### EPIC 8 — Contexto Real (MVP Agent)

| # | Issue | DoD |
|---|-------|-----|
| 8.1 | **[AI]** Extractor criterios → LeadProfile | Mensaje "2 dorm pocitos 180k" llena campos |
| 8.2 | **[Match]** Matching SQL top 3–5 propiedades | Respuesta incluye propiedades reales con links |
| 8.3 | **[Safety]** Escalado a humano / baja confianza | Si no hay matches, pregunta 1–2 datos y/o notifica agente |

### EPIC 9 — Operación

| # | Issue | DoD |
|---|-------|-----|
| 9.1 | **[Ops]** Health endpoint + compose healthchecks | `api/health` chequea DB+Redis; compose usa healthcheck |
| 9.2 | **[Ops]** Backups `pg_dump` + cron + retención | Backups diarios; borrado >14 días |
| 9.3 | **[Ops]** Documentación "2 comandos" para deploy | README: `pull + up + env-file`; sin pasos manuales raros |

---

## 7. Orden de Modelado

### Orden de modelado de DB (práctico)

```
1. Tenant, User, Domain
2. Lead, Message, EventLog
3. Channel (WhatsApp/Telegram)
4. Rule + Template
5. Property + Media
6. LeadProfile
```

### Orden de endpoints (práctico)

```
1. Auth + Tenants
2. Leads CRUD + Pipeline
3. Channels connect + Webhooks
4. Messages send
5. Rules
6. Properties (public endpoints)
```

---

## 8. Checklist MVP Vendible

Para cerrar clientes, el MVP debe tener:

- [ ] Multi-tenant aislado
- [ ] Onboarding wizard
- [ ] Conectar WhatsApp (QR)
- [ ] Conectar Telegram (bot global)
- [ ] Webhook Meta (mapping)
- [ ] CRM pipeline
- [ ] Web pública por tenant (dominio)
- [ ] Logs actividad
- [ ] Docker deploy replicable
- [ ] Backups + healthchecks

---

## 9. Web Personalizada (sin romper el producto)

> La "web personalizada" **NO es otro proyecto**: es tema + secciones + copy + assets dentro del mismo Next.js multi-tenant.

### 3 Niveles de personalización

| Nivel | Qué incluye | Esfuerzo |
|-------|-------------|----------|
| **Theme** | Logo, colores, hero, SEO | Rápido, replicable |
| **Secciones extra** | Testimonios, equipo, zonas | Config-driven (DB) |
| **Custom dev** | 1–2 componentes nuevos | Cobras extra, pero vuelve al core (beneficia a todos) |

---

## Estructura del Monorepo

```
inmoflow/
├── apps/
│   ├── api/          # NestJS backend
│   ├── web/          # Next.js frontend (public + dashboard)
│   └── worker/       # BullMQ worker (NestJS standalone)
├── packages/
│   ├── db/           # Prisma schema + client + migrations
│   └── shared/       # Types, events, Zod schemas, utils
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── Dockerfile.worker
│   └── nginx.conf
├── docker-compose.yml
├── docker-compose.prod.yml
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

---

> **Siguiente paso:** Ejecutar **Fase 1** — inicializar el monorepo, configurar Docker, schema Prisma y auth básica.
