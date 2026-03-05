#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# InmoFlow — Script de Deploy para Linux
# ═══════════════════════════════════════════════════════════════
#
# Uso:
#   chmod +x scripts/deploy.sh
#   sudo ./scripts/deploy.sh
#
# Requisitos: Ubuntu/Debian 22+ con acceso root
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Colors ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${BLUE}[InmoFlow]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
ask()   { echo -e "${CYAN}[?]${NC} $1"; }

# ─── Generate secure password ──────────────────────────
gen_password() {
  openssl rand -base64 32 | tr -d '/+=' | head -c 40
}

# ─── Check root ────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  error "Ejecutar con sudo: sudo ./scripts/deploy.sh"
fi

# ─── Get config ────────────────────────────────────────
APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP_DIR"

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}     InmoFlow — Instalación de Producción${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ─── Step 1: Install Docker if needed ──────────────────
log "Verificando Docker..."
if ! command -v docker &> /dev/null; then
  log "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker instalado"
else
  ok "Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"
fi

if ! docker compose version &> /dev/null; then
  error "Docker Compose V2 no encontrado. Actualiza Docker."
fi
ok "Compose: $(docker compose version --short)"
echo ""

# ─── Step 2: Configure .env ───────────────────────────
if [ ! -f .env.prod ]; then
  log "Configurando instalación..."
  echo ""

  # ── Auto-generated secrets (NOT asked to user) ───────
  JWT_SECRET=$(openssl rand -base64 48)
  PG_PASS=$(gen_password)
  REDIS_PASS=$(gen_password)

  echo -e "${BOLD}── Datos del servidor ──${NC}"
  echo ""

  # ── Domain ───────────────────────────────────────────
  ask "Dominio donde se va a acceder (ej: crm.tuempresa.com)"
  read -p "  → Dominio: " DOMAIN
  [ -z "$DOMAIN" ] && error "Dominio obligatorio"

  # ── SSL Email ────────────────────────────────────────
  echo ""
  ask "Email para el certificado SSL (Let's Encrypt te notifica si está por vencer)"
  read -p "  → Email SSL: " SSL_EMAIL
  [ -z "$SSL_EMAIL" ] && error "Email SSL obligatorio"

  # ── CORS ─────────────────────────────────────────────
  CORS_ORIGINS="https://${DOMAIN}"
  ok "CORS configurado automáticamente: ${CORS_ORIGINS}"

  echo ""
  echo -e "${BOLD}── Integraciones (dejar vacío para configurar después) ──${NC}"
  echo ""

  # ── WhatsApp / Evolution API ─────────────────────────
  ask "Evolution API — para canal WhatsApp"
  read -p "  → URL de Evolution API (ej: https://evo.tuserver.com): " EVO_URL
  EVO_KEY=""
  if [ -n "$EVO_URL" ]; then
    read -p "  → API Key de Evolution: " EVO_KEY
  fi

  # ── Telegram ──────────────────────────────────────────
  echo ""
  ask "Telegram — token del bot (obtener de @BotFather en Telegram)"
  read -p "  → Bot Token: " TG_TOKEN

  # ── Meta / Facebook ──────────────────────────────────
  echo ""
  ask "Meta / Facebook Lead Ads — para capturar leads de Facebook"
  read -p "  → Meta App ID: " META_ID
  META_SECRET=""
  META_VERIFY=""
  if [ -n "$META_ID" ]; then
    read -p "  → Meta App Secret: " META_SECRET
    META_VERIFY="inmoflow-$(openssl rand -hex 8)"
    ok "Meta Verify Token generado: ${META_VERIFY}"
  fi

  # ── Alertas ───────────────────────────────────────────
  echo ""
  ask "Webhook para alertas de monitoreo (Slack, Discord, etc.)"
  read -p "  → Webhook URL (dejar vacío para omitir): " ALERT_URL

  echo ""
  log "Generando configuración segura..."

  cat > .env.prod <<EOF
# ═══════════════════════════════════════════════════════════
# InmoFlow — Production Config
# Generado: $(date -Iseconds)
# ═══════════════════════════════════════════════════════════

# ─── Dominio ───────────────────────────────────────────
DOMAIN=${DOMAIN}
SSL_EMAIL=${SSL_EMAIL}

# ─── Database (password auto-generada) ─────────────────
POSTGRES_USER=inmoflow
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=inmoflow

# ─── Redis (password auto-generada) ────────────────────
REDIS_PASSWORD=${REDIS_PASS}

# ─── Auth (secret auto-generado) ───────────────────────
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── Server ───────────────────────────────────────────
NODE_ENV=production
API_PORT=4000
CORS_ORIGINS=${CORS_ORIGINS}

# ─── WhatsApp / Evolution API ──────────────────────────
EVOLUTION_API_URL=${EVO_URL}
EVOLUTION_API_KEY=${EVO_KEY}

# ─── Telegram ──────────────────────────────────────────
TELEGRAM_BOT_TOKEN=${TG_TOKEN}

# ─── Meta / Facebook ──────────────────────────────────
META_APP_ID=${META_ID}
META_APP_SECRET=${META_SECRET}
META_VERIFY_TOKEN=${META_VERIFY:-inmoflow-meta-verify}
META_PAGE_ACCESS_TOKEN=

# ─── Monitoreo ─────────────────────────────────────────
ALERT_WEBHOOK_URL=${ALERT_URL}

# ─── Plataforma ───────────────────────────────────────
PLATFORM_DOMAIN=${DOMAIN}
EOF

  chmod 600 .env.prod
  echo ""
  ok ".env.prod creado (permisos 600 — solo root puede leerlo)"
  ok "Passwords generadas automáticamente (guardadas en .env.prod)"
else
  ok ".env.prod ya existe — usando configuración existente"
fi

source .env.prod

echo ""

# ─── Step 3: Setup SSL certificate ──────────────────
CERT_PATH="${APP_DIR}/certbot-etc/live/${DOMAIN}"
if [ ! -d "$CERT_PATH" ]; then
  log "Obteniendo certificado SSL para ${DOMAIN}..."
  warn "Asegurate que el dominio ${DOMAIN} apunte a este servidor (DNS A record)"
  echo ""
  
  mkdir -p "${APP_DIR}/certbot-etc" "${APP_DIR}/certbot-var" "${APP_DIR}/certbot-webroot"
  
  docker run --rm -p 80:80 \
    -v "${APP_DIR}/certbot-etc:/etc/letsencrypt" \
    -v "${APP_DIR}/certbot-var:/var/lib/letsencrypt" \
    certbot/certbot certonly \
      --standalone \
      --email "${SSL_EMAIL}" \
      --agree-tos \
      --no-eff-email \
      -d "${DOMAIN}" \
      --non-interactive

  ok "Certificado SSL obtenido para ${DOMAIN}"
else
  ok "Certificado SSL ya existe"
fi

# ─── Step 4: Replace domain in nginx config ─────────
log "Configurando Nginx para ${DOMAIN}..."
# Work on a copy so the template stays clean
cp docker/nginx.prod.conf docker/nginx.prod.active.conf
sed -i "s/\${DOMAIN}/${DOMAIN}/g" docker/nginx.prod.active.conf 2>/dev/null || true
ok "Nginx configurado"

# ─── Step 5: Create backup directory ────────────────
mkdir -p backups
chmod 700 backups
ok "Directorio de backups creado"

# ─── Step 6: Build and deploy ──────────────────────
echo ""
log "Construyendo imágenes Docker (esto puede tardar unos minutos)..."
docker compose -f docker-compose.prod.yml --env-file .env.prod build --no-cache
ok "Imágenes construidas"

log "Ejecutando migraciones y seed..."
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile migrate run --rm migrate
ok "Base de datos inicializada"

log "Levantando servicios..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
ok "Servicios levantados"

# ─── Step 7: Wait and verify ───────────────────────
log "Esperando que arranquen (15s)..."
sleep 15

API_STATUS=$(docker compose -f docker-compose.prod.yml exec -T api wget -qO- http://localhost:4000/api/health 2>/dev/null || echo '{"status":"error"}')
if echo "$API_STATUS" | grep -q '"ok"'; then
  ok "API saludable"
else
  warn "API no responde aún — verificar: docker compose -f docker-compose.prod.yml logs api"
fi

# ─── Step 8: Install cron jobs ─────────────────────
log "Instalando tareas automáticas..."

CRON_FILE="/etc/cron.d/inmoflow"
cat > "$CRON_FILE" <<CRON
# InmoFlow — Automated tasks
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Backup diario a las 3:00 AM
0 3 * * * root cd ${APP_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.prod --profile backup run --rm backup >> /var/log/inmoflow-backup.log 2>&1

# Health check cada 5 minutos
*/5 * * * * root ${APP_DIR}/scripts/health-check.sh --notify >> /var/log/inmoflow-health.log 2>&1

# Renovar SSL mensualmente
0 0 1 * * root cd ${APP_DIR} && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T certbot certbot renew --quiet 2>&1

# Limpiar basura Docker semanalmente
0 4 * * 0 root docker system prune -f >> /var/log/inmoflow-cleanup.log 2>&1
CRON

chmod 644 "$CRON_FILE"
ok "Cron instalado: backup diario, health check 5min, SSL renewal"

# ─── Final summary ─────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✅ InmoFlow instalado exitosamente${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  🌐 App:        https://${DOMAIN}"
echo "  🔧 API Health: https://${DOMAIN}/api/health"
echo ""
echo "  📋 Logs:       docker compose -f docker-compose.prod.yml logs -f"
echo "  🔄 Rebuild:    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"
echo "  💾 Backup:     ./scripts/backup.sh"
echo "  🏥 Health:     ./scripts/health-check.sh"
echo ""
echo -e "  ${BOLD}Credenciales por defecto:${NC}"
echo "    admin@inmoflow.com / password123  (Super Admin)"
echo "    admin@demoa.com / password123     (Demo — Plan Professional)"
echo "    admin@demob.com / password123     (Demo — Plan Starter)"
echo ""
echo -e "  ${YELLOW}⚠ Cambiá las contraseñas después del primer login${NC}"
echo ""
echo -e "  ${BOLD}Passwords auto-generadas guardadas en:${NC}"
echo "    ${APP_DIR}/.env.prod (permisos 600)"
echo ""
