# InmoFlow — CRM Inteligente para Inmobiliarias

> **La plataforma todo-en-uno que convierte consultas en operaciones cerradas.**

---

## ¿Qué es InmoFlow?

InmoFlow es un CRM (Customer Relationship Manager) diseñado exclusivamente para el mercado inmobiliario. Centraliza en un solo lugar todos los canales de contacto, los leads, el equipo de agentes, las propiedades y las automatizaciones necesarias para que ninguna oportunidad se pierda.

Funciona 100% en la nube, desde cualquier dispositivo, sin instalaciones.

---

## ¿Para quién es?

| Perfil | ¿Qué gana con InmoFlow? |
|--------|------------------------|
| **Dueño / Director de inmobiliaria** | Visibilidad total del negocio en tiempo real, métricas de cada agente, control de comisiones y facturación |
| **Agente inmobiliario** | Inbox centralizado de WhatsApp y Telegram, seguimientos automáticos, agenda de visitas sincronizada con Google Calendar |
| **Equipo de marketing** | Captura automática de leads de Meta (Facebook/Instagram), difusiones masivas a base de clientes, integración con MercadoLibre |
| **Administrador de plataforma** | Gestión de múltiples inmobiliarias desde un panel único, control de planes y facturación |

---

## Módulos Principales

### 1. Dashboard General

Panel de control con todas las métricas del negocio en una sola pantalla:

- Total de leads activos y su estado en el embudo de ventas
- Tasa de conversión (leads → operaciones ganadas)
- Gráfico de llegada de leads por día (últimas 2 semanas)
- Distribución de leads por canal de origen (Meta, WhatsApp, web, manual)
- Feed de actividad reciente del equipo
- Notificaciones en tiempo real

---

### 2. Gestión de Leads

El corazón del sistema. Cada lead tiene su ficha completa:

- **Datos de contacto**: nombre, teléfono, email, canal preferido
- **Perfil de búsqueda**: tipo de propiedad, zona, presupuesto, dormitorios, garage
- **Temperatura**: FRÍO / TIBIO / CALIENTE — para priorizar el seguimiento
- **Etapa en el embudo**: Nuevo → Contactado → Calificado → Visita → Negociación → Ganado / Perdido
- **Conversación completa**: historial de WhatsApp y Telegram dentro del mismo sistema
- **Notas y etiquetas**: para organizar y buscar leads fácilmente
- **Campos personalizados**: adaptables a la operatoria de cada inmobiliaria
- **Asignación de agente**: manual o automática por reglas

---

### 3. Embudo de Ventas (Pipeline Kanban)

Vista visual tipo tablero donde los agentes ven en qué etapa está cada lead:

- Columnas personalizables por la inmobiliaria (nombre, orden, colores)
- Drag & drop para mover leads entre etapas con un clic
- Contador de leads y monto estimado por columna
- Tarjetas con información clave sin necesidad de abrir el lead

---

### 4. Captura Automática de Leads

InmoFlow conecta con todos los canales de entrada:

#### Meta Lead Ads (Facebook / Instagram)
- Conexión directa con la página de Meta mediante OAuth
- Los leads de formularios de publicidad ingresan **automáticamente** al sistema
- Mapeo de preguntas del formulario a los campos del CRM
- Vista de aprobación: el manager revisa y aprueba leads antes de asignarlos
- Recuperación retroactiva: importar leads de los últimos 90 días

#### WhatsApp
- Conexión de números de WhatsApp con QR o código de emparejamiento
- Cada mensaje entrante crea o actualiza automáticamente el lead correspondiente
- Múltiples agentes, cada uno con su propio número conectado

#### Telegram
- Conexión de bots de Telegram por agente o inmobiliaria
- Flujo similar a WhatsApp: mensajes entrantes crean leads automáticamente

#### Formulario Web
- Código embed para el sitio propio de la inmobiliaria
- Genera un API key único para integrar cualquier sistema externo vía webhook

---

### 5. Mensajería Centralizada

Todos los mensajes de WhatsApp y Telegram, en un solo lugar:

- Historial completo de conversaciones con cada lead
- Envío de mensajes con **plantillas** personalizadas y variables dinámicas (`{nombre}`, `{propiedad}`, `{precio_nuevo}`, etc.)
- Soporte de imágenes, videos y documentos adjuntos
- Estado de entrega (enviado / fallido / en cola)
- Reintento de mensajes fallidos con un clic
- Filtros por canal, dirección, estado, agente y fechas
- **Agentes** ven solo sus propias conversaciones; managers ven todo el equipo

---

### 6. Automatizaciones (Reglas y Seguimientos)

El motor de automatización elimina las tareas repetitivas:

#### Seguimientos Automáticos (Secuencias)
- Crear secuencias de mensajes con delays configurables
- Ejemplo: "A los 30 minutos de que ingrese un lead, enviar saludo. A las 24 horas, enviar ficha de propiedad. A los 3 días, recordatorio."
- Triggers: lead nuevo, asignación de agente, cambio de etapa, sin respuesta X días

