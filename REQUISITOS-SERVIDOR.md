# InmoFlow — Requisitos de Servidor

> Guía de hardware y software mínimo para cada plan.

---

## Stack tecnológico (lo que corre en el servidor)

| Servicio | Tecnología | Función |
|----------|-----------|---------|
| **API** | NestJS (Node.js 20) | Backend REST, autenticación, lógica de negocio |
| **Web** | Next.js (Node.js 20) | Frontend SSR, dashboard |
| **Worker** | NestJS Standalone | Procesamiento asíncrono de reglas y automatizaciones |
| **PostgreSQL** | v16 | Base de datos principal |
| **Redis** | v7 | Colas de trabajo (BullMQ) y rate limiting |
| **Nginx** | Alpine | Reverse proxy, SSL, rate limiting, caché |

Todos los servicios corren como contenedores Docker (6 containers en total).

---

## Software requerido

| Software | Versión mínima | Notas |
|----------|---------------|-------|
| Linux | Ubuntu 22.04+ / Debian 12+ | Cualquier distro con kernel 5.x+ |
| Docker | 24+ | Incluye Docker Compose V2 |
| Dominio | — | Con DNS A record apuntando al servidor |
| Puertos abiertos | 80, 443 | HTTP y HTTPS |

> El script `deploy.sh` instala Docker automáticamente si no existe.

---

## Plan Starter — hasta 3 usuarios, 1 inmobiliaria

**Perfil de uso:** 1 inmobiliaria chica, ~50–200 leads activos, tráfico bajo.

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| **CPU** | 1 vCPU | 2 vCPU |
| **RAM** | 2 GB | 4 GB |
| **Disco** | 20 GB SSD | 40 GB SSD |
| **Ancho de banda** | 1 TB/mes | 2 TB/mes |

**Distribución estimada de RAM:**

| Servicio | Consumo |
|----------|---------|
| PostgreSQL | ~200 MB |
| Redis | ~50 MB |
| API (NestJS) | ~250 MB |
| Worker | ~200 MB |
| Web (Next.js) | ~150 MB |
| Nginx | ~20 MB |
| **Sistema operativo** | ~300 MB |
| **Total estimado** | **~1.2 GB** |

**Equivalente en proveedores cloud:**

| Proveedor | Instancia | Precio aprox. |
|-----------|-----------|--------------|
| DigitalOcean | Droplet 2 GB | ~$12/mes |
| Hetzner | CX22 (2 vCPU, 4 GB) | ~€4/mes |
| Contabo | VPS S (4 vCPU, 8 GB) | ~€6/mes |
| AWS | t3.small (2 GB) | ~$15/mes |
| Vultr | Cloud 2 GB | ~$12/mes |

---

## Plan Professional — hasta 10 usuarios, 1 inmobiliaria

**Perfil de uso:** 1 inmobiliaria mediana, ~500–2.000 leads, IA activa, WhatsApp + Telegram + Meta Leads, tráfico moderado.

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| **CPU** | 2 vCPU | 4 vCPU |
| **RAM** | 4 GB | 8 GB |
| **Disco** | 40 GB SSD | 80 GB SSD |
| **Ancho de banda** | 2 TB/mes | 4 TB/mes |

**Distribución estimada de RAM:**

| Servicio | Consumo |
|----------|---------|
| PostgreSQL | ~400 MB |
| Redis | ~128 MB |
| API (NestJS) | ~400 MB |
| Worker | ~350 MB |
| Web (Next.js) | ~200 MB |
| Nginx | ~30 MB |
| **Sistema operativo** | ~400 MB |
| **Total estimado** | **~2 GB** |

> El headroom extra (4–8 GB) permite manejar picos de tráfico, múltiples conexiones de WhatsApp simultáneas, procesamiento de IA, y ejecución de reglas de automatización.

**Equivalente en proveedores cloud:**

