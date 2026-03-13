#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# InmoFlow — Script de Actualización (repeatable deploy)
# ═══════════════════════════════════════════════════════════════
#
# Uso:
#   cd /opt/inmoflow
#   sudo bash scripts/update.sh              # Update completo
#   sudo bash scripts/update.sh --no-pull    # Sin git pull (ya tienes el código)
#   sudo bash scripts/update.sh --migrate    # Forzar migración de BD
#   sudo bash scripts/update.sh --rebuild    # Forzar rebuild sin caché
#
# ⚠  NUNCA hace `docker compose down` — no toca DB ni Redis.
#    Solo reconstruye y reinicia api, worker, web.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Config ──────────────────────────────────────────
APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
BRANCH="dev"

# Servicios de aplicación (los que se reconstruyen)
APP_SERVICES="inmoflow-api inmoflow-worker inmoflow-web"
# Servicios de infraestructura (NUNCA se tocan)
INFRA_SERVICES="inmoflow-db inmoflow-redis"

# ─── Colors ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${BLUE}[InmoFlow]${NC} $1"; }
ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
warn()  { echo -e "${YELLOW}  !${NC} $1"; }
fail()  { echo -e "${RED}  ✗${NC} $1"; }
step()  { echo -e "\n${BOLD}── $1 ──${NC}"; }

# ─── Parse args ──────────────────────────────────────
DO_PULL=true
DO_MIGRATE=false
NO_CACHE=""

for arg in "$@"; do
  case $arg in
    --no-pull)   DO_PULL=false ;;
    --migrate)   DO_MIGRATE=true ;;
    --rebuild)   NO_CACHE="--no-cache" ;;
    --help|-h)
      echo "Uso: sudo bash scripts/update.sh [opciones]"
      echo ""
      echo "Opciones:"
      echo "  --no-pull    No hacer git pull (usa código actual)"
      echo "  --migrate    Forzar ejecución de migraciones de BD"
      echo "  --rebuild    Forzar reconstrucción sin caché Docker"
      echo "  --help       Mostrar esta ayuda"
      exit 0
      ;;
    *)
      echo "Opción desconocida: $arg"
      echo "Usa --help para ver opciones"
      exit 1
      ;;
  esac
done

# ─── Checks ─────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}     InmoFlow — Actualización de Producción${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

if [ ! -f "$ENV_FILE" ]; then
  fail "No se encontró $ENV_FILE en $APP_DIR"
  fail "Crear el archivo .env antes de continuar."
  exit 1
fi

if ! docker compose version &> /dev/null; then
  fail "Docker Compose no encontrado"
  exit 1
fi

log "Directorio: $APP_DIR"
log "Compose:    $COMPOSE_FILE"
log "Env:        $ENV_FILE"

# ─── Step 1: Git Pull ───────────────────────────────
step "1/6 — Código fuente"

if [ "$DO_PULL" = true ]; then
  CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "???")
  log "Commit actual: $CURRENT_COMMIT"

  git fetch origin "$BRANCH" --quiet
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")

  if [ "$LOCAL" = "$REMOTE" ]; then
    ok "Ya estás en la última versión"
  else
    log "Descargando cambios de origin/$BRANCH..."
    git pull origin "$BRANCH" --quiet
    NEW_COMMIT=$(git rev-parse --short HEAD)
    ok "Actualizado: $CURRENT_COMMIT → $NEW_COMMIT"

    # Auto-detect si hay migraciones nuevas
    if git diff "$LOCAL" "$REMOTE" --name-only | grep -q "packages/db/prisma/migrations"; then
      DO_MIGRATE=true
      warn "Se detectaron migraciones nuevas — se ejecutarán automáticamente"
    fi
  fi
else
  ok "Saltando git pull (--no-pull)"
fi

# ─── Step 2: Verificar infra ────────────────────────
step "2/6 — Infraestructura (DB + Redis)"

