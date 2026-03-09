# InmoFlow — Auditoría de Producción

> Generado: 8 de marzo de 2026
> Estado: **38/38 issues resueltos** ✅
> Mocks/stubs: **0** — todo tiene implementación real
> TODOs/FIXMEs en código: **0**

## Resumen de correcciones

### Sprint 1 (Seguridad) — 7 issues ✅
- #1 QR Code real con `qrcode` npm
- #2 Signing secrets sin fallback inseguro
- #3 Webhook Meta requiere firma en producción
- #4 AI key cifrada con AES-256-GCM
- #5 Banner demo deshabilitado en producción
- #6 Seed guard (`NODE_ENV !== production`)
- #7 Meta verify token y Telegram magic string seguros

### Sprint 2 (Core) — 7 issues ✅
- #8 QR real (cubierto en #1)
- #9 API_URL centralizada
- #10 CSV import dedup por teléfono/email
- #14 Cálculo de tiempo de respuesta corregido
- #15 AI fallback safe parsing
- #16 Round-robin fix para asignación

### Sprint 3 (Performance) — 4 issues ✅
- #17 scoreAllLeads en batches de 10
- #18 Dashboard groupBy en Prisma
- #25 Workflow ejecuta regla individual (no todas)
- #30 Warning de acción WAIT en reglas

### Sprint 4 (Calidad) — 10 issues ✅
- #31-36 Silent catches → toast errors en 19 archivos
- #37 Backend `any` → tipos Prisma en 6 archivos
- #38 Redis health check
- Env validation en API main.ts
- placeholder.json eliminado

### Sprint 5 (Final 10) — 10 issues ✅
- #11 Commission % fallbacks eliminados → requiere regla configurada o error claro
- #12 Plan limits configurables via env (`PLAN_OVERRIDE_*`) con `getAvailablePlans()`
- #13 Lead scoring configurable con `ScoringConfig` interface + override via env/tenant
- #19 16 `any` types eliminados en 7 archivos frontend (helper `getErrorMessage`)
- #20 Worker env validation con `validateEnv()` + warnings de vars críticas
- #24 Rate limiting en webhooks WhatsApp y Meta (300 req/min)
- #26 Commissions summary reescrito con Prisma `groupBy`/`aggregate` (0 carga en memoria)
- #27 Paginación en follow-ups, visits y custom-fields (limit/offset + total)
- #28 Agent Performance N+1 → groupBy batch para leads/visits/goals + parallel messages
- #29 Form validation en properties y visits (client-side con errores visuales)

---

## 🔴 CRÍTICOS (resolver antes de producción real)

### 1. QR Code falso — no escaneable
| | |
|---|---|
| **Archivo** | `apps/api/src/public/public.service.ts` (líneas ~105-140) |
| **Problema** | `encodeQR()` genera un **placeholder visual** que parece QR pero NO codifica datos reales. Comentario en código: *"Real QR: for a production app, use the 'qrcode' npm package"*. Los clientes reciben QR inservibles. |
| **Solución** | Instalar `qrcode` (`pnpm add qrcode -F api`) y reemplazar `encodeQR()` con generación real: |

```typescript
import QRCode from "qrcode";
const svgString = await QRCode.toString(url, { type: "svg" });
```

---

### 2. Secret de firma inseguro (x2 archivos)
| | |
|---|---|
| **Archivos** | `apps/api/src/meta/meta-oauth.service.ts` (L369), `apps/api/src/channels/providers/telegram.provider.ts` (L329) |
| **Problema** | `getSigningSecret()` retorna `process.env.JWT_SECRET ?? "fallback-insecure-secret"`. Si `JWT_SECRET` no está configurado, cualquiera puede falsificar firmas HMAC. |
| **Solución** | Lanzar error si `JWT_SECRET` no existe: |

```typescript
private getSigningSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return secret;
}
```

---