| Proveedor | Instancia | Precio aprox. |
|-----------|-----------|--------------|
| DigitalOcean | Droplet 4 GB | ~$24/mes |
| Hetzner | CX32 (4 vCPU, 8 GB) | ~€7/mes |
| Contabo | VPS M (6 vCPU, 16 GB) | ~€11/mes |
| AWS | t3.medium (4 GB) | ~$30/mes |
| Vultr | Cloud 4 GB | ~$24/mes |

---

## Plan Custom — usuarios ilimitados, 1 inmobiliaria grande o franquicia

**Perfil de uso:** Inmobiliaria grande o franquicia, ~5.000–50.000+ leads, 20+ usuarios activos simultáneos, todas las integraciones, alto volumen de mensajes.

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| **CPU** | 4 vCPU | 8 vCPU |
| **RAM** | 8 GB | 16 GB |
| **Disco** | 80 GB SSD NVMe | 160 GB SSD NVMe |
| **Ancho de banda** | 4 TB/mes | Ilimitado |

**Distribución estimada de RAM:**

| Servicio | Consumo |
|----------|---------|
| PostgreSQL | ~1 GB |
| Redis | ~256 MB |
| API (NestJS) | ~512 MB |
| Worker | ~512 MB |
| Web (Next.js) | ~256 MB |
| Nginx | ~50 MB |
| **Sistema operativo** | ~500 MB |
| **Total estimado** | **~3 GB** |

> El headroom extra (16 GB) permite: conexión de PostgreSQL pool más grande, caché Redis más amplio, procesamiento paralelo de automatizaciones, y múltiples llamadas a APIs de IA concurrentes.

**Equivalente en proveedores cloud:**

| Proveedor | Instancia | Precio aprox. |
|-----------|-----------|--------------|
| DigitalOcean | Droplet 8 GB | ~$48/mes |
| Hetzner | CX42 (8 vCPU, 16 GB) | ~€15/mes |
| Contabo | VPS L (8 vCPU, 30 GB) | ~€16/mes |
| AWS | t3.xlarge (16 GB) | ~$120/mes |
| Vultr | Cloud 8 GB | ~$48/mes |

---

## Consideraciones adicionales

### Disco

| Concepto | Consumo estimado |
|----------|-----------------|
| Sistema operativo + Docker | ~5 GB |
| Imágenes Docker (6 containers) | ~3 GB |
| Base de datos (por cada 10.000 leads) | ~500 MB |
| Backups (30 días, rotación automática) | ~5–15 GB |
| Logs de aplicación | ~1–3 GB |
| Redis datos persistentes | ~100 MB |

> **Tip:** Usar SSD (no HDD) es fundamental. PostgreSQL es muy sensible a la latencia de disco.

### Red

- **SSL:** Incluido automáticamente (Let's Encrypt, renovación automática)
- **IPv4:** Se necesita al menos 1 IP pública
- **Firewall:** Solo abrir puertos 80 (HTTP→redirect), 443 (HTTPS), y opcionalmente 22 (SSH)
- **DNS:** Un registro A apuntando al IP del servidor

### Backups

- Backup automático diario a las 3:00 AM (cron job instalado por `deploy.sh`)
- Retención: 30 días (configurable)
- Almacenados en `/backups/` como dumps comprimidos de PostgreSQL
- Script de restauración incluido: `./scripts/backup.sh --restore <archivo>`

### Monitoreo

- Health check automático cada 5 minutos (cron job)
- Verifica: 6 servicios Docker + API endpoint + disco + RAM + SSL + backups
- Alertas opcionales a Slack/Discord via webhook

---

## Resumen rápido

| Plan | RAM | CPU | Disco | Costo servidor |
|------|-----|-----|-------|---------------|
| **Starter** | 2–4 GB | 1–2 vCPU | 20–40 GB | $4–15/mes |
| **Professional** | 4–8 GB | 2–4 vCPU | 40–80 GB | $7–30/mes |
| **Custom** | 8–16 GB | 4–8 vCPU | 80–160 GB | $15–120/mes |

> Los costos de servidor dependen del proveedor. Hetzner y Contabo son los más económicos con excelente rendimiento para Europa/LatAm.
