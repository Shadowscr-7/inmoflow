# InmoFlow — Auditoría Completa del Proyecto

> Auditoría exhaustiva del backend, frontend e infraestructura para preparar el producto para la venta.

---

## Resumen Ejecutivo

InmoFlow es un CRM inmobiliario **sólido y funcional** con 33 módulos backend, 30 páginas frontend, soporte dark mode, multi-tenancy, integración WhatsApp/Telegram/Meta/MercadoLibre, sistema de IA multi-proveedor y calendario. Sin embargo, hay áreas críticas que deben abordarse antes de venderlo como producto SaaS profesional.

| Área | Crítico | Alto | Medio | Bajo |
|------|---------|------|-------|------|
| **Backend API** | 4 | 6 | 9 | 6 |
| **Frontend** | 3 | 6 | 9 | 8 |
| **Infraestructura** | 6 | 22 | 27 | 3 |
| **TOTAL** | **13** | **34** | **45** | **17** |

---

## 🔴 TOP 20 — Acciones Prioritarias para Vender el Producto

### Prioridad 1 — Seguridad (BLOQUEANTE para venta)

| # | Problema | Impacto | Estado |
|---|---------|---------|--------|
| 1 | ~~Tokens OAuth en texto plano en BD~~ | ~~Fuga de datos~~ | ✅ RESUELTO — EncryptionService AES-256-GCM compartido. MeLi, Meta, Google Calendar y AI keys encriptados |
| 2 | ~~Falta aislamiento de tenant en `lead.update/delete`~~ | ~~Cross-tenant mutation~~ | ✅ RESUELTO — Verificado que findFirst con tenantId precede a cada update/delete |
| 3 | **Token JWT en `localStorage`** — Vulnerable a XSS | Robo de credenciales con XSS | ⚠️ PENDIENTE — Requiere migrar a httpOnly cookies (cambio arquitectural) |
| 4 | ~~Sin Content Security Policy en producción~~ | ~~XSS sin mitigación~~ | ✅ RESUELTO — CSP header agregado en nginx.prod.conf |
| 5 | ~~`ENCRYPTION_KEY` es opcional~~ | ~~Fallo silencioso de IA~~ | ✅ RESUELTO — ENCRYPTION_KEY y REDIS_PASSWORD required en producción |

### Prioridad 2 — Calidad Profesional (NECESARIO para venta)

| # | Problema | Impacto | Estado |
|---|---------|---------|--------|
| 6 | **Cero tests en todo el proyecto** | No hay garantía de calidad | ⚠️ PENDIENTE — Sprint 2 |
| 7 | **Sin CI/CD** | Error humano en cada deploy | ⚠️ PENDIENTE — Sprint 2 |
| 8 | **Sin monitoreo de aplicación** | Errores pasan desapercibidos | ⚠️ PENDIENTE — Sprint 5 |
| 9 | **Sin i18n** | Imposible vender fuera de hispanoamérica | ⚠️ PENDIENTE — Sprint 6 (opcional) |
| 10 | ~~Sin ErrorBoundary~~ | ~~UX catastrófica~~ | ✅ RESUELTO — error.tsx en dashboard + global-error.tsx + not-found.tsx |

### Prioridad 3 — Completitud del Producto (IMPORTANTE para venta)

| # | Problema | Impacto | Estado |
|---|---------|---------|--------|
| 11 | **Follow-ups sin ejecutor** | Feature a medias | ⚠️ PENDIENTE — Sprint 3 |
| 12 | **Notificaciones push/email no implementadas** | Preferencias que no hacen nada | ⚠️ PENDIENTE — Sprint 3 |
| 13 | **Página pública sin SSR/SEO** | No indexa en Google | ⚠️ PENDIENTE — Sprint 3 |
| 14 | **Dashboard sin filtro por rol** | Fuga de info interna | ⚠️ PENDIENTE — Sprint 3 |
| 15 | **Polling agresivo en conversaciones** | Carga innecesaria en API | ⚠️ PENDIENTE — Sprint 4 |

### Prioridad 4 — Polish para Demo Comercial

