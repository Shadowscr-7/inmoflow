# InmoFlow

### La plataforma CRM todo-en-uno para inmobiliarias modernas

---

## ¿Qué es InmoFlow?

InmoFlow es un **CRM especializado para inmobiliarias** que centraliza toda la operación comercial en una sola plataforma: desde la captura del lead hasta el cierre de la operación.

Conecta todos tus canales de comunicación, automatiza tareas repetitivas, y potencia a tu equipo con inteligencia artificial — todo sin depender de terceros ni pagar suscripciones mensuales.

**Licencia de por vida. Un solo pago. Tu CRM para siempre.**

<!-- 📸 IMAGEN: Captura del Dashboard principal mostrando las métricas (leads totales, pipeline, canales activos, tasa de conversión) -->

---

## Problemática

| Lo que pasa hoy | Con InmoFlow |
|-----------------|-------------|
| Leads repartidos entre Excel, WhatsApp personal y email | Todos los leads centralizados en un mismo lugar |
| No sabés qué agente está atendiendo a quién | Asignación automática con visibilidad total |
| Se pierden consultas en WhatsApp y redes sociales | Todos los mensajes llegan al CRM en tiempo real |
| No hay seguimiento del embudo de ventas | Pipeline visual tipo Kanban con drag-and-drop |
| Respondés tarde y perdés oportunidades | Respuestas automáticas instantáneas con IA |
| Dependés de plataformas con suscripción mensual | Pago único, sin costos recurrentes |

---

## Módulos del sistema

### 1. Gestión de Leads

El corazón del CRM. Cada consulta que llega —ya sea por WhatsApp, Telegram, Facebook o manualmente— se convierte automáticamente en un lead con toda su información.

**Qué podés hacer:**
- Crear, editar y gestionar leads con información completa (nombre, teléfono, email, notas, intención de compra)
- Asignar leads a agentes del equipo (manual o automáticamente)
- Score de calificación (0–100) para priorizar los más calientes
- Búsqueda y filtros avanzados por estado, etapa, agente asignado y texto libre
- Historial completo de cada lead: mensajes, cambios de estado, notas, todo en una timeline

<!-- 📸 IMAGEN: Vista de lista de leads con filtros activos y badges de estado -->

**Perfil enriquecido del lead:**
- Presupuesto (mínimo–máximo)
- Zonas de interés
- Tipo de propiedad buscada
- Cantidad de ambientes, baños, cochera
- Resumen generado por IA del perfil del comprador

<!-- 📸 IMAGEN: Vista de detalle de un lead mostrando perfil, timeline y mensajes -->

---

### 2. Pipeline Visual (Embudo de Ventas)

Visualizá en qué etapa está cada operación con un tablero Kanban interactivo.

**Etapas por defecto:**
Nuevo → Contactado → Calificado → Visita → Negociación → Ganado → Perdido

**Qué podés hacer:**
- Mover leads entre etapas con drag-and-drop
- Crear etapas personalizadas para tu proceso de ventas
- Reordenar etapas según tu flujo
- Ver la cantidad de leads en cada etapa de un vistazo RÁPIDO
- Identificar cuellos de botella en tu embudo

<!-- 📸 IMAGEN: Pipeline Kanban con leads en diferentes etapas, mostrando las tarjetas con nombre y estado -->

---

### 3. Comunicación Multi-Canal

Atendé a tus clientes desde donde ellos te escriban, sin salir del CRM.

#### WhatsApp

La integración más importante para el mercado inmobiliario latinoamericano.

- Conectá tu WhatsApp escaneando un QR desde el navegador
- Cada agente puede tener su propio WhatsApp conectado
- Los mensajes entrantes crean leads automáticamente
- Respondé directo desde el CRM
- Historial completo de la conversación en la timeline del lead

<!-- 📸 IMAGEN: Pantalla de conexión de canal WhatsApp mostrando el QR code -->

#### Telegram

- Bot integrado que recibe mensajes y crea leads
- Cada agente se vincula con un link único
- Respuestas directas desde la plataforma

#### Facebook Lead Ads

- Conectá tu cuenta de Facebook con OAuth (un click)
- Seleccioná la Página y el Formulario de Lead Ads que querés vincular
- Cuando alguien completa un formulario en Facebook → el lead aparece automáticamente en InmoFlow con su nombre, email y teléfono
- Sin copiar y pegar, sin demoras

<!-- 📸 IMAGEN: Wizard de conexión de Meta Lead Ads (paso de selección de Page + Form) -->

#### Web

- Canal de formularios web para capturar consultas de tu sitio

---

### 4. Mensajería y Templates

Sistema completo de mensajería integrado con todos los canales.

**Qué podés hacer:**
- Ver todas las conversaciones de cada lead en una timeline unificada
- Enviar mensajes a WhatsApp y Telegram desde el CRM
- Crear plantillas de mensajes reutilizables con variables dinámicas:
  - `{{nombre}}` → se reemplaza por el nombre del lead
  - `{{telefono}}` → su teléfono
  - `{{email}}` → su email
