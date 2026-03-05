# InmoFlow — Progreso del Desarrollo

> Documento de seguimiento acumulativo: qué se construyó, qué hay que configurar, qué probar.

---

## Índice

1. [Resumen de Fases](#resumen-de-fases)
2. [Fase 1 — Fundaciones](#fase-1--fundaciones)
3. [Fase 2 — CRM MVP](#fase-2--crm-mvp)
4. [Fase 3 — Canales Self-Service](#fase-3--canales-self-service)
5. [Fase 4 — Meta Lead Ads](#fase-4--meta-lead-ads)
6. [Fase 5 — Event-Driven + BullMQ + Templates & Workflows](#fase-5--event-driven--bullmq--templates--workflows)
7. [Configuración Completa (.env)](#configuración-completa-env)
7. [Cómo Levantar el Proyecto](#cómo-levantar-el-proyecto)
8. [Testing Manual por Fase](#testing-manual-por-fase)
9. [Estructura del Monorepo](#estructura-del-monorepo)
10. [Problemas Resueltos](#problemas-resueltos)
11. [Pendientes](#pendientes)

---

## Resumen de Fases

| Fase | Nombre | Estado |
|------|--------|--------|
| 0 | Especificación técnica | ✅ Completa |
| 1 | Fundaciones (monorepo, DB, auth, Docker) | ✅ Completa |
| 2 | CRM MVP (leads, pipeline, eventos, UI) | ✅ Completa |
| 3 | Canales Self-Service (WhatsApp, Telegram) | ✅ Completa |
| 4 | Meta Lead Ads (webhook, LeadSources) | ✅ Completa |
| 5 | Templates & Workflows | ✅ Completa |
| 6 | Propiedades & Portal | ⬜ Pendiente |
| 7 | Deploy & CI/CD | ⬜ Pendiente |

---

## Fase 1 — Fundaciones

### Qué se construyó

**Monorepo con pnpm + Turborepo:**
- `pnpm-workspace.yaml` → workspaces `apps/*` y `packages/*`
- `turbo.json` → pipelines `build`, `dev`, `lint`, `generate`
- `tsconfig.base.json` → ES2022, strict, commonjs
- `.gitignore`, `.env.example`, `.env`

**packages/shared:**
- `src/events/topics.ts` — 11 topics tipados (LEAD_CREATED, MESSAGE_INBOUND, CHANNEL_CONNECTED, etc.)
- `src/events/types.ts` — `BaseEvent<T,P>` genérico + payloads tipados
- `src/env.ts` — Validación de variables de entorno con Zod
- `src/index.ts` — Barrel export

**packages/db (Prisma + PostgreSQL):**
- `prisma/schema.prisma` — 16 modelos, 9 enums:
  - **Modelos:** Tenant, Domain, User, Channel, LeadStage, LeadSource, Lead, LeadProfile, Message, Template, Rule, Property, PropertyMedia, EventLog
  - **Enums:** UserRole, ChannelType, ChannelStatus, LeadSourceType, LeadStatus, MessageDirection, MessageChannel, EventType
- `src/index.ts` — PrismaClient singleton con caching global
- `src/seed.ts` — 2 tenants demo, users admin, 7 etapas de pipeline

**apps/api (NestJS 10.4):**
- Bootstrap en puerto 4000, CORS habilitado, prefijo `/api`, ValidationPipe global
- `PrismaModule` — global, PrismaService extiende PrismaClient
- `AuthModule` — JWT con passport-jwt
  - `AuthService` — login (bcrypt), hash
  - `AuthController` — `POST /api/auth/login`
  - `JwtStrategy`, `JwtAuthGuard`, `TenantGuard`
  - Decoradores `@TenantId()`, `@CurrentUser()`
- `TenantsModule` — create con etapas default, findById
- `HealthModule` — `GET /api/health` con check de DB

**apps/web (Next.js 15.2 App Router):**
- Tailwind CSS 3.4, standalone output mode
- Layout raíz con AuthProvider
- Landing page

**apps/worker (NestJS standalone):**
- BullMQ con 3 colas: lead, message, workflow
- `LeadProcessor` — maneja lead.created y lead.updated (placeholder)

**Docker:**
- `docker-compose.yml` — PostgreSQL 16, Redis 7, api, worker, web, migrate
- Dockerfiles multi-stage (node:20-alpine) para api, web, worker
- `nginx.conf` para web en producción

### Qué configurar (Fase 1)

1. **`.env`** — Copiar `.env.example` y ajustar:
   ```
   DATABASE_URL=postgresql://inmoflow:inmoflow@localhost:5432/inmoflow?schema=public
   REDIS_HOST=localhost
   REDIS_PORT=6379
   JWT_SECRET=tu-secret-key-segura
   ```
2. **PostgreSQL** — Levantar con Docker o local en puerto 5432
3. **Redis** — Puerto 6379
4. **Prisma** — Generar client y migrar:
   ```bash
   pnpm db:generate
   pnpm db:migrate   # o pnpm db:push para dev rápido
   pnpm db:seed
   ```

### Qué probar (Fase 1)

- `GET /api/health` → debe retornar `{ status: "ok", db: "connected" }`
- `POST /api/auth/login` con `{ "email": "admin@demoa.com", "password": "password123" }` → devuelve JWT
- Verificar que el JWT incluye `tenantId` y `sub` (userId)

---

## Fase 2 — CRM MVP

### Qué se construyó

**Backend (apps/api):**

- `EventLogModule` (Global) — registra toda actividad del tenant
  - `EventLogService` — `log(params)`, `findByTenant(tenantId, filters)`
  - `EventLogController` — `GET /api/event-logs?entity=Lead`
- `UsersModule`:
  - `UsersService` — create (con check de conflicto email+tenant), findAll
  - `UsersController` — `GET /api/users`, `POST /api/users`
- `LeadsModule` — CRUD completo:
  - `LeadsService`:
    - `create(tenantId, dto)` → crea lead + EventLog
    - `findAll(tenantId, filters)` → filtros por status/search, paginación offset/limit
    - `findById(tenantId, id)` → incluye messages + profile
    - `update(tenantId, id, dto)` → tracking de cambios en EventLog
    - `getStages(tenantId)` → etapas del pipeline
    - `getLeadsByStage(tenantId)` → leads agrupados por etapa
    - `getTimeline(tenantId, leadId)` → eventos del lead
  - `LeadsController`:
    - `GET /api/leads` — con query params `?search=&status=&limit=&offset=`
    - `GET /api/leads/stages`
    - `GET /api/leads/pipeline`
    - `POST /api/leads`
    - `GET /api/leads/:id`
    - `PATCH /api/leads/:id`
    - `GET /api/leads/:id/timeline`

**Frontend (apps/web):**

- `lib/api.ts` — Cliente API tipado completo (interfaces Lead, LeadsResponse, PipelineStage, EventLogEntry, User)
- `lib/auth.tsx` — AuthProvider con React context, localStorage, login/logout
- **Login** (`/login`) — Formulario email + password
- **Dashboard layout** (`/dashboard/layout.tsx`) — Auth guard, sidebar con 7 items de navegación, logout
- **Dashboard home** (`/dashboard`) — Stats dinámicas del API (total leads, nuevos, contactados, ganados)
- **Leads** (`/dashboard/leads`) — Tabla con búsqueda, filtro de estado, paginación, modal de creación
- **Lead detail** (`/dashboard/leads/[id]`) — Info de contacto, formulario de edición (status/etapa/asignado/notas), timeline
- **Pipeline** (`/dashboard/pipeline`) — Kanban con columnas por etapa, cambio de etapa via select
- **Actividad** (`/dashboard/activity`) — Tabla de eventos con filtro por entidad, iconos por tipo

### Qué configurar (Fase 2)

1. **`NEXT_PUBLIC_API_URL`** en `.env` → `http://localhost:4000` (ya configurado)
2. Los datos de seed ya incluyen leads? No — hay que crear leads manualmente o via API

### Qué probar (Fase 2)

1. Hacer login con `admin@demoa.com` / `password123`
2. Dashboard debe mostrar stats (todo en 0 al inicio)
3. Crear un lead desde el UI → verificar que aparece en la lista
4. Cambiar estado y etapa del lead → verificar timeline
5. Pipeline → verificar que el lead aparece en la columna correcta
6. Actividad → verificar que todos los eventos se registraron
7. **API directa:**
   ```bash
   # Crear lead
   curl -X POST http://localhost:4000/api/leads \
     -H "Authorization: Bearer <JWT>" \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Lead","phone":"+5491155551234","email":"test@test.com"}'

   # Pipeline
   curl http://localhost:4000/api/leads/pipeline -H "Authorization: Bearer <JWT>"
   ```

---

## Fase 3 — Canales Self-Service

### Qué se construyó

**Backend (apps/api):**

- `ChannelsModule`:
  - `ChannelsService` — CRUD, updateStatus, disconnect
  - `ChannelsController` — `GET /api/channels`, `POST /api/channels`, `DELETE /api/channels/:id`
  - **Exports:** ChannelsService, EvolutionProvider, TelegramProvider

- **WhatsApp (Evolution API):**
  - `providers/evolution.provider.ts`:
    - `createInstance(name)` → crea instancia en Evolution
    - `getQrCode(name)` → obtiene QR en base64
    - `getConnectionState(name)` → estado de la conexión
    - `sendText(instance, phone, text)` → envía mensaje
    - `logoutInstance(name)`, `deleteInstance(name)`
  - `webhooks.controller.ts`:
    - `POST /api/webhooks/whatsapp` — recibe webhooks de Evolution:
      - `connection.update` → actualiza estado del canal
      - `messages.upsert` → auto-crea leads por teléfono, guarda mensajes IN, registra EventLog
    - `POST /api/channels/whatsapp/connect` → crea instancia Evolution + retorna QR
    - `GET /api/channels/whatsapp/qr` → refresca QR (con check de estado)
    - `POST /api/channels/whatsapp/disconnect`

- **Telegram (Bot API con long-polling):**
  - `providers/telegram.provider.ts`:
    - Bot global con long-polling (sin webhooks)
    - Handler `/start NONCE` → decodifica base64url nonce → extrae tenantId, crea/actualiza canal
    - Handler mensajes inbound → encuentra canal por chatId → crea/busca lead por telegramUserId → guarda Message IN + EventLog
    - `sendMessage(chatId, text)` — envía mensaje
    - `generateStartLink(tenantId)` — genera link `t.me/BOT?start=NONCE`
  - Endpoints:
    - `POST /api/channels/telegram/connect` → genera start link
    - `GET /api/channels/telegram/status` → verifica si el canal está conectado

- `MessagesModule`:
  - `MessagesService`:
    - `findByLead(tenantId, leadId, limit, offset)` → mensajes paginados
    - `send(tenantId, leadId, content, channel?)` → envía via WA o TG (resolución automática de canal)
  - `MessagesController`:
    - `GET /api/messages/:leadId`
    - `POST /api/messages/:leadId/send`

**Frontend (apps/web):**

- **Canales** (`/dashboard/channels`):
  - Botón "Conectar WhatsApp" → muestra QR code con polling automático de estado
  - Botón "Conectar Telegram" → genera link de inicio + botón para verificar
  - Tabla de todos los canales con estado visual
- **Conversación** (`/dashboard/leads/[id]/conversation`):
  - UI de chat con burbujas IN/OUT
  - Selector de canal (WA/TG)
  - Polling cada 5 segundos para nuevos mensajes
  - Campo para enviar mensaje
- **Lead detail** — botón "Chat" que lleva a la conversación

### Qué configurar (Fase 3)

1. **Evolution API (WhatsApp):**
   - Levantar Evolution API (Docker o similar) en `http://localhost:8080`
   - Configurar en `.env`:
     ```
     EVOLUTION_API_URL=http://localhost:8080
     EVOLUTION_API_KEY=tu-api-key-de-evolution
     ```
   - Configurar webhook de Evolution para que apunte a `http://tu-host:4000/api/webhooks/whatsapp`
   - Los eventos que debe enviar: `connection.update`, `messages.upsert`

2. **Telegram Bot:**
   - Crear bot con @BotFather en Telegram
   - Copiar el token y configurar en `.env`:
     ```
     TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
     ```
   - El bot usa long-polling, no necesita webhook externo
   - El bot arranca automáticamente cuando se inicia la API

3. **URL pública (para producción):**
   - La API necesita ser accesible desde internet para los webhooks de Evolution
   - En local se puede usar ngrok: `ngrok http 4000`
   - Configurar `PLATFORM_DOMAIN` en `.env`

### Qué probar (Fase 3)

1. **WhatsApp:**
   - Ir a Canales → "Conectar WhatsApp"
   - Escanear el QR con WhatsApp
   - Verificar que el estado cambia a "CONNECTED"
   - Enviar un mensaje desde WhatsApp → debe crear un Lead automáticamente
   - Responder desde el chat del lead en InmoFlow

2. **Telegram:**
   - Ir a Canales → "Conectar Telegram"
   - Hacer click en el link de inicio
   - Enviar `/start` al bot desde Telegram
   - Estado debe cambiar a "CONNECTED"
   - Enviar mensaje → debe crear Lead
   - Responder desde InmoFlow

3. **API directa:**
   ```bash
   # Listar canales
   curl http://localhost:4000/api/channels -H "Authorization: Bearer <JWT>"

   # Enviar mensaje a un lead
   curl -X POST http://localhost:4000/api/messages/<LEAD_ID>/send \
     -H "Authorization: Bearer <JWT>" \
     -H "Content-Type: application/json" \
     -d '{"content":"Hola, ¿en qué te puedo ayudar?","channel":"WHATSAPP"}'
   ```

---

## Fase 4 — Meta Lead Ads

### Qué se construyó

**Backend (apps/api):**

- `LeadSourcesModule`:
  - `LeadSourcesService` — CRUD completo:
    - `findAll(tenantId, type?)` — lista con filtro opcional
    - `findById(tenantId, id)`
    - `findByMetaMapping(pageId, formId)` — busca fuente por mapeo Meta (para webhook)
    - `create(tenantId, dto)` — con validación unique para META (pageId+formId+tenantId)
    - `update(tenantId, id, dto)` + EventLog
    - `delete(tenantId, id)`
  - `LeadSourcesController`:
    - `GET /api/lead-sources?type=META_LEAD_AD`
    - `GET /api/lead-sources/:id`
    - `POST /api/lead-sources`
    - `PATCH /api/lead-sources/:id`
    - `DELETE /api/lead-sources/:id`

- `MetaWebhookController` — endpoint público (sin auth):
  - `GET /api/webhooks/meta` — Verificación del webhook de Meta (hub.verify_token challenge)
  - `POST /api/webhooks/meta` — Recibe leads de Meta Lead Ads:
    1. Parsea payload de Facebook (object: "page", entry[].changes[].field: "leadgen")
    2. Extrae pageId + formId
    3. Busca LeadSource por `findByMetaMapping(pageId, formId)` → resuelve tenantId
    4. Fetch opcional a Graph API (`/v19.0/{leadgen_id}`) si hay `META_PAGE_ACCESS_TOKEN`
    5. Crea Lead con source = LeadSource + EventLog
  - Variable de verificación: `META_VERIFY_TOKEN` (default: `inmoflow-meta-verify`)

**Frontend (apps/web):**

- API client actualizado con: `LeadSource` interface, `api.getLeadSources()`, `api.createLeadSource()`, `api.updateLeadSource()`, `api.deleteLeadSource()`
- **Configuración** (`/dashboard/settings`):
  - Listado de fuentes de leads con enable/disable toggle
  - Formulario para crear nueva fuente (tipo, nombre, Page ID, Form ID)
  - Instrucciones inline para configurar webhook en Meta Business Suite
  - Botón eliminar con confirmación

### Qué configurar (Fase 4)

1. **Variables de entorno nuevas:**
   ```env
   # Token de verificación para el webhook de Meta (debe coincidir con el que configuras en Facebook)
   META_VERIFY_TOKEN=inmoflow-meta-verify

   # (Opcional) Page Access Token para obtener datos completos del lead via Graph API
   META_PAGE_ACCESS_TOKEN=EAAxxxxxxx...
   ```

2. **Configurar webhook en Meta/Facebook:**
   - Ir a [Facebook Developers](https://developers.facebook.com/apps)
   - Seleccionar tu App → Webhooks → Suscribir a "Page"
   - **Callback URL:** `https://tu-dominio.com/api/webhooks/meta`
   - **Verify Token:** `inmoflow-meta-verify` (o el valor de `META_VERIFY_TOKEN`)
   - **Suscribirse al campo:** `leadgen`
   - La App necesita permisos: `pages_manage_ads`, `leads_retrieval`

3. **Configurar mapeo en InmoFlow:**
   - Ir a `/dashboard/settings` en InmoFlow
   - Crear una fuente tipo "Meta Lead Ad"
   - Ingresar el **Page ID** y el **Form ID** del formulario de Lead Ads
   - Estos IDs se obtienen del Business Suite de Meta

### Qué probar (Fase 4)

1. **Verificación del webhook:**
   ```bash
   curl "http://localhost:4000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=inmoflow-meta-verify&hub.challenge=test123"
   # Debe retornar: test123
   ```

2. **Simular un lead de Meta:**
   ```bash
   # Primero crear un LeadSource mapping
   curl -X POST http://localhost:4000/api/lead-sources \
     -H "Authorization: Bearer <JWT>" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Mi campaña FB",
       "type": "META_LEAD_AD",
       "metaPageId": "123456789",
       "metaFormId": "987654321"
     }'

   # Luego simular el webhook de Meta
   curl -X POST http://localhost:4000/api/webhooks/meta \
     -H "Content-Type: application/json" \
     -d '{
       "object": "page",
       "entry": [{
         "id": "123456789",
         "time": 1700000000,
         "changes": [{
           "field": "leadgen",
           "value": {
             "form_id": "987654321",
             "leadgen_id": "LEAD123456",
             "page_id": "123456789",
             "created_time": 1700000000
           }
         }]
       }]
     }'
   # Debe retornar: {"received":true,"processed":1}
   ```

3. **UI:**
   - Ir a `/dashboard/settings`
   - Crear una fuente Meta Lead Ad
   - Verificar que aparece en la tabla con estado "Activo"
   - Toggle a "Inactivo" y verificar persistencia
   - Eliminar una fuente

4. **Verificar lead creado:**
   - Después del webhook simulado, ir a `/dashboard/leads`
   - Debe aparecer un lead nuevo con nombre "Meta Lead LEAD12" (últimos 6 chars del leadgen_id)
   - La fuente debe ser "Mi campaña FB"

---

## Fase 5 — Event-Driven + BullMQ + Templates & Workflows

### Qué se construyó

**Nuevos EventType en Prisma:**
- Se agregaron 6 nuevos valores al enum `EventType`: `template_created`, `template_updated`, `template_deleted`, `rule_created`, `rule_updated`, `rule_deleted`
- Se regeneró el Prisma Client

**Templates CRUD (apps/api/src/templates/):**
- `templates.service.ts` — CRUD completo con filtros por canal y estado, validación de key única, método `renderContent()` para {{placeholders}}
- `templates.controller.ts` — REST en `/templates` (GET list, GET /:id, POST, PATCH /:id, DELETE /:id), protegido con JwtAuthGuard + TenantGuard
- `templates.module.ts` — Importa PrismaModule, exporta TemplatesService

**Rules CRUD (apps/api/src/rules/):**
- `rules.service.ts` — CRUD con filtros por trigger/enabled, `findMatchingRules()` por trigger + prioridad, `evaluateConditions()` para condiciones JSON
- 6 tipos de acción definidos: `assign`, `send_template`, `change_status`, `change_stage`, `add_note`, `notify`
- `rules.controller.ts` — REST en `/rules` (GET, GET /:id, POST, PATCH /:id, DELETE /:id)
- `rules.module.ts` — Importa PrismaModule, exporta RulesService

**EventProducer (apps/api/src/events/):**
- `event-producer.service.ts` — Servicio que inyecta 3 colas BullMQ: `lead`, `message`, `workflow`
  - `emitLeadCreated()` / `emitLeadUpdated()` → cola `lead`
  - `emitMessageInbound()` → cola `message`
  - `emitWorkflowExecute()` → cola `workflow`
  - Todos los jobs con 3 reintentos, backoff exponencial, cleanup automático
- `event-producer.module.ts` — Módulo Global con BullModule.forRoot (Redis) + 3 colas registradas

**Integración de emisión de eventos en módulos existentes:**
- `leads.service.ts` → `emitLeadCreated` después de crear lead, `emitLeadUpdated` después de actualizar
- `webhooks.controller.ts` → `emitLeadCreated` al auto-crear lead por WhatsApp, `emitMessageInbound` al recibir mensaje WA
- `telegram.provider.ts` → `emitLeadCreated` al auto-crear lead por Telegram, `emitMessageInbound` al recibir mensaje TG
- `meta-webhook.controller.ts` → `emitLeadCreated` al crear lead desde Meta Lead Ad

**Rule Engine (apps/worker/src/services/):**
- `rule-engine.service.ts` (347 líneas) — Motor de reglas completo:
  - `evaluate(tenantId, trigger, leadId, context)` → busca reglas, evalúa condiciones, ejecuta acciones
  - Evaluación de condiciones: key-value matching, arrays = OR, vacío = siempre match
  - 6 handlers de acción:
    - `actionAssign` — asignar userId directo o `round_robin` (agente con menos leads)
    - `actionSendTemplate` — busca plantilla por key, renderiza {{placeholders}}, crea mensaje OUT
    - `actionChangeStatus` — actualiza lead.status
    - `actionChangeStage` — resuelve stage por key, actualiza lead.stageId
    - `actionAddNote` — agrega nota timestamped a lead.notes
    - `actionNotify` — registra EventLog (placeholder para push/email)
  - Logs `workflow_executed` y `workflow_failed` a EventLog

**Procesadores (apps/worker/src/processors/):**
- `lead.processor.ts` — Reescrito: inyecta RuleEngineService, maneja `lead.created` y `lead.updated`
- `message.processor.ts` — Nuevo: maneja `message.inbound`, invoca rule engine con contexto de canal
- `workflow.processor.ts` — Nuevo: maneja `workflow.execute` para ejecución manual desde la UI

**Frontend — Templates UI (`/dashboard/templates`):**
- Tabla con key, nombre, canal, contenido (truncado), toggle activo/inactivo
- Filtros por canal y estado
- Modal crear/editar: key (inmutable), nombre, canal, contenido con placeholders, toggle enabled
- Delete con confirmación

**Frontend — Rules/Automatizaciones UI (`/dashboard/rules`):**
- Cards con nombre, trigger badge, prioridad, preview de condiciones y acciones
- Toggle enabled, filtro por trigger
- Modal crear/editar: nombre, trigger dropdown, prioridad, condiciones JSON, builder de acciones
- Builder de acciones: selector de tipo + campos dinámicos por tipo (userId, templateKey, status, stage, nota, notificación)
- Agregar/eliminar acciones dinámicamente

**Navegación actualizada:**
- Sidebar: añadidos "📝 Plantillas" (`/dashboard/templates`) y "⚡ Automatizaciones" (`/dashboard/rules`)

### Archivos creados/modificados

**Nuevos:**
| Archivo | Descripción |
|---------|-------------|
| `apps/api/src/templates/templates.service.ts` | CRUD + renderContent |
| `apps/api/src/templates/templates.controller.ts` | REST endpoints |
| `apps/api/src/templates/templates.module.ts` | Módulo NestJS |
| `apps/api/src/rules/rules.service.ts` | CRUD + evaluateConditions |
| `apps/api/src/rules/rules.controller.ts` | REST endpoints |
| `apps/api/src/rules/rules.module.ts` | Módulo NestJS |
| `apps/api/src/events/event-producer.service.ts` | 3 colas BullMQ |
| `apps/api/src/events/event-producer.module.ts` | Módulo Global |
| `apps/worker/src/services/rule-engine.service.ts` | Motor de reglas |
| `apps/worker/src/processors/message.processor.ts` | Procesador mensajes |
| `apps/worker/src/processors/workflow.processor.ts` | Procesador workflows |
| `apps/web/src/app/dashboard/templates/page.tsx` | UI de plantillas |
| `apps/web/src/app/dashboard/rules/page.tsx` | UI de automatizaciones |

**Modificados:**
| Archivo | Cambio |
|---------|--------|
| `packages/db/prisma/schema.prisma` | +6 EventType enum values |
| `apps/api/src/app.module.ts` | +EventProducerModule, +TemplatesModule, +RulesModule |
| `apps/api/src/leads/leads.service.ts` | +EventProducerService, emit después de create/update |
| `apps/api/src/channels/webhooks.controller.ts` | +EventProducerService, emit para WA leads/msgs |
| `apps/api/src/channels/providers/telegram.provider.ts` | +EventProducerService, emit para TG leads/msgs |
| `apps/api/src/lead-sources/meta-webhook.controller.ts` | +EventProducerService, emit para Meta leads |
| `apps/worker/src/processors/lead.processor.ts` | Reescrito con RuleEngineService |
| `apps/worker/src/worker.module.ts` | +MessageProcessor, +WorkflowProcessor, +RuleEngineService |
| `apps/web/src/lib/api.ts` | +Template/Rule interfaces, +12 CRUD methods |
| `apps/web/src/app/dashboard/layout.tsx` | +Plantillas y +Automatizaciones en sidebar |

### Flujo de eventos

```
Lead creado/actualizado o mensaje entrante
    │
    ▼
EventProducerService (API)
    │ emitLeadCreated / emitMessageInbound / etc.
    ▼
BullMQ Queue (Redis)  →  lead | message | workflow
    │
    ▼
Processor (Worker)  →  LeadProcessor | MessageProcessor | WorkflowProcessor
    │
    ▼
RuleEngineService.evaluate()
    │ 1. Busca reglas por trigger + tenantId
    │ 2. Ordena por prioridad (desc)
    │ 3. Evalúa condiciones JSON vs contexto
    │ 4. Ejecuta acciones de reglas que matchean
    ▼
Acciones: assign | send_template | change_status | change_stage | add_note | notify
```

### Cómo probar

1. **Templates:**
   - Ir a `/dashboard/templates`
   - Crear plantilla: key `welcome_wa`, canal "WHATSAPP", contenido `Hola {{nombre}}, bienvenido`
   - Verificar que aparece en la tabla, toggle enabled/disabled

2. **Rules:**
   - Ir a `/dashboard/rules`
   - Crear regla: trigger "Lead creado", condiciones `{ "sourceType": "WHATSAPP" }`, acción "Enviar plantilla" con key `welcome_wa`
   - Verificar que aparece con badge de trigger y preview de acciones

3. **Flujo completo (requiere Docker + Redis):**
   ```bash
   docker compose up postgres redis -d
   pnpm --filter @inmoflow/api dev   # en terminal 1
   pnpm --filter @inmoflow/worker dev # en terminal 2
   pnpm --filter @inmoflow/web dev   # en terminal 3
   ```
   - Crear una plantilla y una regla con trigger `lead.created`
   - Crear un lead nuevo → el API emite a BullMQ → Worker procesa → RuleEngine evalúa y ejecuta
   - Verificar en EventLog que aparece `workflow_executed`

### Dependencias nuevas

```bash
# apps/api
@nestjs/bullmq ^10.2.0
bullmq ^5.30.0
ioredis ^5.4.0
```

### Variables de entorno necesarias

```env
# Redis (ya incluida desde docker-compose)
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Configuración Completa (.env)

```env
# ─── Database ──────────────────────────────
DATABASE_URL=postgresql://inmoflow:inmoflow@localhost:5432/inmoflow?schema=public

# ─── Redis ─────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ─── Auth ──────────────────────────────────
JWT_SECRET=change-me-in-production-super-secret-key
JWT_EXPIRES_IN=7d

# ─── API ───────────────────────────────────
API_PORT=4000
NODE_ENV=development

# ─── Web ───────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000

# ─── Evolution API (WhatsApp) ──────────────
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=change-me

# ─── Telegram ──────────────────────────────
TELEGRAM_BOT_TOKEN=change-me

# ─── Meta / Facebook ──────────────────────
META_VERIFY_TOKEN=inmoflow-meta-verify
META_PAGE_ACCESS_TOKEN=              # Opcional: para fetch completo de datos del lead

# ─── Platform ─────────────────────────────
PLATFORM_DOMAIN=tuplataforma.com
```

---

## Cómo Levantar el Proyecto

### Prerequisitos
- Node.js 20+
- pnpm 10.17+
- PostgreSQL 16 y Redis 7 (via Docker o local)

### Pasos

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar infra (PostgreSQL + Redis)
docker compose up postgres redis -d

# 3. Generar Prisma Client
pnpm db:generate

# 4. Migrar base de datos
pnpm db:push          # dev rápido (sin migrations)
# O: pnpm db:migrate  # con migrations

# 5. Seed de datos de prueba
pnpm db:seed

# 6. Levantar todo en dev
pnpm dev
```

Esto levanta:
- **API** en `http://localhost:4000` (NestJS)
- **Web** en `http://localhost:3000` (Next.js)
- **Worker** en background (BullMQ)

### Cuentas de prueba (del seed)

| Email | Password | Tenant |
|-------|----------|--------|
| admin@demoa.com | password123 | Inmobiliaria Demo A |
| agent@demoa.com | password123 | Inmobiliaria Demo A |
| admin@demob.com | password123 | Inmobiliaria Demo B |

---

## Testing Manual por Fase

### Smoke test rápido (todas las fases)

```bash
# 1. Health check
curl http://localhost:4000/api/health

# 2. Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demoa.com","password":"password123"}' | jq -r '.access_token')

# 3. Listar leads
curl -s http://localhost:4000/api/leads -H "Authorization: Bearer $TOKEN" | jq '.total'

# 4. Crear lead
curl -s -X POST http://localhost:4000/api/leads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Lead","phone":"+5491155551234"}' | jq '.id'

# 5. Pipeline
curl -s http://localhost:4000/api/leads/pipeline -H "Authorization: Bearer $TOKEN" | jq '.[0].name'

# 6. Canales
curl -s http://localhost:4000/api/channels -H "Authorization: Bearer $TOKEN" | jq 'length'

# 7. Fuentes de leads
curl -s http://localhost:4000/api/lead-sources -H "Authorization: Bearer $TOKEN" | jq 'length'

# 8. Meta webhook verification
curl "http://localhost:4000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=inmoflow-meta-verify&hub.challenge=OK"
```

---

## Estructura del Monorepo

```
inmoflow/
├── apps/
│   ├── api/                          # NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts               # Bootstrap (port 4000, CORS, /api prefix)
│   │   │   ├── app.module.ts          # Root module (imports all)
│   │   │   ├── prisma/               # PrismaModule (Global)
│   │   │   ├── auth/                 # JWT auth, guards, decorators
│   │   │   ├── tenants/              # Tenant CRUD
│   │   │   ├── health/               # GET /health
│   │   │   ├── event-log/            # EventLog (Global) — all tenant activity
│   │   │   ├── users/                # Users CRUD
│   │   │   ├── leads/                # Leads CRUD, pipeline, timeline
│   │   │   ├── channels/             # Channels + Providers + Webhooks
│   │   │   │   ├── channels.service.ts
│   │   │   │   ├── channels.controller.ts
│   │   │   │   ├── webhooks.controller.ts    # WhatsApp webhook
│   │   │   │   └── providers/
│   │   │   │       ├── evolution.provider.ts  # WhatsApp via Evolution API
│   │   │   │       └── telegram.provider.ts   # Telegram bot long-polling
│   │   │   ├── messages/             # Messages send/receive
│   │   │   └── lead-sources/         # LeadSources CRUD + Meta webhook
│   │   │       ├── lead-sources.service.ts
│   │   │       ├── lead-sources.controller.ts
│   │   │       ├── lead-sources.module.ts
│   │   │       └── meta-webhook.controller.ts
│   │   └── tsconfig.json
│   │
│   ├── web/                          # Next.js 15 frontend
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── api.ts            # Typed API client (all endpoints)
│   │   │   │   └── auth.tsx          # AuthProvider + useAuth()
│   │   │   └── app/
│   │   │       ├── page.tsx          # Landing
│   │   │       ├── login/page.tsx    # Login form
│   │   │       └── dashboard/
│   │   │           ├── layout.tsx    # Auth guard + sidebar
│   │   │           ├── page.tsx      # Stats home
│   │   │           ├── leads/        # Leads list + detail + conversation
│   │   │           ├── pipeline/     # Kanban board
│   │   │           ├── activity/     # Event log table
│   │   │           ├── channels/     # WA/TG connect + status
│   │   │           └── settings/     # Lead Sources (Meta config)
│   │   └── tsconfig.json
│   │
│   └── worker/                       # BullMQ background jobs
│       ├── src/
│       │   ├── main.ts
│       │   ├── worker.module.ts
│       │   └── processors/
│       │       └── lead.processor.ts
│       └── tsconfig.json
│
├── packages/
│   ├── shared/                       # Event types, env validation
│   │   └── src/
│   │       ├── events/
│   │       │   ├── topics.ts
│   │       │   └── types.ts
│   │       ├── env.ts
│   │       └── index.ts
│   │
│   └── db/                           # Prisma schema + client
│       ├── prisma/
│       │   └── schema.prisma         # 16 models, 9 enums
│       └── src/
│           ├── index.ts              # PrismaClient singleton
│           └── seed.ts               # Demo data
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   ├── Dockerfile.worker
│   └── nginx.conf
│
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env / .env.example
├── INMOFLOW.md                       # Spec técnica completa
└── PROGRESS.md                       # ← este archivo
```

---

## Problemas Resueltos

| # | Problema | Solución |
|---|----------|----------|
| 1 | Prisma missing inverse relations (LeadProfile, PropertyMedia → Tenant) | Agregamos `leadProfiles LeadProfile[]` y `propertyMedia PropertyMedia[]` al modelo Tenant |
| 2 | `Record<string, unknown>` no asignable a `InputJsonValue` | Cast explícito `(value as Prisma.InputJsonValue)` en todos los `.create()` con payload JSON |
| 3 | `ChannelStatus` type narrowing — `let newStatus = ChannelStatus.CONNECTING` inferido como literal | `let newStatus: ChannelStatus = ...` con anotación explícita |
| 4 | Frontend: `alert` y `e.target.value` no reconocidos | Agregamos `"lib": ["dom", "dom.iterable", "esnext"]` al tsconfig de web |
| 5 | `EventLogEntry.action` no existe | Prisma usa `type` (EventType enum), no `action` — corregimos todas las referencias |
| 6 | `lead.source` renderizado como objeto | Cambiamos a `lead.source?.name` |
| 7 | Import de `@prisma/client` falla en api | Usar `@inmoflow/db` para importar Prisma types |
| 8 | Docker daemon not running | Docker Desktop no iniciado — no bloqueante para dev local |
| 9 | `pnpm approve-builds` prompt interactivo | Workaround: `npx prisma generate` directo |

---

## Fase 5.5 — Hardening & Polish

### Qué se hizo

**Validación de DTOs (CRÍTICO):**
- Todos los DTOs eran interfaces TypeScript → no hacían nada con `ValidationPipe`
- Creados 8 archivos DTO con class-validator decorators:
  - `auth/dto.ts`, `leads/dto.ts`, `templates/dto.ts`, `rules/dto.ts`
  - `users/dto.ts`, `lead-sources/dto.ts`, `tenants/dto.ts`, `channels/dto.ts`
- 9 controllers actualizados para usar DTOs class-based
- Instalado `class-transformer` para `@Type()` en nested DTOs

**Migraciones Prisma:**
- Generada migración inicial `0001_init/migration.sql` via `prisma migrate diff`
- Creado `migration_lock.toml` (provider: postgresql)
- Ya no se depende solo de `db:push`

**Seguridad:**
- CORS restringido a `CORS_ORIGINS` (antes era `*`)
- Rate limiting global: `@nestjs/throttler` — 60 req/min
- Global exception filter: `AllExceptionsFilter` (oculta stack traces en prod)
- JWT expiry check en frontend con 30s buffer
- Auto-logout en 401 via `setOnUnauthorized` pattern
- API client con timeout de 15s + AbortController

**Seed mejorado:**
- Ahora usa bcrypt (compatible con login del API, con fallback a SHA-256)
- 1 AGENT user por tenant (`agent@demoa.com`, `agent@demob.com`)
- 5 leads de ejemplo por tenant con distintos status/stages
- 2 templates de ejemplo (WhatsApp + Telegram)
- 2 reglas de automatización (auto-assign + auto-welcome)

**Dashboard:**
- Canal count real (fetch + filtro por `CONNECTED`)
- Removido texto placeholder "Fase 3"

**DevX:**
- Scripts raíz: `typecheck`, `db:migrate:deploy`, `db:studio`, `docker:up/down/logs`
- `.env` y `.env.example` sincronizados con todas las variables

---

## Pendientes

### Fase 5 — Templates & Workflows
- [x] Modelo ya existe en Prisma: `Template`, `Rule`
- [x] CRUD de templates (HTML/texto con placeholders)
- [x] Motor de reglas (event → condition → action)
- [x] Ejecución en el Worker via BullMQ

### Fase 6 — Propiedades & Portal
- [ ] Modelo ya existe: `Property`, `PropertyMedia`
- [ ] CRUD de propiedades con galería de imágenes
- [ ] Portal público por dominio del tenant
- [ ] Match lead ↔ propiedad

### Fase 7 — Deploy & CI/CD
- [ ] GitHub Actions para build + test
- [ ] Deploy a Azure / AWS / Railway
- [ ] Previews por PR
- [ ] Monitoring y alertas

### Mejoras técnicas pendientes
- [x] ~~Agregar `META_VERIFY_TOKEN` y `META_PAGE_ACCESS_TOKEN` al `.env`~~ ✅
- [ ] Tests unitarios y de integración
- [x] ~~Rate limiting en endpoints públicos~~ ✅ Throttler 60 req/min
- [x] ~~Validación de DTO con class-validator en todos los controllers~~ ✅ 8 DTOs
- [ ] OAuth de Meta (en lugar de token pegado)
- [x] ~~Migration files de Prisma (actualmente solo db:push)~~ ✅ 0001_init
- [ ] Logging estructurado (Pino o Winston)
- [ ] Tests E2E con Playwright o Cypress
- [ ] Backups automáticos de PostgreSQL
- [ ] Health check endpoint (`/health`)
