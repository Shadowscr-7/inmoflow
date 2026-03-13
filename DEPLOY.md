# Despliegue de InmoFlow — Guía definitiva

> **Servidor actual:** srv1046281 (31.97.93.104)
> **Dominio:** crm.contacthouse.com.uy
> **Directorio:** `/opt/inmoflow`
> **Rama:** `dev`

---

## Infraestructura existente en el servidor

| Container | Imagen | Descripción |
|---|---|---|
| `root-traefik-1` | traefik:2.11 | Reverse proxy, SSL, puertos 80/443 |
| `evolution_api` | evolution-api:v2.3.7 | WhatsApp API |
| `root-n8n-1` | n8n:latest | Automatizaciones |
| `root-evolution-postgres-1` | postgres:16-alpine | BD de Evolution (NO InmoFlow) |
| `root-redis-1` | redis:7-alpine | Redis de Evolution (NO InmoFlow) |

**InmoFlow NO toca nada de lo anterior.** Tiene su propia BD, Redis y red aislada (`inmoflow`).

---

## Archivo de entorno: `.env`

> **⚠ IMPORTANTE:** Docker Compose lee `.env` automáticamente del directorio actual.
> El archivo correcto es `/opt/inmoflow/.env` (no `.env.production`, no `.env.prod`).

---

## Instalación inicial (solo 1 vez)

### 1. Clonar repositorio

```bash
cd /opt
git clone -b dev https://github.com/Shadowscr-7/inmoflow.git
cd inmoflow
```

### 2. Crear `.env`

```bash
cp .env.production.example .env
```

Editar `.env` y completar:

```bash
nano .env
```

**Variables críticas que hay que generar:**
```bash
# Generar passwords seguras (SOLO caracteres alfanuméricos, sin +/=)
openssl rand -base64 32 | tr -d '/+='   # → usar como DB_PASSWORD
openssl rand -base64 32 | tr -d '/+='   # → usar como REDIS_PASSWORD
openssl rand -base64 48 | tr -d '/+='   # → usar como JWT_SECRET
```

> **⚠ NUNCA usar passwords con caracteres especiales (`+`, `=`, `/`, `@`, `#`)**
> porque se interpolan dentro de URLs como `postgresql://user:PASSWORD@host/db`
> y causan errores P1000 de autenticación.

### 3. Primer despliegue

```bash
cd /opt/inmoflow

# Construir imágenes (~3-5 min)
docker compose -f docker-compose.prod.yml build

# Levantar DB y Redis primero
docker compose -f docker-compose.prod.yml up -d inmoflow-db inmoflow-redis
sleep 15

# Verificar que estén healthy
docker compose -f docker-compose.prod.yml ps

# Ejecutar migraciones + seed
docker compose -f docker-compose.prod.yml --profile migrate run --rm inmoflow-migrate

# Levantar todo
docker compose -f docker-compose.prod.yml up -d
```

### 4. Verificar

```bash
# Estado de containers
docker compose -f docker-compose.prod.yml ps

# API health
curl -s https://crm.contacthouse.com.uy/api/health

# Credenciales iniciales
# admin@demoa.com / password123
```

---

## Actualizar (deploy repetible) ← USAR SIEMPRE

### Opción A: Script automático (recomendado)

```bash
cd /opt/inmoflow
sudo bash scripts/update.sh
```

**¿Qué hace el script?**
1. `git pull origin dev` — baja el código nuevo
2. Verifica que DB y Redis estén healthy (los levanta si no lo están)
3. Auto-detecta si hay migraciones nuevas y las ejecuta
4. `docker compose build` — reconstruye imágenes de api, worker, web
5. `docker compose up -d --no-deps --force-recreate` — reinicia SOLO app (no toca DB/Redis)
6. Verifica healthchecks
7. Limpia imágenes Docker huérfanas

**Opciones:**
```bash
sudo bash scripts/update.sh --no-pull    # Ya hiciste git pull manualmente
sudo bash scripts/update.sh --migrate    # Forzar migraciones aunque no detecte cambios
sudo bash scripts/update.sh --rebuild    # Build sin caché Docker (más lento)
```

### Opción B: Comandos manuales

```bash
cd /opt/inmoflow

# 1. Bajar código
git pull origin dev

# 2. Reconstruir imágenes
docker compose -f docker-compose.prod.yml build inmoflow-api inmoflow-worker inmoflow-web

# 3. Si hay migraciones nuevas
docker compose -f docker-compose.prod.yml --profile migrate run --rm inmoflow-migrate

# 4. Reiniciar SOLO servicios de app (NO toca DB ni Redis)
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate inmoflow-api inmoflow-worker inmoflow-web

# 5. Verificar
docker compose -f docker-compose.prod.yml ps
```

---

## ⛔ Lo que NUNCA hay que hacer

### NUNCA `docker compose down` sin razón

```bash
# ❌ PELIGROSO — mata la base de datos y Redis
docker compose -f docker-compose.prod.yml down

# ❌ PELIGROSO — borra los volúmenes (PIERDES TODOS LOS DATOS)
docker compose -f docker-compose.prod.yml down -v
```

**¿Por qué?**
- `down` destruye TODOS los containers, incluyendo DB y Redis
- Al volver a hacer `up`, PostgreSQL recrea el container con la password del `.env` actual
- Si la password cambió (o tiene caracteres especiales), el volumen tiene la password vieja → error P1000
- Redis pierde las colas BullMQ en progreso

