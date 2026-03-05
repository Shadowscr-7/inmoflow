# InmoFlow — Guía de Instalación

> CRM Multi-Tenant para Inmobiliarias · NestJS + Next.js + Prisma + BullMQ

---

## Requisitos Previos

| Herramienta            | Versión mínima | Verificar con              |
| ---------------------- | -------------- | -------------------------- |
| **Node.js**            | 20 LTS         | `node -v`                  |
| **pnpm**               | 10.x           | `pnpm -v`                  |
| **Docker + Compose**   | 24 / V2        | `docker compose version`   |
| **Git** (opcional)     | 2.x            | `git --version`            |

> Si no tienes pnpm: `corepack enable && corepack prepare pnpm@10.17.1 --activate`

---

## Estructura del Proyecto

```
inmoflow/
├── apps/
│   ├── api/          # NestJS — REST API (puerto 4000)
│   ├── web/          # Next.js — Frontend (puerto 3000)
│   └── worker/       # NestJS — Worker BullMQ (procesamiento async)
├── packages/
│   ├── db/           # Prisma schema, migraciones, seed
│   └── shared/       # DTOs y tipos compartidos
├── docker/           # Dockerfiles + nginx.conf
├── scripts/          # dev.mjs (script de desarrollo)
├── docker-compose.yml
└── .env.example
```

---

## Opción A — Desarrollo Local (recomendado para desarrollo)

### 1. Clonar / Descomprimir

```bash
# Si viene de un .zip:
unzip inmoflow.zip
cd inmoflow
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus valores. Para desarrollo local basta con cambiar los puertos si hay conflictos:

```dotenv
# ─── Database ──────────────────────────────
DATABASE_URL=postgresql://inmoflow:inmoflow@localhost:5433/inmoflow?schema=public

# ─── Redis ─────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6381

# ─── Auth ──────────────────────────────────
JWT_SECRET=change-me-in-production-super-secret-key
JWT_EXPIRES_IN=7d

# ─── API ───────────────────────────────────
API_PORT=4000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000

# ─── Web ───────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000

# ─── Evolution API (WhatsApp) ──────────────
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=change-me

# ─── Telegram ──────────────────────────────
TELEGRAM_BOT_TOKEN=change-me

# ─── Meta / Facebook ──────────────────────
META_VERIFY_TOKEN=inmoflow-meta-verify
META_PAGE_ACCESS_TOKEN=
```

> **Nota:** Los puertos 5433 (Postgres) y 6381 (Redis) evitan conflictos con instancias locales existentes.

### 3. Levantar Postgres y Redis con Docker

```bash
docker compose up -d postgres redis
```

Verificar que estén sanos:
```bash
docker compose ps
# Ambos deben mostrar "healthy"
```

### 4. Instalar dependencias

```bash
pnpm install
```

### 5. Generar Prisma Client y ejecutar migraciones

```bash
pnpm db:generate
pnpm db:migrate
```

### 6. Sembrar datos iniciales (seed)

```bash
pnpm db:seed
```

Esto crea:
- **Tenants:** InmoFlow (super), Demo A (Professional), Demo B (Starter)
- **Usuarios:**
  - `admin@inmoflow.com` / `password123` → Super Admin
  - `admin@demoa.com` / `password123` → Business (Tenant A, Plan Professional)
  - `admin@demob.com` / `password123` → Business (Tenant B, Plan Starter)
  - `agent@demoa.com` / `password123` → Agent (Tenant A)
- **Stages del embudo:** Nuevo → Contactado → Visita → Negociación → Cerrado

### 7. Arrancar en modo desarrollo

```bash
pnpm dev
```

Esto arranca en paralelo:
| Servicio | URL                          |
| -------- | ---------------------------- |
| API      | http://localhost:4000/api     |
| Web      | http://localhost:3000         |
| Worker   | (background, sin puerto)     |

### 8. Verificar

- Abrir http://localhost:3000
- Login: `admin@demoa.com` / `password123`
- Health check: `curl http://localhost:4000/api/health`

---

## Opción B — Todo con Docker Compose (producción / demo rápido)

Esta opción levanta **todo** containerizado (Postgres, Redis, API, Worker, Web).

### 1. Configurar .env

```bash
cp .env.example .env
# Editar JWT_SECRET con un secreto seguro para producción
```

### 2. Ejecutar migraciones + seed

```bash
docker compose --profile migrate up migrate
```

### 3. Levantar todos los servicios

```bash
docker compose up -d
```

### 4. Verificar

```bash
docker compose ps
# Todos healthy

docker compose logs -f api
# Debe mostrar: API running on http://localhost:4000/api
```