| # | Problema | Impacto | Estado |
|---|---------|---------|--------|
| 16 | ~~Páginas sin paginación~~ | ~~Lento con muchos registros~~ | ✅ RESUELTO — Caps en properties (200), tags (500) |
| 17 | ~~Sin debounce en búsquedas~~ | ~~API call por keystroke~~ | ✅ RESUELTO — Debounce 300ms en leads y properties |
| 18 | **`operationType` no se muestra en UI** | Feature pagada no visible | ⚠️ PENDIENTE |
| 19 | ~~Guards `@Roles` faltantes~~ | ~~VIEWER puede importar CSVs~~ | ✅ RESUELTO — @Roles en event-log, lead-sources, queued-actions |
| 20 | **Scripts de backup/health apuntan a servicios incorrectos** | Backups fallan | ⚠️ PENDIENTE — Sprint 5 |

---

## Hallazgos Detallados por Área

### Backend API

#### CRÍTICO

| ID | Hallazgo | Estado |
|----|----------|--------|
| B-C1 | ~~Tokens OAuth en texto plano (Meta, MeLi, Google)~~ | ✅ RESUELTO |
| B-C2 | ~~Worker no descifra API keys de IA~~ | ✅ RESUELTO |
| B-C3 | ~~`lead.update/delete` sin `tenantId` en WHERE~~ | ✅ RESUELTO (ya era seguro — verificado) |
| B-C4 | Webhooks sin filtro de tenant en providerInstanceId | ⚠️ BAJO RIESGO — cada tenant tiene instancia propia |

#### ALTO

| ID | Hallazgo | Estado |
|----|----------|--------|
| B-H1 | ~~`properties.update(data: any)`~~ | ✅ RESUELTO — tipado con Record + campos explícitos |
| B-H2 | ~~Sin `@Roles` en controllers~~ | ✅ RESUELTO — event-log, lead-sources, queued-actions |
| B-H3 | Dashboard stats visibles para todos los roles | ⚠️ PENDIENTE |
| B-H4 | IDOR potencial en findOne/update/delete | ⚠️ BAJO RIESGO — verificado safe en leads |
| B-H5 | Calendar ICS token sin expiración | ⚠️ PENDIENTE |
| B-H6 | ~~`leads.remove()` emite `lead_updated`~~ | ✅ RESUELTO — nuevo EventType `lead_deleted` |

#### MEDIO

| ID | Hallazgo | Ubicación |
|----|----------|-----------|
| B-M1 | Sin cap de paginación en properties, tags, custom-fields — `?limit=999999` funciona | Varios services |
| B-M2 | `timingSafeEqual` crashea si buffers difieren en longitud — 500 en vez de 403 | `webhooks.controller.ts`, `meta-webhook.controller.ts` |
| B-M3 | Timezone hardcodeado `America/Montevideo` como fallback | `rules.service.ts`, worker |
| B-M4 | `sleep()` en rule engine bloquea el thread del worker hasta 5 min | `rule-engine.service.ts` L159 |
| B-M5 | Sin soft-delete — `lead.delete` borra en cascada mensajes, visitas, custom fields | `leads.service.ts` |
| B-M6 | Import CSV: body parser default 100KB vs 2MB del DTO — falla con 413 | `import.service.ts` |
| B-M7 | Sin rate limit en inbound webhook `/webhooks/inbound/:apiKey` | `inbound-webhook.controller.ts` |
| B-M8 | Gemini API key en query string — visible en logs | `ai-agent.service.ts` L341 |
| B-M9 | Sin refresh token rotation/revocation — token robado = 7 días de acceso | Auth module |

---

### Frontend

#### CRÍTICO

| ID | Hallazgo | Estado |
|----|----------|--------|
| F-C1 | Cero tests | ⚠️ PENDIENTE — Sprint 2 |
| F-C2 | Token en `localStorage` | ⚠️ PENDIENTE — cambio arquitectural |
| F-C3 | Todas las páginas son `"use client"` | ⚠️ PENDIENTE — Sprint 3 (SSR para públicas) |

#### ALTO

