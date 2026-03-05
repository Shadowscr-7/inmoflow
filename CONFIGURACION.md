# Guía de Configuración — InmoFlow

## Resumen general

InmoFlow es una plataforma SaaS multi-tenant. Una vez desplegada, necesita configurar las credenciales de los servicios externos con los que se integra.

- **PostgreSQL + Redis**: ya vienen configurados en `docker-compose.yml`
- **Auth**: funciona de fábrica, solo cambiar `JWT_SECRET` en producción
- **CRM / Pipeline / Dashboard**: funcionan sin config extra
- **Canales de mensajería**: requieren credenciales externas (ver abajo)
- **Meta Lead Ads**: requiere una Facebook App (ver abajo)
- **Agente IA**: cada usuario BUSINESS configura su propio proveedor desde la UI

---

## Variables de entorno (.env)

```bash
# ─── Base de datos ─────────────────────────────────
DATABASE_URL=postgresql://inmoflow:inmoflow@localhost:5432/inmoflow?schema=public

# ─── Redis ─────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=inmoflow-redis   # cambiar en producción

# ─── Auth ──────────────────────────────────────────
JWT_SECRET=change-me-in-production-super-secret-key  # ⚠️ CAMBIAR
JWT_EXPIRES_IN=7d

# ─── API ───────────────────────────────────────────
API_PORT=4000
NODE_ENV=development            # production en deploy
CORS_ORIGINS=http://localhost:3000

# ─── Frontend ──────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000

# ─── Evolution API (WhatsApp) ──────────────────────
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=tu-api-key-real

# ─── Telegram ──────────────────────────────────────
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# ─── Meta / Facebook ──────────────────────────────
META_APP_ID=tu-app-id
META_APP_SECRET=tu-app-secret
META_VERIFY_TOKEN=inmoflow-meta-verify

# ─── Plataforma ──────────────────────────────────
PLATFORM_DOMAIN=tuplataforma.com
```

---

## 1. WhatsApp — Evolution API

