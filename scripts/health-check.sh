#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# InmoFlow — Health Check & Monitoring
# ═══════════════════════════════════════════════════════════════
#
# Verifica que todos los servicios estén saludables.
# Se ejecuta cada 5 min via cron (instalado por deploy.sh)
# También se puede correr manualmente.
#
# Uso:
#   ./scripts/health-check.sh           # Check todo
#   ./scripts/health-check.sh --notify  # Check + notificar si hay error
#   ./scripts/health-check.sh --json    # Output JSON (para integraciones)
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

APP_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
TIMESTAMP=$(date -Iseconds)
NOTIFY=false
JSON=false
ERRORS=()
WARNINGS=()

# Parse args
for arg in "$@"; do
  case $arg in
    --notify)  NOTIFY=true ;;
    --json)    JSON=true ;;
  esac
done

# ─── Colors (only in terminal) ──────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

# ─── Check function ─────────────────────────────────
check_service() {
  local name="$1"
  local status=$(docker compose -f "$COMPOSE_FILE" ps --format json "$name" 2>/dev/null | head -1)
  
  if [ -z "$status" ]; then
    ERRORS+=("$name: NO ENCONTRADO")
    return 1
  fi

  local state=$(echo "$status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('State','unknown'))" 2>/dev/null || echo "unknown")
  local health=$(echo "$status" | python3 -c "import sys,json; print(json.load(sys.stdin).get('Health',''))" 2>/dev/null || echo "")

  if [ "$state" != "running" ]; then
    ERRORS+=("$name: Estado=$state (no está corriendo)")
    return 1
  fi

  if [ -n "$health" ] && [ "$health" != "healthy" ]; then
    WARNINGS+=("$name: Health=$health")
    return 2
  fi

  return 0
}

check_api_health() {
  local response=$(docker compose -f "$COMPOSE_FILE" exec -T api wget -qO- http://localhost:4000/api/health 2>/dev/null || echo "FAIL")
  
  if echo "$response" | grep -q '"ok"'; then
    return 0
  else
    ERRORS+=("API health endpoint: $response")
    return 1
  fi
}

check_disk_space() {
  local usage=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
  if [ "$usage" -gt 90 ]; then
    ERRORS+=("Disco: ${usage}% usado (>90%)")
  elif [ "$usage" -gt 80 ]; then
    WARNINGS+=("Disco: ${usage}% usado (>80%)")
  fi
}

check_memory() {
  local usage=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
  if [ "$usage" -gt 90 ]; then
    ERRORS+=("Memoria: ${usage}% usada (>90%)")
  elif [ "$usage" -gt 80 ]; then
    WARNINGS+=("Memoria: ${usage}% usada (>80%)")
  fi
}

check_backups() {
  local backup_dir="${APP_DIR}/backups"
  if [ -d "$backup_dir" ]; then
    local latest=$(find "$backup_dir" -name "*.dump" -mtime -2 | head -1)
    if [ -z "$latest" ]; then
      WARNINGS+=("Backup: No hay backups de los últimos 2 días")
    fi
  else
    WARNINGS+=("Backup: Directorio no existe")
  fi
}

check_ssl() {
  if [ -f ".env.prod" ]; then
    source .env.prod
    local expiry=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN":443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$expiry" ]; then
      local exp_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo 0)
      local now_epoch=$(date +%s)
      local days_left=$(( (exp_epoch - now_epoch) / 86400 ))
      if [ "$days_left" -lt 7 ]; then
        ERRORS+=("SSL: Expira en ${days_left} días!")
      elif [ "$days_left" -lt 30 ]; then
        WARNINGS+=("SSL: Expira en ${days_left} días")
      fi
    fi
  fi
}

# ─── Run checks ─────────────────────────────────────
if [ "$JSON" = false ]; then
  echo -e "${BLUE}═══ InmoFlow Health Check ═══${NC}"
  echo "  Timestamp: $TIMESTAMP"
  echo ""
fi

# Services
for svc in postgres redis api worker web nginx; do
  check_service "$svc"
  result=$?
  if [ "$JSON" = false ]; then
    if [ $result -eq 0 ]; then
      echo -e "  ${GREEN}✓${NC} $svc"
    elif [ $result -eq 2 ]; then
      echo -e "  ${YELLOW}⚠${NC} $svc (unhealthy)"
    else
      echo -e "  ${RED}✗${NC} $svc"
    fi
  fi
done

# API endpoint
check_api_health
if [ "$JSON" = false ]; then
  if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} API /health endpoint"
  else
    echo -e "  ${RED}✗${NC} API /health endpoint"
  fi
fi

# System
check_disk_space
check_memory
check_backups
check_ssl

# ─── Summary ────────────────────────────────────────
TOTAL_ERRORS=${#ERRORS[@]}
TOTAL_WARNINGS=${#WARNINGS[@]}

if [ "$JSON" = true ]; then
  # JSON output for integrations
  echo "{"
  echo "  \"timestamp\": \"$TIMESTAMP\","
  echo "  \"status\": \"$([ $TOTAL_ERRORS -eq 0 ] && echo 'ok' || echo 'error')\","
  echo "  \"errors\": $TOTAL_ERRORS,"
  echo "  \"warnings\": $TOTAL_WARNINGS,"
  echo "  \"details\": {"
  printf '    "errors": ['; printf '"%s",' "${ERRORS[@]}" 2>/dev/null | sed 's/,$//'; echo '],'
  printf '    "warnings": ['; printf '"%s",' "${WARNINGS[@]}" 2>/dev/null | sed 's/,$//'; echo ']'
  echo "  }"
  echo "}"
else
  echo ""
  if [ $TOTAL_ERRORS -gt 0 ]; then
    echo -e "${RED}═══ ERRORES (${TOTAL_ERRORS}) ═══${NC}"
    for err in "${ERRORS[@]}"; do
      echo -e "  ${RED}✗${NC} $err"
    done
  fi

  if [ $TOTAL_WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}═══ ALERTAS (${TOTAL_WARNINGS}) ═══${NC}"
    for warn in "${WARNINGS[@]}"; do
      echo -e "  ${YELLOW}⚠${NC} $warn"
    done
  fi

  if [ $TOTAL_ERRORS -eq 0 ] && [ $TOTAL_WARNINGS -eq 0 ]; then
    echo -e "${GREEN}═══ Todo OK ✓ ═══${NC}"
  fi
  echo ""
fi

# ─── Notify on errors ──────────────────────────────
if [ "$NOTIFY" = true ] && [ $TOTAL_ERRORS -gt 0 ]; then
  # Log to syslog
  logger -t "inmoflow-health" "ERRORS: ${ERRORS[*]}"
  
  # If you have a webhook configured, send alert
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    curl -s -X POST "$ALERT_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"🚨 InmoFlow Health Alert\\n${ERRORS[*]}\"}" \
      > /dev/null 2>&1
  fi
fi

# Exit code: 0=ok, 1=errors, 2=warnings only
if [ $TOTAL_ERRORS -gt 0 ]; then
  exit 1
elif [ $TOTAL_WARNINGS -gt 0 ]; then
  exit 2
fi
exit 0