- Asignar plantillas a canales específicos o usarlas en todos
- Activar/desactivar plantillas sin borrarlas

**Ejemplo de template:**
> Hola {{nombre}}, gracias por tu consulta sobre propiedades en nuestra inmobiliaria. Un asesor se va a comunicar con vos a la brevedad. ¿En qué zona estás buscando?

<!-- 📸 IMAGEN: Pantalla de templates mostrando la lista con una vista previa del contenido -->

---

### 5. Automatizaciones Inteligentes

Motor de reglas que trabaja por vos las 24 horas del día.

**¿Cómo funciona?**
Cada regla tiene un **disparador** (cuándo se activa) y una o más **acciones** (qué hace).

#### Disparadores disponibles:

| Disparador | Se activa cuando... |
|-----------|-------------------|
| Lead creado | Llega un lead nuevo por cualquier canal |
| Lead actualizado | Se modifica algún dato del lead |
| Mensaje entrante | El lead envía un mensaje por WhatsApp/Telegram |
| Cambio de etapa | El lead se mueve en el pipeline |
| Sin respuesta | Pasó un tiempo sin actividad |
| Programado | En un horario específico |

#### Acciones disponibles:

| Acción | Qué hace |
|--------|---------|
| **Asignar agente** | Asigna el lead a un agente específico o usa **round-robin** (reparte equitativamente) |
| **Enviar template** | Envía un mensaje automático por el canal correspondiente |
| **Respuesta con IA** | Genera y envía una respuesta inteligente usando el agente de IA |
| **Cambiar estado** | Mueve el lead a otro estado (Contactado, Calificado, etc.) |
| **Cambiar etapa** | Mueve el lead en el pipeline |
| **Agregar nota** | Añade una nota automática al lead |
| **Notificar** | Envía una notificación al agente asignado |
| **Esperar** | Pausa antes de ejecutar la siguiente acción |

**Ejemplo real:**
> Cuando llega un lead nuevo por WhatsApp → asignar por round-robin → enviar template de bienvenida → cambiar estado a "Contactado" → notificar al agente asignado

Las reglas se procesan en background de forma asíncrona, con reintentos automáticos si algo falla.

<!-- 📸 IMAGEN: Pantalla de reglas mostrando una regla configurada con trigger + condiciones + acciones -->

---

### 6. Agente de Inteligencia Artificial

Conectá el proveedor de IA que prefieras y dejá que tu asistente virtual responda consultas de forma inteligente.

#### Proveedores soportados:

| Proveedor | Modelos disponibles |
|-----------|-------------------|
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo |
| **Google** | Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash |
| **Anthropic** | Claude Sonnet 4, Claude 3.5 Sonnet, Claude 3 Haiku |
| **xAI** | Grok 2, Grok 2 Mini |
| **DeepSeek** | DeepSeek Chat, DeepSeek Reasoner |
| **Alibaba** | Qwen Turbo, Qwen Plus, Qwen Max |

**Qué podés hacer:**
- Elegir proveedor y modelo desde la interfaz
- Configurar el prompt del sistema (la "personalidad" del asistente)
- Ajustar temperatura y largo máximo de respuesta
- Probar el agente con un chat interactivo antes de activarlo
- Usarlo en automatizaciones: cuando llega un mensaje, la IA responde automáticamente con contexto del lead

**El agente sabe:**
- Nombre, email y teléfono del lead
- En qué etapa del pipeline está
- Qué intención de compra tiene
- Las últimas 10 conversaciones
- Las notas del agente

<!-- 📸 IMAGEN: Pantalla de configuración del Agente IA con selector de proveedor + modelo + chat de prueba -->

---

### 7. Lead Sources (Fuentes de Leads)

Controlá de dónde vienen tus leads y medí el rendimiento de cada fuente.

**Tipos de fuentes:**
- Formulario web
- Facebook Lead Ads (Meta)
- WhatsApp entrante
- Telegram entrante
- Carga manual

Cada fuente muestra cuántos leads generó, permitiendo medir el ROI de cada canal de captación.

<!-- 📸 IMAGEN: Pantalla de Lead Sources mostrando las fuentes con contadores de leads -->

---

### 8. Dashboard y Métricas

Panel principal con una vista rápida de toda la operación.

**Métricas incluidas:**
- Total de leads activos
- Leads por etapa del pipeline
- Canales de comunicación activos
- Tasa de conversión
- Actividad reciente

<!-- 📸 IMAGEN: Dashboard principal con las 4 tarjetas de métricas + gráfico de pipeline -->

---

### 9. Equipo y Permisos

Sistema de roles para que cada persona vea exactamente lo que necesita.

| Rol | Permisos |
|-----|---------|
| **Business** (dueño) | Todo: crear usuarios, ver todos los leads, configurar canales, reglas y IA |
| **Agent** (agente) | Ver y gestionar sus leads asignados, enviar mensajes, ver pipeline |
| **Viewer** (observador) | Solo lectura: ve leads y métricas pero no modifica nada |