### Si NECESITAS reiniciar todo desde cero

Solo si realmente hay que recrear DB+Redis (raro):

```bash
# 1. Backup primero
docker compose -f docker-compose.prod.yml --profile backup run --rm inmoflow-backup

# 2. Bajar todo
docker compose -f docker-compose.prod.yml down

# 3. Subir DB y Redis primero, esperar healthy
docker compose -f docker-compose.prod.yml up -d inmoflow-db inmoflow-redis
sleep 15
docker compose -f docker-compose.prod.yml ps  # verificar healthy

# 4. Migraciones (si es BD nueva)
docker compose -f docker-compose.prod.yml --profile migrate run --rm inmoflow-migrate

# 5. Subir app
docker compose -f docker-compose.prod.yml up -d
```

### Si ya rompiste la password de la BD

Si hiciste `down` y ahora da error P1000:

```bash
# 1. Ver qué password espera el volumen existente
docker compose -f docker-compose.prod.yml up -d inmoflow-db
docker exec -it inmoflow-db psql -U inmoflow -c "SELECT 1"
# Si funciona → la password del volumen es la original

# 2. Ajustar .env para que coincida con la password del volumen
# O cambiar la password de postgres para que coincida con .env:
docker exec -it inmoflow-db psql -U inmoflow -c "ALTER USER inmoflow WITH PASSWORD 'la-password-de-tu-env';"

# 3. Reiniciar con --force-recreate para que lea las env vars nuevas
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## Comandos útiles

```bash
# ─── Alias (agregar a ~/.bashrc para no escribir todo el rato) ───
echo "alias iflow='cd /opt/inmoflow && docker compose -f docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc

# ─── Estado ──────────────────────────────────────────────────────
iflow ps                                # Estado de containers
iflow logs -f                           # Logs en vivo (todos)
iflow logs -f inmoflow-api              # Logs solo API
iflow logs -f inmoflow-worker           # Logs solo Worker
iflow logs -f --tail 50                 # Últimas 50 líneas

# ─── Reiniciar un servicio (sin tocar DB/Redis) ─────────────────
iflow up -d --no-deps --force-recreate inmoflow-api
iflow up -d --no-deps --force-recreate inmoflow-worker
iflow up -d --no-deps --force-recreate inmoflow-web

# ─── Backup manual de BD ────────────────────────────────────────
iflow --profile backup run --rm inmoflow-backup
# Backups en: /opt/inmoflow/backups/

# ─── Entrar a la BD ─────────────────────────────────────────────
docker exec -it inmoflow-db psql -U inmoflow

# ─── Entrar a Redis ─────────────────────────────────────────────
docker exec -it inmoflow-redis redis-cli -a TU_REDIS_PASSWORD

# ─── Ver uso de disco ───────────────────────────────────────────
docker system df
```

---

## Arquitectura

```
Internet
   │
   ▼
┌─────────────────────────────┐
│  Traefik (existente)        │  :80 / :443
│  root-traefik-1             │
└──────────┬──────────────────┘
           │
           │  Red: root_proxy
           │
    ┌──────┴─────────────────────┐
    │                            │
    ▼                            ▼
┌──────────────┐      ┌──────────────┐
│ inmoflow-api │      │ inmoflow-web │
│ :4000        │      │ :3000        │
│ /api/* /ws   │      │ /* (Next.js) │
└──────┬───────┘      └──────┬───────┘
       │                     │
       │   Red: inmoflow     │
       │                     │
  ┌────┴───┬──────┬──────────┘
  │        │      │
  ▼        ▼      ▼
┌────┐  ┌─────┐  ┌────────┐
│ DB │  │Redis│  │ Worker │
└────┘  └─────┘  └────────┘
```

---

## Problemas comunes

### Error P1000 (autenticación BD)

**Causa:** La password del `.env` no coincide con la que tiene el volumen de PostgreSQL.

```bash
# Verificar qué password tiene el volumen
docker exec -it inmoflow-db psql -U inmoflow -c "SELECT 1"

# Si funciona pero la app no conecta, sincronizar password:
docker exec -it inmoflow-db psql -U inmoflow -c "ALTER USER inmoflow WITH PASSWORD 'la-password-correcta';"
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate inmoflow-api inmoflow-worker
```

### "network root_proxy not found"

```bash
docker network ls | grep proxy
# Actualizar TRAEFIK_NETWORK en .env con el nombre correcto
```

### API no arranca / no responde

```bash
docker logs inmoflow-api --tail 50
docker exec inmoflow-db pg_isready -U inmoflow
docker exec inmoflow-redis redis-cli -a TU_PASSWORD ping
```

### Worker no procesa mensajes

```bash
docker logs inmoflow-worker --tail 50
# Verificar que Redis esté accesible
docker exec inmoflow-redis redis-cli -a TU_PASSWORD LLEN bull:message:wait
```

### Quiero cambiar una variable de entorno

```bash
# 1. Editar .env
nano /opt/inmoflow/.env

# 2. Recrear el servicio afectado (docker restart NO relee env vars)
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate inmoflow-api

# ⚠ NUNCA usar "docker compose restart" para aplicar cambios de env
# restart reutiliza el container viejo con las env vars viejas
```

---

## Resumen rápido para deploy

```bash
cd /opt/inmoflow
sudo bash scripts/update.sh
```

Eso es todo. El script hace todo lo necesario de forma segura.