DB_RUNNING=$(docker ps --filter "name=inmoflow-db" --filter "status=running" --format "{{.Names}}" 2>/dev/null)
REDIS_RUNNING=$(docker ps --filter "name=inmoflow-redis" --filter "status=running" --format "{{.Names}}" 2>/dev/null)

if [ -z "$DB_RUNNING" ] || [ -z "$REDIS_RUNNING" ]; then
  warn "DB o Redis no están corriendo — levantando..."
  docker compose -f "$COMPOSE_FILE" up -d inmoflow-db inmoflow-redis
  log "Esperando healthcheck (15s)..."
  sleep 15
fi

# Verificar que estén healthy
DB_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' inmoflow-db 2>/dev/null || echo "unknown")
REDIS_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' inmoflow-redis 2>/dev/null || echo "unknown")

if [ "$DB_HEALTH" != "healthy" ]; then
  fail "inmoflow-db no está healthy (status: $DB_HEALTH)"
  fail "Revisar: docker logs inmoflow-db --tail 20"
  exit 1
fi

if [ "$REDIS_HEALTH" != "healthy" ]; then
  fail "inmoflow-redis no está healthy (status: $REDIS_HEALTH)"
  fail "Revisar: docker logs inmoflow-redis --tail 20"
  exit 1
fi

ok "PostgreSQL: healthy"
ok "Redis: healthy"

# ─── Step 3: Migraciones ────────────────────────────
step "3/6 — Migraciones de BD"

if [ "$DO_MIGRATE" = true ]; then
  log "Ejecutando prisma migrate deploy..."
  docker compose -f "$COMPOSE_FILE" --profile migrate run --rm inmoflow-migrate
  ok "Migraciones aplicadas"
else
  ok "Sin migraciones pendientes (usar --migrate para forzar)"
fi

# ─── Step 4: Build ──────────────────────────────────
step "4/6 — Construir imágenes"

log "Construyendo api, worker, web... (puede tardar 2-5 min)"
docker compose -f "$COMPOSE_FILE" build $NO_CACHE $APP_SERVICES
ok "Imágenes construidas"

# ─── Step 5: Restart app services ────────────────────
step "5/6 — Reiniciar servicios"

# CLAVE: up -d --no-deps --force-recreate SOLO los servicios de app
# --no-deps    → No toca DB ni Redis
# --force-recreate → Recrea containers con nueva imagen + env vars
log "Reiniciando api, worker, web..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate $APP_SERVICES

ok "Servicios reiniciados"

# ─── Step 6: Verificar ──────────────────────────────
step "6/6 — Verificación"

log "Esperando que arranquen (20s)..."
sleep 20

# Verificar API health
API_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' inmoflow-api 2>/dev/null || echo "unknown")
if [ "$API_HEALTH" = "healthy" ]; then
  ok "API: healthy"
else
  warn "API aún no está healthy (status: $API_HEALTH) — puede estar arrancando"
  warn "Verificar con: docker logs inmoflow-api --tail 20"
fi

# Verificar Worker
WORKER_STATUS=$(docker inspect --format='{{.State.Status}}' inmoflow-worker 2>/dev/null || echo "unknown")
if [ "$WORKER_STATUS" = "running" ]; then
  ok "Worker: running"
else
  fail "Worker: $WORKER_STATUS"
  fail "Verificar con: docker logs inmoflow-worker --tail 20"
fi

# Verificar Web
WEB_STATUS=$(docker inspect --format='{{.State.Status}}' inmoflow-web 2>/dev/null || echo "unknown")
if [ "$WEB_STATUS" = "running" ]; then
  ok "Web: running"
else
  fail "Web: $WEB_STATUS"
  fail "Verificar con: docker logs inmoflow-web --tail 20"
fi

# Estado final
echo ""
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

# ─── Limpieza de imágenes antiguas ───────────────────
DANGLING=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l)
if [ "$DANGLING" -gt 0 ]; then
  log "Limpiando $DANGLING imágenes huérfanas..."
  docker image prune -f --quiet > /dev/null 2>&1
  ok "Imágenes antiguas eliminadas"
fi

echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ Actualización completada${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