<!-- 📸 IMAGEN: Pantalla de gestión de usuarios mostrando la tabla con roles -->

---

### 10. Notificaciones

Sistema de notificaciones en tiempo real dentro de la plataforma.

- Lead asignado a un agente → notificación instantánea
- Cambio de etapa en el pipeline → notificación
- Mensaje entrante de un lead → notificación
- Regla ejecutada → notificación
- Marcar como leídas individual o masivamente

<!-- 📸 IMAGEN: Panel de notificaciones con el badge de cantidad y la lista desplegable -->

---

### 11. Actividad y Auditoría

Registro completo de todo lo que pasa en el sistema.

Cada acción queda registrada con fecha, hora, usuario y detalle:
- Creación y edición de leads
- Mensajes enviados y recibidos
- Conexión y desconexión de canales
- Ejecución de reglas y automatizaciones
- Errores de proveedores externos

Útil para auditoría, resolución de problemas y trazabilidad completa.

<!-- 📸 IMAGEN: Pantalla de Activity Log mostrando eventos recientes con iconos y timestamps -->

---

### 12. Perfil y Configuración

- Cada usuario gestiona su propio perfil (nombre, cambio de contraseña)
- Configuración del tenant (nombre de la empresa)
- Gestión de planes y límites

<!-- 📸 IMAGEN: Pantalla de perfil del usuario -->

---

## Arquitectura y Tecnología

InmoFlow está construido con tecnología moderna de nivel empresarial:

| Componente | Tecnología |
|-----------|-----------|
| Backend API | NestJS (Node.js) |
| Frontend | Next.js + Tailwind CSS |
| Base de datos | PostgreSQL |
| Colas de trabajo | Redis + BullMQ |
| Infraestructura | Docker containers |
| Proxy y SSL | Nginx + Let's Encrypt |

**Ventajas técnicas:**
- **Datos aislados:** Cada inmobiliaria tiene sus datos completamente separados (arquitectura multi-tenant)
- **Código fuente incluido:** No es SaaS, es tu software. Lo instalás en tu servidor.
- **Sin dependencias de terceros:** Si un servicio externo se cae, tu CRM sigue funcionando
- **Backups automáticos:** Backup diario de la base de datos con retención de 30 días
- **Monitoreo incluido:** Health check cada 5 minutos con alertas opcionales
- **SSL automático:** Certificado HTTPS gratuito con renovación automática
- **Instalación en un comando:** `sudo ./scripts/deploy.sh` y listo

---

## Planes

### Starter — $997 USD (pago único)

Para inmobiliarias que arrancan.

- Hasta 3 usuarios
- 2 canales: WhatsApp + Web
- Pipeline visual Kanban
- Hasta 5 reglas de automatización
- Plantillas de mensajes
- Dashboard con métricas
- Soporte por email

### Professional — $1.997 USD (pago único)

El plan completo para crecer.

- Hasta 10 usuarios
- Todos los canales: WhatsApp, Telegram, Email, Facebook Lead Ads
- Pipeline visual Kanban
- Automatizaciones ilimitadas
- **Agente de IA** (ChatGPT, Gemini, Claude, Grok, DeepSeek, Qwen)
- Facebook Lead Ads integrado
- Plantillas y respuestas automáticas
- Dashboard avanzado
- Roles y permisos completos
- Soporte prioritario por WhatsApp

### Custom — $4.997 USD (pago único)

Para inmobiliarias exigentes.

- Todo lo del plan Professional
- **Usuarios ilimitados**
- Sitio web inmobiliario a medida
- Configuración y entrenamiento del agente de IA
- Soporte VIP dedicado (WhatsApp + videollamada)
- Integraciones y automatizaciones a medida
- Instalación y deploy en tu servidor

---

## ¿Por qué InmoFlow?

| Característica | InmoFlow | CRMs genéricos | Planillas/Excel |
|---------------|----------|----------------|----------------|
| Especializado en inmobiliarias | ✅ | ❌ | ❌ |
| WhatsApp integrado | ✅ | A veces (extra) | ❌ |
| IA conversacional | ✅ | ❌ | ❌ |
| Facebook Lead Ads | ✅ | A veces (extra) | ❌ |
| Pipeline visual | ✅ | ✅ | ❌ |
| Automatizaciones | ✅ | Limitadas | ❌ |
| Multi-tenant | ✅ | ❌ | ❌ |
| Código fuente incluido | ✅ | ❌ | N/A |
| Pago único | ✅ | ❌ (mensual) | ✅ (gratis) |
| Instalación en tu servidor | ✅ | ❌ (cloud del proveedor) | N/A |

---

## Resumen

InmoFlow no es solo un CRM — es el sistema operativo comercial de tu inmobiliaria.

Centraliza leads, conecta canales, automatiza seguimientos, responde con IA, y te da visibilidad total del embudo de ventas — todo desde una interfaz moderna y profesional.

**Sin suscripciones. Sin sorpresas. Tuyo para siempre.**

<!-- 📸 IMAGEN: Collage/composición mostrando múltiples pantallas del sistema en mockups de laptop y celular -->