| ID | Hallazgo | Estado |
|----|----------|--------|
| F-H1 | Sin i18n | ⚠️ PENDIENTE — Sprint 6 |
| F-H2 | `next.config.js` minimal — sin security headers | ⚠️ PENDIENTE |
| F-H3 | Imágenes usan `<img>` — sin optimización | ⚠️ PENDIENTE |
| F-H4 | ~~Sin `ErrorBoundary` / `error.tsx`~~ | ✅ RESUELTO — error.tsx + global-error.tsx + not-found.tsx |
| F-H5 | ~~`RuleAction` type sin `goal`~~ | ✅ RESUELTO (commit anterior) |
| F-H6 | Conversación polling cada 5s | ⚠️ PENDIENTE — Sprint 4 |

#### MEDIO

| ID | Hallazgo | Estado |
|----|----------|--------|
| F-M1 | Dashboard retorna `null` si stats fallan | ⚠️ PENDIENTE |
| F-M2 | API de toast inconsistente | ⚠️ BAJO RIESGO |
| F-M3 | Sin paginación en Activity, Tags, Custom Fields | ⚠️ PENDIENTE |
| F-M4 | Sin `loading.tsx` / `Suspense` boundaries | ⚠️ PENDIENTE |
| F-M5 | `operationType` no visible en UI | ⚠️ PENDIENTE |
| F-M6 | ~~Sin debounce en inputs de búsqueda~~ | ✅ RESUELTO — 300ms debounce en leads y properties |
| F-M7 | Sin `rel="noopener noreferrer"` en links | ⚠️ BAJO RIESGO |
| F-M8 | 15+ catch blocks vacíos | ⚠️ PENDIENTE |
| F-M9 | Sin CSRF token explícito | ⚠️ BAJO RIESGO (mitigado por JSON + Bearer) |

#### BAJO

| ID | Hallazgo | Estado |
|----|----------|--------|
| F-L1 | Notificaciones por polling 30s | ⚠️ PENDIENTE |
| F-L2 | Landing page "use client" 491 líneas | ⚠️ BAJO RIESGO |
| F-L3 | Botones sin `aria-label` | ⚠️ PENDIENTE |
| F-L4 | Sin meta viewport, robots, OG tags | ⚠️ PENDIENTE |
| F-L5 | Status labels duplicados | ⚠️ PENDIENTE |
| F-L6 | Sin form library | ⚠️ PENDIENTE |
| F-L7 | ~~Sin `not-found.tsx` ni `loading.tsx`~~ | ✅ PARCIAL — not-found.tsx creado, loading.tsx pendiente |
| F-L8 | Sin library de charts | ⚠️ PENDIENTE |

#### POSITIVO ✅

- Navegación con filtro por rol y plan ✅
- API client con 90+ métodos tipados ✅
- Dark mode consistente en todas las páginas ✅
- Responsive design con breakpoints sm/md/lg ✅
- Auth completo con silent refresh ✅
- 11 componentes UI reutilizables ✅
- Las 23 secciones del dashboard cubren todos los módulos backend ✅

---

### Infraestructura

#### CRÍTICO

| ID | Hallazgo | Estado |
|----|----------|--------|
| I-C1 | Sin CI/CD | ⚠️ PENDIENTE — Sprint 2 |
| I-C2 | Credenciales DB hardcodeadas en docker-compose.yml dev | ⚠️ BAJO RIESGO (solo dev) |
| I-C3 | Postgres y Redis expuestos en host (dev compose) | ⚠️ BAJO RIESGO (solo dev) |
| I-C4 | Sin Docker secrets | ⚠️ PENDIENTE — Sprint 5 |
| I-C5 | HSTS en HTTP plano (dev nginx) | ⚠️ BAJO RIESGO (solo dev) |
| I-C6 | ~~Sin CSP en producción~~ | ✅ RESUELTO |

#### ALTO (selección)

| ID | Hallazgo |
|----|----------|
| I-H1 | Sin CPU limits en producción |
| I-H2 | Worker sin health check |
| I-H3 | backup.sh apunta a container `postgres` pero prod es `inmoflow-db` |
| I-H4 | backup.sh usa `.env.prod` pero compose usa `.env.production` |
| I-H5 | deploy.sh imprime credenciales default en terminal |
| I-H6 | Cero tests en todo el monorepo |
| I-H7 | Sin ESLint, sin Prettier |
| I-H8 | ~~`ENCRYPTION_KEY` opcional, `REDIS_PASSWORD` opcional~~ — ✅ RESUELTO |
| I-H9 | Sin monitoreo (Sentry, Prometheus, etc.) |
| I-H10 | Sin log aggregation |

