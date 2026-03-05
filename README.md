# InmoFlow

Plataforma SaaS multi-tenant para inmobiliarias.

## Stack

- **Backend:** NestJS + Prisma + PostgreSQL
- **Frontend:** Next.js (App Router) + Tailwind CSS
- **Worker:** NestJS + BullMQ + Redis
- **Infra:** Docker Compose + Turborepo + pnpm

## Estructura

```
inmoflow/
├── apps/
│   ├── api/          # NestJS backend (port 4000)
│   ├── web/          # Next.js frontend (port 3000)
│   └── worker/       # BullMQ worker
├── packages/
│   ├── db/           # Prisma schema + client
│   └── shared/       # Types, events, Zod schemas
├── docker/           # Dockerfiles + nginx
├── scripts/          # deploy, backup, health-check
├── docker-compose.yml       # Desarrollo
├── docker-compose.prod.yml  # Producción
└── INMOFLOW.md       # Spec completa
```

## Desarrollo local (sin Docker)

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar env
cp .env.example .env

# 3. Levantar Postgres + Redis (con Docker)
docker compose up postgres redis -d

# 4. Migrar DB + seed
pnpm db:migrate
pnpm db:seed

# 5. Dev (todos los apps en paralelo)
pnpm dev
```

## Desarrollo con Docker (todo containerizado)

```bash
# 1. Copiar env
cp .env.example .env

# 2. Levantar todo
docker compose up -d

# 3. Correr migraciones + seed
docker compose --profile migrate run migrate
```

## Deploy producción (Linux)

```bash
# Opción A: Script automático (recomendado)
chmod +x scripts/deploy.sh
sudo ./scripts/deploy.sh

# Opción B: Manual
cp .env.example .env.prod
# Editar .env.prod con valores reales (DOMAIN, passwords, JWT_SECRET)
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile migrate run --rm migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Operaciones en producción

```bash
# Ver estado de servicios
docker compose -f docker-compose.prod.yml ps

# Ver logs
docker compose -f docker-compose.prod.yml logs -f api

# Health check completo
./scripts/health-check.sh

# Backup manual
./scripts/backup.sh

# Restaurar backup
./scripts/backup.sh --restore backups/inmoflow_20260304.dump

# Rebuild tras actualización
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Endpoints

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/health` | Healthcheck (DB + Redis) |
| `POST /api/auth/login` | Login → JWT |
| `GET /api/plan` | Límites del plan del tenant |
| `POST /api/tenants` | Crear tenant |
| `PATCH /api/tenants/:id` | Actualizar plan |
| `GET /api/tenants/me` | Info del tenant (auth) |

## Planes

| Plan | Usuarios | Reglas | Canales | IA | Meta Leads |
|------|----------|--------|---------|-----|-----------|
| STARTER | 3 | 5 | WhatsApp + Web | ❌ | ❌ |
| PROFESSIONAL | 10 | ∞ | Todos | ✅ | ✅ |
| CUSTOM | ∞ | ∞ | Todos | ✅ | ✅ |

## Usuarios seed

| Email | Password | Rol | Tenant | Plan |
|-------|----------|-----|--------|------|
| admin@inmoflow.com | password123 | ADMIN (super) | — | — |
| admin@demoa.com | password123 | BUSINESS | Demo A | PROFESSIONAL |
| admin@demob.com | password123 | BUSINESS | Demo B | STARTER |
| agent@demoa.com | password123 | AGENT | Demo A | — |