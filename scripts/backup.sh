#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# InmoFlow — Database Backup Script
# ═══════════════════════════════════════════════════════════════
#
# Uso:
#   ./scripts/backup.sh                  # Backup manual
#   ./scripts/backup.sh --restore FILE   # Restaurar desde backup
#   ./scripts/backup.sh --list           # Listar backups
#
# También se ejecuta automáticamente via cron (3:00 AM diario)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
BACKUP_DIR="${APP_DIR}/backups"
RETENTION_DAYS=30

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

# Load env
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
fi

# ─── Functions ──────────────────────────────────────

do_backup() {
  mkdir -p "$BACKUP_DIR"
  
  local timestamp=$(date +%Y%m%d_%H%M%S)
  local filename="inmoflow_${timestamp}.dump"
  local filepath="${BACKUP_DIR}/${filename}"
  
  echo -e "${BLUE}[Backup]${NC} Creando backup..."
  
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-inmoflow}" -Fc "${POSTGRES_DB:-inmoflow}" \
    > "$filepath"
  
  local size=$(du -h "$filepath" | cut -f1)
  echo -e "${GREEN}[✓]${NC} Backup creado: ${filename} (${size})"
  
  # Cleanup old backups
  local deleted=$(find "$BACKUP_DIR" -name "*.dump" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
  if [ "$deleted" -gt 0 ]; then
    echo -e "${YELLOW}[!]${NC} ${deleted} backups antiguos eliminados (>${RETENTION_DAYS} días)"
  fi
  
  echo "$filepath"
}

do_restore() {
  local file="$1"
  
  if [ ! -f "$file" ]; then
    echo -e "${RED}[✗]${NC} Archivo no encontrado: $file"
    exit 1
  fi
  
  echo -e "${YELLOW}⚠ ATENCIÓN: Esto va a reemplazar TODA la base de datos.${NC}"
  echo -e "  Archivo: ${file}"
  echo -e "  Tamaño: $(du -h "$file" | cut -f1)"
  echo ""
  read -p "¿Estás seguro? (escribe 'SI' para confirmar): " confirm
  
  if [ "$confirm" != "SI" ]; then
    echo "Cancelado."
    exit 0
  fi
  
  echo -e "${BLUE}[Restore]${NC} Restaurando..."
  
  # Drop and recreate
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-inmoflow}" -c "DROP DATABASE IF EXISTS ${POSTGRES_DB:-inmoflow};" postgres
  
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-inmoflow}" -c "CREATE DATABASE ${POSTGRES_DB:-inmoflow};" postgres
  
  # Restore
  cat "$file" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_restore -U "${POSTGRES_USER:-inmoflow}" -d "${POSTGRES_DB:-inmoflow}" --no-owner --no-acl
  
  echo -e "${GREEN}[✓]${NC} Base de datos restaurada"
  echo -e "${YELLOW}[!]${NC} Reiniciando servicios..."
  
  docker compose -f "$COMPOSE_FILE" restart api worker
  echo -e "${GREEN}[✓]${NC} Servicios reiniciados"
}

do_list() {
  echo -e "${BLUE}═══ Backups disponibles ═══${NC}"
  
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/*.dump 2>/dev/null)" ]; then
    echo "  No hay backups."
    return
  fi
  
  echo ""
  printf "  %-40s %10s %s\n" "ARCHIVO" "TAMAÑO" "FECHA"
  printf "  %-40s %10s %s\n" "────────────────────────────────────────" "──────────" "────────────────────"
  
  for f in $(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null); do
    local name=$(basename "$f")
    local size=$(du -h "$f" | cut -f1)
    local date=$(stat -c %y "$f" | cut -d. -f1)
    printf "  %-40s %10s %s\n" "$name" "$size" "$date"
  done
  
  echo ""
  local total=$(du -sh "$BACKUP_DIR" | cut -f1)
  echo "  Total: $total | Retención: ${RETENTION_DAYS} días"
}

# ─── Main ───────────────────────────────────────────

case "${1:-backup}" in
  --restore)
    if [ -z "${2:-}" ]; then
      echo "Uso: $0 --restore <archivo.dump>"
      exit 1
    fi
    do_restore "$2"
    ;;
  --list)
    do_list
    ;;
  *)
    do_backup
    ;;
esac
