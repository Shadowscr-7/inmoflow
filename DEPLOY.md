# Despliegue de InmoFlow — srv1046281 (31.97.93.104)

## Tu servidor actual

| Container | Imagen | Estado |
|---|---|---|
| `root-traefik-1` | traefik:2.11 | Puertos 80/443/8080 |
| `evolution_api` | evoapicloud/evolution-api:v2.3.7 | Puerto 8080 interno |
| `root-n8n-1` | n8n:latest | Puerto 5678 interno |
| `root-evolution-postgres-1` | postgres:16-alpine | Puerto 5432 interno |
| `root-redis-1` | redis:7-alpine | Puerto 6379 interno |

**Configuracion Traefik detectada:**
- Red: `root_proxy`
- Entrypoints: `web` (:80), `websecure` (:443)
- CertResolver: `mytlschallenge`
- Redirección HTTP→HTTPS: global (automática)

> **InmoFlow NO toca nada de lo anterior.** Crea sus propios PostgreSQL, Redis y servicios en una red aislada.

---

## Paso 1 — DNS (ya hecho)

```
crm.contacthouse.com.uy  →  31.97.93.104  ✅
```

---

## Paso 2 — Clonar repositorio desde GitHub

```bash
# Instalar git si no existe
apt-get install -y git

# Clonar rama prod
cd /opt
git clone -b prod https://github.com/Shadowscr-7/inmoflow.git
cd inmoflow
```

---

## Paso 3 — Configurar variables de entorno

```bash
cd /opt/inmoflow
cp .env.production.example .env.production
```

**Generar contraseñas seguras y guardarlas de una vez:**
```bash
cat > /tmp/secrets.txt << 'EOF'
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
EVOLUTION_WEBHOOK_SECRET=$(openssl rand -hex 32)
EOF
source /tmp/secrets.txt

# Reemplazar en .env.production
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" .env.production
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env.production
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env.production
sed -i "s|^EVOLUTION_WEBHOOK_SECRET=.*|EVOLUTION_WEBHOOK_SECRET=$EVOLUTION_WEBHOOK_SECRET|" .env.production

# Limpiar
rm /tmp/secrets.txt

# Verificar que todo está configurado
cat .env.production
```

> Los valores de Traefik, dominio y Evolution API ya vienen correctos en el template.

---

## Paso 4 — Construir y desplegar

```bash
cd /opt/inmoflow

# 1. Construir las imágenes Docker (~3-5 minutos)
docker compose -f docker-compose.prod.yml --env-file .env.production build

# 2. Iniciar base de datos y Redis primero
docker compose -f docker-compose.prod.yml --env-file .env.production up -d inmoflow-db inmoflow-redis

# 3. Esperar a que estén healthy
sleep 15
docker compose -f docker-compose.prod.yml --env-file .env.production ps
# Deben aparecer como "healthy"

# 4. Ejecutar migraciones + seed (crea tablas + datos iniciales)
docker compose -f docker-compose.prod.yml --env-file .env.production --profile migrate run --rm inmoflow-migrate

# 5. Iniciar todos los servicios
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

---

## Paso 5 — Verificar

```bash
# Ver estado de todos los containers InmoFlow
docker compose -f docker-compose.prod.yml --env-file .env.production ps

# Healthcheck de la API
docker exec inmoflow-api wget -qO- http://localhost:4000/api/health
# Esperado: {"status":"ok","checks":{"database":"ok"}}

# Ver que Traefik detectó los nuevos routers
docker logs root-traefik-1 --tail 10

# Probar HTTPS desde el servidor
curl -s https://crm.contacthouse.com.uy/api/health

# Si algo falla, ver logs
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail 50
```

**Abrir en el navegador:** https://crm.contacthouse.com.uy

**Credenciales iniciales:**
- `admin@demoa.com` / `password123`

---

## Tabla de NO conflictos

| Recurso | Existente | InmoFlow | Conflicto |
|---|---|---|---|
| Puerto 80 | Traefik | NO expone (labels) | Sin conflicto |
| Puerto 443 | Traefik | NO expone (labels) | Sin conflicto |
| Puerto 8080 | Traefik dashboard | No lo usa | Sin conflicto |
| Puerto 5432 | root-evolution-postgres-1 (interno) | inmoflow-db (interno) | Sin conflicto |
| Puerto 6379 | root-redis-1 (interno) | inmoflow-redis (interno) | Sin conflicto |
| Puerto 4000 | — | inmoflow-api (interno) | Sin conflicto |
| Puerto 3000 | — | inmoflow-web (interno) | Sin conflicto |
| Red Docker | root_proxy | inmoflow (aislada) | Sin conflicto |
| Volúmenes | root_* | inmoflow_* | Sin conflicto |
| Containers | root-*, evolution_api | inmoflow-* | Sin conflicto |

---

## Comandos útiles

```bash
# Crear alias (ejecutar 1 vez y añadir a ~/.bashrc)
echo "alias iflow='docker compose -f /opt/inmoflow/docker-compose.prod.yml --env-file /opt/inmoflow/.env.production'" >> ~/.bashrc
source ~/.bashrc

# Uso:
iflow ps                    # Estado
iflow logs -f               # Logs en vivo
iflow logs inmoflow-api     # Logs solo API
iflow restart inmoflow-api  # Reiniciar API
iflow down                  # Parar todo
iflow up -d                 # Levantar todo
iflow up -d --build         # Rebuild + levantar

# Backup manual de BD
iflow --profile backup run --rm inmoflow-backup

# Actualizar aplicación (pull desde GitHub)
cd /opt/inmoflow
git pull origin prod
iflow up -d --build
```

---

## Arquitectura

```
Internet
   |
   v
+-----------------------------+
|  Traefik (existente)        |  Puertos 80/443
|  root-traefik-1             |
+----------+------------------+
           |
           |  Red: root_proxy (traefik_net)
           |
    +------+-------------------------+
    |                                |
    v                                v
+--------------+          +--------------+
| inmoflow-api |          | inmoflow-web |
| :4000        |          | :3000        |
| /api/* /ws   |          | /* (frontend)|
+------+-------+          +------+-------+
       |                         |
       |   Red: inmoflow (priv)  |
       |                         |
  +----+---+----------+----------+
  |        |          |
  v        v          v
+----+  +-----+  +--------+
| DB |  |Redis|  | Worker |
+----+  +-----+  +--------+

===== Sin conexion con =====

+-----------------------------+
| Servicios existentes        |
| evolution_api               |
| root-n8n-1                  |
| root-evolution-postgres-1   |
| root-redis-1                |
+-----------------------------+
```

---

## Solucion de problemas

### "network root_proxy not found"
```bash
docker network ls
# Si la red se llama diferente, actualizar TRAEFIK_NETWORK en .env.production
```

### "error getting credentials" o variables faltantes
```bash
grep -E '(DB_PASSWORD|REDIS_PASSWORD|JWT_SECRET|DOMAIN)' /opt/inmoflow/.env.production
# Todos deben tener valor
```

### La API no arranca
```bash
docker logs inmoflow-api --tail 50
docker exec inmoflow-db pg_isready -U inmoflow
```

### SSL no funciona
```bash
# Verificar que Traefik detectó los routers
docker logs root-traefik-1 --tail 30 2>&1 | grep inmoflow
# Verificar DNS
dig crm.contacthouse.com.uy +short
# Debe devolver: 31.97.93.104
```

### Containers existentes afectados
```bash
# Verificar que todo sigue igual
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -v inmoflow
# Deben verse los 5 containers originales healthy
```