### 3. Webhook de Meta acepta requests sin firma
| | |
|---|---|
| **Archivo** | `apps/api/src/lead-sources/meta-webhook.controller.ts` (L41) |
| **Problema** | Si `META_APP_SECRET` no está configurado, la verificación de firma se salta con `return true`. En producción, cualquiera puede enviar webhooks falsos. |
| **Solución** | Solo skip en dev: |

```typescript
if (!this.appSecret) {
  if (process.env.NODE_ENV === "production") return false;
  return true; // solo skip en desarrollo
}
```

---

### 4. API Keys de IA almacenadas en texto plano
| | |
|---|---|
| **Archivo** | `apps/api/src/ai/ai-config.service.ts` (L47) |
| **Problema** | Las API keys de OpenAI/Claude/Gemini de cada tenant se guardan sin cifrar en la DB. Si la DB se compromete, todas las keys quedan expuestas. |
| **Solución** | Cifrar con AES-256-GCM antes de guardar, descifrar al usar. Necesita variable `ENCRYPTION_KEY` en env: |

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function encrypt(text: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
```

---

### 5. Credenciales demo visibles en login
| | |
|---|---|
| **Archivo** | `apps/web/src/app/login/page.tsx` (L194-199) |
| **Problema** | El banner `admin@demoa.com / password123` se muestra si `NODE_ENV !== "production"`. Si el deploy no configura esto correctamente, se exponen credenciales. |
| **Solución** | Reemplazar con variable explícita: |

```typescript
{process.env.NEXT_PUBLIC_SHOW_DEMO === "true" && (
  <div className="...">Demo: admin@demoa.com / password123</div>
)}
```

---

### 6. URL de API inconsistente en frontend
| | |
|---|---|
| **Archivos** | `apps/web/src/lib/api.ts` (L1), `lead-sources/page.tsx` (L9), `reports/page.tsx` (L10), `properties/page.tsx` (L226) |
| **Problema** | 4 archivos definen su propio `API_URL` con fallback a `localhost:4000`. `lead-sources/page.tsx` agrega `/api` inconsistente. Si `NEXT_PUBLIC_API_URL` no está seteado en producción, todo rompe silenciosamente. |
| **Solución** | Centralizar en `api.ts` y exportar. Los demás archivos deben importar de ahí: |

```typescript
// api.ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
```

---

### 7. Seed peligroso en producción
| | |
|---|---|
| **Archivo** | `packages/db/src/seed.ts` |
| **Problema** | Crea 24+ leads falsos, tenants demo, conversaciones sample, y usuarios con `password123`. Si alguien ejecuta `prisma db seed` en producción, contamina la DB. |
| **Solución** | Agregar guard al inicio del seed: |

```typescript
if (process.env.NODE_ENV === "production") {
  console.log("⚠️ Seed skipped in production. Use seed-prod.ts instead.");
  process.exit(0);
}
```

---

### 8. Webhook de WhatsApp acepta requests sin firma
| | |
|---|---|
| **Archivo** | `apps/api/src/channels/webhooks.controller.ts` (L272-283) |
| **Problema** | Si `EVOLUTION_WEBHOOK_SECRET` no está configurado, el webhook procesa la request igualmente (solo loguea warning). Cualquiera puede enviar mensajes falsos. |
| **Solución** | En producción, rechazar si no hay secret: |

```typescript
if (!secret) {
  if (process.env.NODE_ENV === "production") {
    this.logger.error("EVOLUTION_WEBHOOK_SECRET required in production");
    return;
  }
  // solo aceptar sin firma en desarrollo
}
```

---

## 🟡 MEDIOS (resolver pronto, no bloquean producción)

### 9. Bot de Telegram — username hardcodeado
| | |
|---|---|
| **Archivo** | `apps/api/src/channels/providers/telegram.provider.ts` (L71) |
| **Problema** | `getBotUsername()` retorna `"InmoFlowBot"` fijo. |
| **Solución** | Usar `process.env.TELEGRAM_BOT_USERNAME` o llamar a la API `getMe` al iniciar. |

---

### 10. Token de verificación Meta en código fuente
| | |
|---|---|
| **Archivo** | `apps/api/src/lead-sources/meta-webhook.controller.ts` (L35) |
| **Problema** | `process.env.META_VERIFY_TOKEN ?? "inmoflow-meta-verify"` — el token default es público. |
| **Solución** | Requerir que `META_VERIFY_TOKEN` esté configurado, sin default. |

---

### 11. Porcentajes de comisión hardcodeados
| | |
|---|---|
| **Archivo** | `apps/api/src/commissions/commissions.service.ts` (L124-125) |
| **Problema** | `commPct = commPct ?? 3` y `agentPct = agentPct ?? 50` — fallbacks mágicos pueden generar cálculos financieros incorrectos. |
| **Solución** | Hacer configurable por tenant en la DB o requerir que exista una regla de comisión. |

---

### 12. Límites de planes hardcodeados
| | |
|---|---|
| **Archivo** | `apps/api/src/plan/plan.service.ts` (L15-43) |
| **Problema** | STARTER: 3 users, 5 rules, 2 channels — todo fijo en código. Cambiar un plan requiere deploy. |
| **Solución** | Mover definición de planes a la DB para gestión dinámica. |

---

### 13. Lead Scoring no configurable por tenant
| | |
|---|---|
| **Archivo** | `apps/api/src/lead-scoring/lead-scoring.service.ts` (L9-40) |
| **Problema** | Pesos (email=5, phone=5, messages=20) y umbrales (HOT≥60, WARM≥30) hardcodeados. |
| **Solución** | Permitir configuración por tenant almacenada en DB. |

---

### 14. Tiempo de respuesta de agente siempre NULL
| | |
|---|---|
| **Archivo** | `apps/api/src/agent-performance/agent-performance.service.ts` (L133) |
| **Problema** | `avgResponseTimeMinutes: null` — el campo existe en la interfaz pero nunca se calcula. |
| **Solución** | Calcular comparando timestamps del mensaje IN vs el siguiente OUT del mismo agente por lead. |

---

### 15. scoreAllLeads — N+1 queries
| | |
|---|---|
| **Archivo** | `apps/api/src/lead-scoring/lead-scoring.service.ts` (L118-128) |
| **Problema** | Recorre todos los leads del tenant uno por uno, generando miles de queries individuales. |
| **Solución** | Paralelizar con chunks (`Promise.all` con concurrency 10) o hacer una sola query agregada. |

---

### 16. Dashboard carga TODOS los leads para agrupar por fuente
| | |
|---|---|
| **Archivo** | `apps/api/src/dashboard/dashboard.service.ts` (L86-88) |
| **Problema** | `findMany` sin límite para obtener leads por source. Con miles de leads es muy lento. |
| **Solución** | Usar `groupBy` con `_count` como las demás agregaciones. |

---

### 17. Import CSV sin detección de duplicados
| | |
|---|---|
| **Archivo** | `apps/api/src/import/import.service.ts` (L105-170) |
| **Problema** | Importar el mismo CSV dos veces duplica todos los leads. |
| **Solución** | Agregar dedup opcional por phone/email antes de crear. |

---

### 18. 20+ catch blocks silenciosos en frontend
| | |
|---|---|
| **Archivos** | `reports/page.tsx`, `properties/page.tsx`, `tags/page.tsx`, `visits/page.tsx`, `pipeline/page.tsx`, `dashboard/page.tsx`, `layout.tsx`, `follow-ups/page.tsx`, `custom-fields/page.tsx`, `commissions/page.tsx`, `conversation/page.tsx` |
| **Problema** | `catch { /* */ }` o `.catch(() => {})` — errores tragados sin feedback al usuario. |
| **Solución** | Mostrar toast de error o estado de error en la UI. Mínimo: `catch(e) { toast.error("Error cargando datos"); }` |

---

### 19. 16+ usos de `any` en frontend
| | |
|---|---|
| **Archivos** | `properties/page.tsx`, `visits/page.tsx`, `tags/page.tsx`, `import/page.tsx`, `follow-ups/page.tsx`, `commissions/page.tsx`, `custom-fields/page.tsx` |
| **Problema** | `catch (e: any)`, `(t as any)._count`, `const data: any` — pierden type-safety. |
| **Solución** | Reemplazar con tipos correctos de la API o `unknown` + type guards. |

---

### 20. Worker fallbacks a localhost
| | |
|---|---|
| **Archivos** | `apps/worker/src/worker.module.ts` (L18), `apps/worker/src/services/message-sender.service.ts` (L25) |
| **Problema** | Redis y Evolution API caen a `localhost` si no hay env vars. |
| **Solución** | Agregar validación de variables en startup del worker. |

---

### 21. AI fallback envía mensajes estáticos en español
| | |
|---|---|
| **Archivo** | `apps/worker/src/services/rule-engine.service.ts` (L438-455) |
| **Problema** | `generateFollowUpMessage()` tiene templates estáticos hardcodeados que se envían a clientes reales cuando la IA no está disponible. |
| **Solución** | Hacerlo configurable por tenant (plantilla fallback en DB), o no enviar nada si la IA falla. |

---

### 22. `any` en where clauses del backend
| | |
|---|---|
| **Archivos** | `commissions.service.ts`, `reports.service.ts`, `visits.service.ts`, `properties.service.ts` |
| **Problema** | `const where: any = { tenantId }` en lugar de tipos Prisma. |
| **Solución** | Usar `Prisma.XxxWhereInput` para type safety. |

---

## 🟢 BAJOS (mejoras de calidad, no urgentes)

### 23. Health check solo verifica DB
| | |
|---|---|
| **Archivo** | `apps/api/src/health/health.controller.ts` |
| **Problema** | No verifica Redis (BullMQ) ni servicios externos. |
| **Solución** | Agregar check de Redis y opcionalmente Evolution API. |

---

### 24. Sin rate limiting en webhooks
| | |
|---|---|
| **Archivos** | `webhooks.controller.ts`, `meta-webhook.controller.ts`, `inbound-webhook.controller.ts` |
| **Problema** | El throttle global (60 req/min) aplica, pero webhooks de alto volumen podrían necesitar límites propios. |
| **Solución** | Agregar `@Throttle` específico o exentar con límites más altos. |

---

### 25. Telegram bot token check con magic string
| | |
|---|---|
| **Archivo** | `apps/api/src/channels/providers/telegram.provider.ts` (L32) |
| **Problema** | `if (!this.botToken \|\| this.botToken === "change-me")` — el `"change-me"` sugiere que hay templates con placeholders. |
| **Solución** | Solo chequear falsy; remover la comparación con magic string. |

---

### 26. Resumen de comisiones carga todo en memoria
| | |
|---|---|
| **Archivo** | `apps/api/src/commissions/commissions.service.ts` (L205-255) |
| **Problema** | `getSummary` recorre todas las comisiones en JS en vez de agregar en DB. |
| **Solución** | Usar `groupBy` y `aggregate` de Prisma. |

---

### 27. Sin paginación en varios endpoints
| | |
|---|---|
| **Archivos** | `follow-ups.service.ts`, `visits.service.ts`, `custom-fields.service.ts` |
| **Problema** | `findAll` retorna todo sin limit/offset. |
| **Solución** | Agregar parámetros de paginación con defaults razonables. |

---

### 28. Agent Performance — N+1 queries
| | |
|---|---|
| **Archivo** | `apps/api/src/agent-performance/agent-performance.service.ts` (L54-102) |
| **Problema** | 10 queries paralelas por cada agente en un loop. 20 agentes = 200 queries. |
| **Solución** | Agregar métricas en menos queries con `groupBy` sobre todos los agentes. |

---

### 29. Sin validación de formularios en frontend
| | |
|---|---|
| **Archivos** | `properties/page.tsx`, `visits/page.tsx` |
| **Problema** | Los formularios de creación envían datos sin validación client-side. |
| **Solución** | Agregar validación de campos requeridos antes del submit. |

---

### 30. `workflow.execute` ejecuta todas las reglas
| | |
|---|---|
| **Archivo** | `apps/worker/src/processors/workflow.processor.ts` (L39-47) |
| **Problema** | El trigger manual "Ejecutar ahora" evalúa TODAS las reglas con trigger `workflow.execute` en vez de la regla específica. |
| **Solución** | Implementar ejecución por rule ID para triggers manuales. |

---

### 31. `wait` action limitada a 5 minutos
| | |
|---|---|
| **Archivo** | `apps/worker/src/services/rule-engine.service.ts` (L105) |
| **Problema** | `Math.min(action.delayMs, 300_000)` — bloquea el worker thread. Delays mayores se capan silenciosamente. |
| **Solución** | Para delays largos, programar un job delayed en BullMQ en vez de `sleep()`. |

---

### 32. Round-robin incluye ADMIN
| | |
|---|---|
| **Archivo** | `apps/worker/src/services/rule-engine.service.ts` (L246) |
| **Problema** | `role: { not: "BUSINESS" }` excluye solo BUSINESS. ADMIN también recibe leads por round-robin. |
| **Solución** | Usar `role: { in: ["AGENT"] }` para ser más preciso. |

---

### 33. `placeholder.json` vacío
| | |
|---|---|
| **Archivo** | `apps/web/public/placeholder.json` |
| **Problema** | Contiene solo `{}`. Archivo innecesario. |
| **Solución** | Eliminar si no se usa. |

---

### 34-38. Localhost fallbacks en backend (5 archivos)
| Archivo | Variable faltante |
|---|---|
| `meta-oauth.service.ts` (L38) | `API_URL` |
| `evolution.provider.ts` (L18) | `EVOLUTION_API_URL` |
| `webhooks.controller.ts` (L62) | `API_URL` |
| `public.controller.ts` (L59) | `FRONTEND_URL` |
| `event-producer.module.ts` (L10) | `REDIS_HOST` |

**Solución**: Validar todas las variables requeridas en `validateEnv()` al arrancar.

---

## Resumen por prioridad

| Prioridad | Cantidad | Esfuerzo estimado |
|-----------|----------|-------------------|
| 🔴 Crítico | 8 | ~4-6 horas |
| 🟡 Medio | 14 | ~8-12 horas |
| 🟢 Bajo | 16 | ~6-8 horas |
| **Total** | **38** | **~18-26 horas** |

## Orden de trabajo recomendado

### Sprint 1 — Seguridad (urgente)
1. ~~#2~~ Eliminar `"fallback-insecure-secret"` → throw error
2. ~~#3~~ Meta webhook: rechazar sin firma en producción
3. ~~#8~~ WhatsApp webhook: rechazar sin firma en producción
4. ~~#4~~ Cifrar API keys de IA en DB
5. ~~#5~~ Quitar banner de demo o proteger con env var
6. ~~#7~~ Guard en seed para producción

### Sprint 2 — Funcionalidad core
7. ~~#1~~ Implementar QR real con `qrcode` npm
8. ~~#6~~ Centralizar API_URL en frontend
9. ~~#17~~ Dedup en import CSV
10. ~~#14~~ Calcular tiempo de respuesta de agente
11. ~~#21~~ Fallback de IA configurable por tenant

### Sprint 3 — Performance y calidad
12. ~~#15~~ Optimizar scoreAllLeads
13. ~~#16~~ Dashboard groupBy en vez de findMany
14. ~~#18~~ Agregar toast de error en catch blocks
15. ~~#28~~ Optimizar queries de agent-performance
16. ~~#26~~ Comisiones summary con aggregate

### Sprint 4 — Polish
17. ~~#19~~ Eliminar `any` en frontend
18. ~~#22~~ Eliminar `any` en backend
19. ~~#27~~ Paginar endpoints sin paginación
20. ~~#29~~ Validación de formularios frontend
21. Resto de items bajos