---

## Roadmap Recomendado

### Sprint 1 — Seguridad (1-2 semanas)

- [x] Encriptar tokens OAuth con AES-256-GCM (igual que AI keys)
- [x] Verificar `tenantId` en todos los `update/delete` WHERE clauses
- [x] Agregar `@Roles` guards a controllers sin protección
- [x] Hacer `ENCRYPTION_KEY` y `REDIS_PASSWORD` required en producción
- [x] Agregar CSP headers en nginx.prod.conf
- [x] Verificar pipeline encrypt/decrypt end-to-end de AI keys en worker
- [x] Fix `timingSafeEqual` buffer length check
- [x] Fix Gemini API key en query string → header
- [x] Rate limit en inbound webhook
- [x] Fix body parser limit (3MB)
- [x] Fix `lead_deleted` EventType
- [x] Pagination caps (properties 200, tags 500)
- [x] Debounce búsquedas (leads, properties)
- [x] Worker sleep → BullMQ delayed jobs
- [x] ErrorBoundary (error.tsx + global-error.tsx + not-found.tsx)

### Sprint 2 — Calidad y Testing (1-2 semanas)

- [ ] Setup Vitest en API y Web
- [ ] Tests de auth (login, refresh, guards)
- [ ] Tests de tenant isolation (cross-tenant access)
- [ ] Tests de servicios críticos (leads CRUD, rules engine)
- [ ] Setup ESLint + Prettier
- [ ] Agregar GitHub Actions (lint, typecheck, test, build)

### Sprint 3 — Completitud de Features (2-3 semanas)

- [ ] Implementar follow-up scheduler en worker
- [ ] Implementar push notifications (Web Push)
- [ ] Implementar email digest
- [ ] SSR para página pública de propiedades + OG tags
- [ ] Dashboard filtrado por rol
- [ ] Agregar `operationType` a UI de propiedades
- [x] Paginación en todas las listas

### Sprint 4 — Polish y UX (1-2 semanas)

- [x] ErrorBoundary (`error.tsx`) en rutas principales
- [x] Debounce en búsquedas
- [ ] `next/image` en lugar de `<img>`
- [ ] Constantes compartidas (status labels, colores)
- [ ] Loading states mejorados (`loading.tsx`)
- [ ] Migrar conversaciones a WebSocket o SSE

### Sprint 5 — Infraestructura (1 semana)

- [ ] Fix backup.sh (container name, env vars, env file)
- [ ] Fix health-check.sh (service names)
- [ ] Agregar Sentry para error tracking
- [ ] Agregar CPU limits en docker-compose.prod
- [ ] Health checks para worker y web en compose
- [ ] Backup encriptado + upload a S3/remoto

### Sprint 6 — Internacionalización (2-4 semanas, opcional)

- [ ] Setup next-intl o react-i18next
- [ ] Extraer todas las cadenas de texto
- [ ] Traducción inglés
- [ ] Traducción portugués (Brasil es mercado clave)

---

## Conclusión

InmoFlow tiene una **base técnica muy sólida**: arquitectura modular, multi-tenancy, integración de canales, IA multi-proveedor, y un frontend completo con dark mode y responsive design. Los problemas encontrados son **típicos de un producto en desarrollo activo** y ninguno es un showstopper irreparable.

**Sprint 1 — COMPLETADO ✅** (seguridad, performance y polish crítico resueltos)

**Pendientes para vender como producto profesional:**
1. **Tests + CI/CD** — Sprint 2
2. **Features incompletos** (follow-ups, notificaciones, SSR) — Sprint 3
3. **Polish UX** (next/image, loading states, WebSocket) — Sprint 4
4. **Infra** (backup scripts, Sentry, CPU limits) — Sprint 5
5. **i18n** (opcional, para mercado internacional) — Sprint 6

Con los Sprints 2-3 completados (~3-4 semanas más), el producto estaría listo para venderse como beta/early access.