#### Reglas de Negocio
- Condiciones flexibles: fuente del lead, canal, etapa, respuesta a preguntas de formulario, intención del cliente
- Acciones disponibles:
  - Asignar agente automáticamente (por nombre en el formulario de Meta)
  - Enviar mensaje por WhatsApp o Telegram
  - Cambiar estado o etapa del lead
  - Activar respuesta con Inteligencia Artificial
  - Agregar nota automática
  - Notificar al agente o manager

#### Horario de Trabajo
- Las automatizaciones solo se ejecutan dentro del horario configurado
- Las acciones fuera de horario quedan en cola y se ejecutan al inicio del siguiente día laboral

---

### 7. Agente de Inteligencia Artificial

InmoFlow integra IA para automatizar la atención inicial a leads:

- Responde automáticamente consultas por WhatsApp o Telegram
- Mantiene conversaciones contextuales (recuerda lo que el lead dijo antes)
- Compatible con múltiples proveedores de IA: **OpenAI** (GPT-4o), **Google Gemini**, **Anthropic Claude**, **DeepSeek**, entre otros
- Configurable por tenant: system prompt, temperatura, tokens máximos
- Si el tenant no tiene clave propia de IA, la plataforma ofrece un fallback por defecto
- El agente IA se puede activar/desactivar por lead individualmente
- Modo demo: las respuestas se redirigen a un número de prueba sin afectar al cliente real

---

### 8. Propiedades

Catálogo completo de propiedades del portfolio:

- Ficha de propiedad con título, descripción, precio, tipo (apartamento, casa, local, etc.), operación (venta/alquiler)
- Galería de fotos y videos (con soporte de YouTube)
- Datos técnicos: dormitorios, baños, garaje, metros cuadrados, zona, dirección, coordenadas GPS
- Estado: activa, reservada, vendida, alquilada, inactiva
- Asignación de agente responsable
- Integración con MercadoLibre: sincronización bidireccional de publicaciones
- Generación de posts para Instagram con IA
- Generación de **video reel** (30 segundos) para propiedades automáticamente

---

### 9. Agenda de Visitas

Sistema de visitas conectado con Google Calendar:

- Calendario visual interactivo (vista semanal o mensual)
- Crear visita asignando lead, propiedad, agente, fecha y hora
- Estados: Programada → Confirmada → Completada / Cancelada / No asistió
- **Recordatorio automático por WhatsApp** antes de la visita
- Sincronización con Google Calendar del agente (bidireccional)
- Disponibilidad pública: cada agente puede compartir su calendario de disponibilidad

---

### 10. Comisiones

Control transparente de la rentabilidad por operación:

- Crear comisión manual o automática al cerrar una operación
- Tipos: venta, alquiler, alquiler temporario
- Reglas de comisión configurables por tipo de operación:
  - Porcentaje total
  - Split agente / inmobiliaria (ej: 60% agente, 40% empresa)
- Estados: Pendiente → Aprobada → Pagada / Cancelada
- Adjuntar comprobante de pago
- Resumen financiero por período con gráficos

---

### 11. Difusiones Masivas

Envío de mensajes a múltiples leads de forma controlada:

- **Tipo "Cambio de Precio"**: notifica automáticamente a todos los leads que consultaron por una propiedad cuyo precio bajó
- **Tipo "Anuncio General"**: comunicado a toda una base de contactos
- Variables en el mensaje: nombre del lead, precio anterior, precio nuevo, nombre de la propiedad
- Selección de audiencia: todos los leads de Meta, todos los de un formulario específico, o por etapa del embudo
- **Flujo de aprobación**: el manager revisa cada destinatario y aprueba/rechaza antes de enviar
- Auto-aprobación para leads en etapas específicas (ej: todos los en "Calificado")
- Estadísticas de envío: enviados, fallidos, pendientes

---

### 12. Rendimiento del Equipo

Dashboard de performance por agente:

- KPIs por agente: leads contactados, visitas realizadas, operaciones ganadas, tasa de conversión
- Metas mensuales configurables (leads, visitas, ganadas)
- Barra de progreso visual hacia la meta
- Leaderboard / ranking del equipo
- Navegación por meses para comparar períodos

---

### 13. Incidencias (Soporte Interno)

Sistema de tickets para reportar problemas o solicitudes al equipo de soporte:

- Cualquier usuario puede abrir una incidencia con título, descripción y adjuntos
- Prioridades: Baja / Media / Alta / Crítica
- Estados: Pendiente → En progreso → Resuelto → Cerrado
- Notificación automática al creador cuando se resuelve
- Integración webhook: al crear un ticket, puede disparar un flujo externo (ej: GitHub Actions con Claude IA para resolver incidencias de código automáticamente)

---

### 14. MercadoLibre

Gestión de publicaciones directamente desde InmoFlow:

- Conexión OAuth con cuenta de MercadoLibre
- Listar propiedades publicadas en MeLi
- Importar propiedades de MeLi al CRM
- Actualizar precios desde InmoFlow
- Pausar / reactivar publicaciones
- Sincronización automática periódica
- Historial de cambios detectados

---

### 15. Reportes

Análisis de datos del negocio:

- Leads por estado, fuente y período
- Conversión por agente
- Mensajes enviados vs recibidos
- Canales más utilizados
- Tiempo promedio en cada etapa del embudo
- Análisis de temperatura de leads
- Exportar datos a CSV / Excel

---

### 16. Configuración del Tenant (Inmobiliaria)

Cada inmobiliaria configura su InmoFlow según su operatoria:

- **Etapas del embudo**: nombres, orden y colores personalizados
- **Campos custom**: agregar datos específicos al perfil del lead
- **Plantillas de mensajes**: mensajes prearmados con variables
- **Fuentes de leads**: configurar qué canales capturan leads
- **Reglas de automatización**: workflows propios del negocio
- **Tags**: etiquetas para clasificar leads
- **Usuarios**: crear agentes, asignar roles, gestionar accesos

---

## Integraciones Disponibles

| Plataforma | Funcionalidad |
|------------|---------------|
| **WhatsApp** (Evolution API) | Mensajes bidireccionales, múltiples números |
| **Telegram** | Bots por agente o empresa |
| **Facebook / Instagram** | Lead Ads, captura automática |
| **MercadoLibre** | Sincronización de publicaciones |
| **Google Calendar** | Sincronización de visitas |
| **OpenAI / GPT-4o** | Respuestas automáticas con IA |
| **Google Gemini** | IA alternativa |
| **Anthropic Claude** | IA alternativa |
| **Stripe / PayPal** | Facturación y suscripciones (Fase 2) |
| **Webhooks externos** | Integración con cualquier sistema |

---

## Roles y Permisos

| Rol | Descripción |
|-----|-------------|
| **Super Admin** | Acceso completo a todas las inmobiliarias de la plataforma. Gestiona planes y facturación. |
| **Business (Manager)** | Acceso completo a su inmobiliaria: leads, agentes, configuración, reportes, difusiones. |
| **Agente** | Ve y gestiona sus propios leads y mensajes. Crea comisiones. Abre incidencias. |
| **Viewer** | Solo lectura. Ideal para socios o directivos que necesitan ver sin modificar. |

---

## Planes

| | **Starter** | **Professional** | **Custom** |
|--|------------|-----------------|------------|
| Dashboard y métricas | ✅ | ✅ | ✅ |
| Gestión de leads | ✅ | ✅ | ✅ |
| Pipeline Kanban | ✅ | ✅ | ✅ |
| Mensajería (WhatsApp / Telegram) | ✅ | ✅ | ✅ |
| Meta Lead Ads | ✅ | ✅ | ✅ |
| Automatizaciones y reglas | ✅ | ✅ | ✅ |
| Propiedades y visitas | ✅ | ✅ | ✅ |
| Comisiones | ✅ | ✅ | ✅ |
| Agente IA | ❌ | ✅ | ✅ |
| Difusiones masivas | ❌ | ✅ | ✅ |
| MercadoLibre | ❌ | ✅ | ✅ |
| Reportes avanzados | ❌ | ✅ | ✅ |
| Soporte prioritario | ❌ | ❌ | ✅ |
| Integraciones a medida | ❌ | ❌ | ✅ |

---

## Seguridad y Privacidad

- Cada inmobiliaria opera en un entorno completamente aislado (multi-tenant)
- Los datos de una inmobiliaria son **invisibles** para otras
- Tokens y claves de API almacenados con **encriptación** en base de datos
- Autenticación por JWT con expiración configurable
- Control de acceso granular por rol en cada endpoint

---

## Infraestructura

- Desplegado en la nube, disponible 24/7
- Actualizaciones automáticas sin interrupciones
- Backups automáticos de base de datos
- Escalable: soporta múltiples inmobiliarias con cientos de usuarios simultáneos

---

## ¿Por qué InmoFlow?

**Antes de InmoFlow**, una inmobiliaria típica maneja:
- Leads en planillas de Excel que se desactualizan
- WhatsApp en el celular personal de cada agente
- Leads de Meta que nadie sigue porque no hay un proceso claro
- Comisiones calculadas a mano con margen de error
- Sin visibilidad del rendimiento del equipo

**Con InmoFlow**:
- Cada lead que llega por cualquier canal entra automáticamente al sistema
- El agente correcto recibe la notificación en segundos
- La IA responde fuera del horario laboral para no perder ningún cliente
- El manager ve en tiempo real qué hace cada agente
- Las comisiones se calculan solas según las reglas configuradas
- Las difusiones de cambio de precio llegan a todos los interesados en segundos

---

## Contacto

Para una demo personalizada o más información sobre planes y precios, contactanos a través de los canales disponibles en **contacthouse.com.uy**