### Qué necesitás (una sola vez como administrador):
1. Instalar [Evolution API](https://github.com/EvolutionAPI/evolution-api) (Docker o servicio)
2. Configurar las variables:
   ```
   EVOLUTION_API_URL=http://tu-servidor:8080
   EVOLUTION_API_KEY=tu-api-key
   ```

### Qué hace cada usuario BUSINESS (desde la UI):
1. Entra a **Canales** en el dashboard
2. Crea un canal de tipo WhatsApp
3. Escanea el código QR que aparece en pantalla con su WhatsApp Business
4. Listo — los mensajes entrantes crean leads automáticamente

### Notas:
- Cada agente puede tener su propio canal de WhatsApp
- El QR vincula un número de teléfono específico a ese canal
- Evolution API soporta múltiples sesiones simultáneas

---

## 2. Telegram — Bot token

### Qué necesitás (una sola vez como administrador):
1. Hablar con [@BotFather](https://t.me/BotFather) en Telegram
2. Crear un bot con `/newbot`
3. Copiar el token y ponerlo en `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyz
   ```

### Qué hace cada usuario BUSINESS (desde la UI):
1. Entra a **Canales** en el dashboard
2. Crea un canal de tipo Telegram
3. Se le muestra un link del bot — lo comparte con sus clientes
4. Los clientes envían `/start` y quedan registrados como leads

---

## 3. Meta Lead Ads — Facebook OAuth

### Qué necesitás (una sola vez como administrador):

1. **Crear una Facebook App** en [developers.facebook.com](https://developers.facebook.com):
   - Tipo: "Business"
   - Agregar producto: "Facebook Login for Business"
   
2. **Configurar permisos de la App**:
   - `pages_show_list` — listar páginas
   - `pages_read_engagement` — leer interacciones
   - `pages_manage_metadata` — suscribir webhooks
   - `leads_retrieval` — recibir datos de leads

3. **Configurar redirect URI** en la App de Facebook:
   - Desarrollo: `http://localhost:4000/api/meta/callback`
   - Producción: `https://tu-dominio.com/api/meta/callback`

4. **Configurar Webhooks** en la App de Facebook:
   - URL del webhook: `https://tu-dominio.com/api/webhooks/meta`
   - Verify token: `inmoflow-meta-verify` (o el que pongas en `META_VERIFY_TOKEN`)
   - Suscribir al campo: `leadgen`

5. **Poner credenciales en `.env`**:
   ```
   META_APP_ID=123456789012345
   META_APP_SECRET=abc123def456...
   ```

### Qué hace cada usuario BUSINESS (desde la UI):
1. Entra a **Fuentes de Leads**
2. Hace clic en "Conectar Meta Ads"
3. Se abre un popup de Facebook → autoriza a InmoFlow
4. Selecciona su página de Facebook
5. Selecciona el formulario de Lead Ads
6. Confirma → se crea la fuente de leads automáticamente
7. Puede repetir para conectar más formularios

### Notas:
- Cada tenant tiene su propio token de acceso
- Los tokens de página son permanentes (no expiran)
- Si el BUSINESS tiene varias páginas/formularios, conecta cada uno por separado

---

## 4. Agente IA — Configurado por cada BUSINESS

### No requiere configuración de plataforma.

Cada usuario BUSINESS configura su propio proveedor de IA desde la UI:

1. Entra a **Agente IA** en la configuración
2. Selecciona un proveedor: OpenAI, Gemini, Claude, Grok, DeepSeek o Qwen
3. Ingresa su API Key del proveedor elegido
4. Selecciona el modelo (ej: gpt-4o, claude-3.5-sonnet, etc.)
5. Escribe el system prompt (instrucciones generales del agente)
6. Prueba la conexión con el botón "Probar"
7. Activa el agente

### Cómo funciona en las automatizaciones:
- En cualquier automatización, la acción "Mensaje IA" usa el agente configurado
- El usuario puede escribir un prompt personalizado para cada automatización
- Si no hay agente IA configurado, "Mensaje IA" genera respuestas automáticas estáticas

### Proveedores soportados:

| Proveedor | Modelos populares | Compatibilidad |
|-----------|-------------------|----------------|
| OpenAI | gpt-4o, gpt-4o-mini, gpt-3.5-turbo | API nativa |
| Google Gemini | gemini-1.5-pro, gemini-2.0-flash | API nativa |
| Anthropic Claude | claude-3.5-sonnet, claude-3-haiku | API nativa |
| xAI Grok | grok-2, grok-2-mini | Compatible OpenAI |
| DeepSeek | deepseek-chat, deepseek-reasoner | Compatible OpenAI |
| Alibaba Qwen | qwen-turbo, qwen-plus, qwen-max | Compatible OpenAI |

---

## Checklist de producción

- [ ] Cambiar `JWT_SECRET` por un valor seguro
- [ ] Configurar `CORS_ORIGINS` con el dominio real
- [ ] Configurar `PLATFORM_DOMAIN`
- [ ] Poner `NODE_ENV=production`
- [ ] Configurar `REDIS_PASSWORD` seguro
- [ ] Configurar HTTPS (Nginx reverse proxy o load balancer)
- [ ] Configurar credenciales de Evolution API, Telegram y Meta según necesidad
- [ ] Correr migraciones: `docker compose --profile migrate run migrate`
- [ ] Verificar healthcheck: `GET /api/health`

---

## Usuarios seed (desarrollo)

| Email | Password | Rol | Tenant |
|-------|----------|-----|--------|
| admin@inmoflow.com | password123 | ADMIN | Sin tenant (super-admin) |
| admin@demoa.com | password123 | BUSINESS | Inmobiliaria Demo A |
| agent@demoa.com | password123 | AGENT | Inmobiliaria Demo A |
