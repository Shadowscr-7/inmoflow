# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**InmoFlow** is a multi-tenant SaaS CRM for real estate agencies, built as a monorepo with three apps:
- **`apps/api`** — NestJS REST API (port 4000)
- **`apps/web`** — Next.js 15 frontend (port 3000)
- **`apps/worker`** — NestJS background job processor (no HTTP, BullMQ)

Plus two shared packages:
- **`packages/db`** — Prisma schema + seed script
- **`packages/shared`** — Zod env schema, event types/topics

## Common Commands

All commands run from the repo root using `pnpm`.

```bash
# Development
pnpm dev                # Start all apps in watch mode (loads .env first via scripts/dev.mjs)

# Build
pnpm build              # Build all apps (order enforced by Turborepo)

# Lint / Type check
pnpm lint               # TypeScript check across all workspaces

# Database
pnpm db:generate        # Prisma client generation (run after schema changes)
pnpm db:migrate         # Interactive migration (dev)
pnpm db:migrate:deploy  # Apply migrations (production)
pnpm db:push            # Direct schema push without migration history
pnpm db:seed            # Seed demo data
pnpm db:studio          # Prisma Studio UI

# Docker
pnpm docker:up          # docker compose up -d (dev: postgres + redis + api + web + worker)
pnpm docker:down        # docker compose down
pnpm docker:logs        # docker compose logs -f
```

There is no test suite configured. Validation is handled at runtime via class-validator (DTOs), Zod (env vars), and Prisma (type safety).

## Architecture

### Multi-Tenancy
Every resource (leads, channels, rules, etc.) is scoped by `tenantId`. Auth guard extracts the tenant from JWT claims. All service methods receive `tenantId` explicitly — never infer it from context.

### Event-Driven Flow
1. API receives a request → creates/updates entities in Postgres via Prisma
2. API publishes a typed event to a Redis-backed BullMQ queue
3. Worker processor picks up the job and calls `RuleEngine.evaluate()`
4. Rule engine queries matching `Rule` rows (trigger + conditions + actions stored as JSON) and executes actions: send message, assign agent, trigger AI response, change lead stage
5. All mutations are logged to `EventLog` (audit trail)

**Three BullMQ queues:** `lead` (lead.created, lead.updated, lead.assigned, stage.changed), `message` (message.inbound, message.retry), `workflow` (generic execution).

### Key Architectural File
`apps/worker/src/services/rule-engine.service.ts` (~40KB) is the core automation brain. All workflow logic lives here.

### API Module Pattern
Each domain follows: `*.module.ts` → `*.controller.ts` (JWT-guarded routes) → `*.service.ts` (business logic) → `*.dto.ts` (class-validator). There are 30+ feature modules registered in `app.module.ts`.

### Worker Schedulers
The worker also runs cron jobs via `@nestjs/schedule`:
- `NoResponseScheduler` — escalates cold leads
- `FollowUpScheduler` — triggers follow-up sequences
- `AppointmentReminderScheduler` — visit reminders
- `QueueDrainScheduler` — queue health maintenance

### Frontend
Next.js App Router. Protected routes live under `apps/web/src/app/dashboard/`. Public property pages at `apps/web/src/app/p/`. Uses `NEXT_PUBLIC_API_URL` for all API calls.

## Environment Setup

Copy `.env.example` to `.env`. Minimum required vars for local dev:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis for BullMQ queues |
| `JWT_SECRET` | Token signing (min 16 chars) |
| `CORS_ORIGINS` | Frontend URL(s) allowed by API |
| `NEXT_PUBLIC_API_URL` | API base URL seen by the browser |

Optional integration vars (WhatsApp/Telegram/Meta/MercadoLibre/AI providers) are validated at worker startup with a warning (not a crash) if missing.

## Database Schema

Single Prisma schema at `packages/db/prisma/schema.prisma`. Key models: `Tenant`, `User`, `Lead`, `LeadProfile`, `Message`, `Channel`, `LeadSource`, `LeadStage`, `Rule`, `Template`, `Property`, `Visit`, `FollowUpSequence`, `AiConfig`, `EventLog`.

After any schema change: run `pnpm db:generate` to regenerate the Prisma client before building.

## Deployment

- **Dev:** `docker-compose.yml` (all services locally with exposed ports)
- **Prod:** `docker-compose.prod.yml` (Traefik reverse proxy, isolated volumes, memory limits, no exposed ports)
- Deployment scripts: `scripts/deploy.sh` (initial), `scripts/update.sh` (in-place updates), `scripts/backup.sh` (pg_dump)