Abrir http://localhost:3000 → Login: `admin@demoa.com` / `password123`

### Comandos Docker útiles

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Reconstruir tras cambios
docker compose up -d --build

# Parar todo
docker compose down

# Parar todo Y borrar volúmenes (reset DB)
docker compose down -v
```

---

## Prisma Studio (explorar base de datos)

```bash
pnpm db:studio
```
Abre un GUI en http://localhost:5555 para ver/editar datos.

---

## Comandos Importantes

| Comando                  | Descripción                              |
| ------------------------ | ---------------------------------------- |
| `pnpm dev`               | Desarrollo local (API + Web + Worker)    |
| `pnpm build`             | Build de producción de todos los apps    |
| `pnpm db:generate`       | Regenerar Prisma Client                  |
| `pnpm db:migrate`        | Correr migraciones pendientes            |
| `pnpm db:seed`           | Sembrar datos iniciales                  |
| `pnpm db:studio`         | Abrir Prisma Studio                      |
| `pnpm docker:up`         | `docker compose up -d`                   |
| `pnpm docker:down`       | `docker compose down`                    |
| `pnpm docker:logs`       | `docker compose logs -f`                 |

---

## Solución de Problemas

### Error: `Cannot find module './870.js'` o similar en Next.js
```bash
cd apps/web
rm -rf .next
cd ../..
pnpm dev
```

### Error: `DATABASE_URL not found` al usar `pnpm dev`
El script `scripts/dev.mjs` carga automáticamente el `.env`. Verifica que el archivo `.env` exista en la raíz.

### Puerto ocupado (3000 o 4000)
```bash
# Windows
netstat -aon | findstr :3000
taskkill /f /pid <PID>

# Linux/Mac
lsof -i :3000
kill -9 <PID>
```

### Peer dependency warnings de pnpm
Son warnings informativos, no errores. El proyecto funciona correctamente con ellos.

---

## Stack Tecnológico

- **Backend:** NestJS 10, Prisma 6, BullMQ, Passport JWT
- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS 3.4, Lucide Icons
- **Worker:** NestJS Standalone + BullMQ (rules engine, automations)
- **Base de datos:** PostgreSQL 16
- **Cache / Queues:** Redis 7
- **Monorepo:** pnpm Workspaces + Turborepo

---

## Credenciales por Defecto

| Email | Password | Rol | Tenant |
| ----- | -------- | --- | ------ |
| `admin@inmoflow.com` | `password123` | Super Admin | — |
| `admin@demoa.com` | `password123` | Business | Demo A (Professional) |
| `admin@demob.com` | `password123` | Business | Demo B (Starter) |
| `agent@demoa.com` | `password123` | Agent | Demo A |

> **Cambiar en producción** editando el seed o creando usuarios vía API.

---

## Opción C — Deploy Producción (Linux server)

Para deploy en un servidor Linux con dominio propio.

### Requisitos
- Ubuntu 22+ / Debian 12+ (o cualquier Linux con Docker)
- Docker + Docker Compose V2
- Dominio apuntando al servidor (DNS A record)
- Puertos 80 y 443 abiertos

### 1. Deploy automático

```bash
git clone <repo> inmoflow && cd inmoflow
chmod +x scripts/deploy.sh
sudo ./scripts/deploy.sh
```

El script:
- Instala Docker si no existe
- Pide dominio, email SSL, contraseñas
- Genera `.env.prod` con JWT_SECRET seguro
- Obtiene certificado SSL con Let's Encrypt
- Build + migrate + seed + levanta todo
- Instala cron jobs (backup diario, health check, SSL renewal)

### 2. Deploy manual

```bash
# Crear .env.prod
cp .env.example .env.prod
# Editar: DOMAIN, POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET

# Build
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# Migraciones + seed
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile migrate run --rm migrate

# Levantar todo
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 3. Verificación

```bash
# Estado de servicios
docker compose -f docker-compose.prod.yml ps

# Health check completo
./scripts/health-check.sh

# Logs
docker compose -f docker-compose.prod.yml logs -f
```

### 4. Mantenimiento

```bash
# Backup manual
./scripts/backup.sh

# Ver backups
./scripts/backup.sh --list

# Restaurar
./scripts/backup.sh --restore backups/inmoflow_20260304.dump

# Actualizar (tras git pull)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### 5. Deploy para clientes Custom

Mismo proceso que arriba. Para cada cliente:
1. Clonar el repositorio en su servidor
2. Ejecutar `sudo ./scripts/deploy.sh` (pide dominio y contraseñas)
3. El health check automático monitorea cada 5 min
4. Backups diarios a las 3:00 AM
5. SSL se renueva automáticamente
