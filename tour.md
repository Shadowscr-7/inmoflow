Demo Completa InmoFlow — Paso a Paso
Credenciales
Usuario	Email	Password	Rol	Tenant
Super Admin	admin@inmoflow.com	password123	ADMIN	Global
Admin Tenant A	admin@demoa.com	password123	BUSINESS	Inmobiliaria Demo A (PROFESSIONAL)
Agente 1	agent@demoa.com	password123	AGENT	Demo A
Agente 2	agent2@demoa.com	password123	AGENT	Demo A
Viewer	viewer@demoa.com	password123	VIEWER	Demo A
Admin Tenant B	admin@demob.com	password123	BUSINESS	Inmobiliaria Demo B (STARTER)
FASE 1 — Super Admin (admin@inmoflow.com)
Login → http://localhost:3000/login → admin@inmoflow.com / password123
Dashboard → Ve métricas globales: total leads, propiedades, canales, tasa de conversión
Usuarios (Settings) → Ves TODOS los tenants y usuarios del sistema. Podés:
Ver "Inmobiliaria Demo A" (plan PROFESSIONAL) con 5 usuarios
Ver "Inmobiliaria Demo B" (plan STARTER) con 2 usuarios
Cambiar planes de cualquier tenant
Crear nuevos tenants/usuarios
Actividad → Ve el log global de eventos de toda la plataforma
Mi Perfil → Verificá nombre, email, rol ADMIN
Logout (click en tu avatar → Cerrar sesión)
FASE 2 — Business Admin Tenant A (admin@demoa.com)
Login → admin@demoa.com / password123
2A. Configuración Base (sidebar izquierdo)
Etapas embudo → Verificá las 7 etapas del pipeline:

Nuevo → Contactado → Calificado → Visita → Negociación → Ganado → Perdido
Podés reordenarlas arrastrando, crear nuevas, o editar las existentes
La etapa "Nuevo" debería estar marcada como default
Tags → Creá tags para clasificar leads:

"VIP" (rojo), "Urgente" (naranja), "Inversor" (azul), "Primera Vivienda" (verde), "Relocation" (violeta)
Campos custom → Definí campos personalizados:

"Presupuesto máximo" → tipo NUMBER
"Zona preferida" → tipo SELECT (opciones: Palermo, Pocitos, Carrasco, Centro, Punta Carretas)
"Fecha deseada mudanza" → tipo DATE
"Tiene preaprobación bancaria" → tipo BOOLEAN
Fuentes → Revisá las 5 fuentes de leads existentes:

Manual, Formulario Web, WhatsApp Entrante, Facebook Lead Ads, Telegram
Copiá la URL del Webhook para pruebas externas
Revisá la config de Meta Lead Ads (requiere cuenta Meta conectada)
Plantillas → Revisá las 5 plantillas de mensajes:

Bienvenida WhatsApp, Bienvenida Telegram, Seguimiento 24hs, Confirmación de Visita, Post Visita
Creá una nueva: "Oferta especial" para WhatsApp con Hola {{nombre}}, tenemos una propiedad que te puede interesar...
Automatizaciones (Rules) → Revisá las 6 reglas:

Auto-asignación round-robin de leads nuevos
Enviar bienvenida por WhatsApp/Telegram automáticamente
Notificar al agente cuando llega un lead
Seguimiento automático si no hay respuesta en 24h
IA responde mensajes entrantes
Podés activar/desactivar cada una con el toggle
2B. Canales de Comunicación
Canales → Ya conectaste WhatsApp (QR que mostraste). Verificá:
Estado "Conectado" (badge verde) en WhatsApp
Probá "Conectar Telegram" → te da un link t.me/InmoFlowBot?start=...
Tabla de "Canales del equipo" muestra todos los agentes y su estado
2C. Gestión de Propiedades
Propiedades → Creá propiedades de ejemplo:

Propiedad 1: "Apartamento 2 dormitorios Pocitos" → Tipo: Apartamento, Operación: Venta, USD 185.000, 2 dorms, 1 baño, 75m², dirección: "Av. Brasil 2850, Pocitos"
Propiedad 2: "Casa con jardín Carrasco" → Tipo: Casa, Operación: Venta, USD 320.000, 3 dorms, 2 baños, 180m²
Propiedad 3: "Oficina premium Centro" → Tipo: Oficina, Operación: Alquiler, USD 1.500/mes, 45m²
Para cada una: generá el QR Code, copiá el Link público, probá el botón WhatsApp Share
Ver propiedad pública → Abrí el link público de una propiedad en otra pestaña incógnita:

http://localhost:3000/p/{tenantId}/{slug}
Llená el formulario de contacto → debería crear un lead automáticamente
2D. Gestión de Leads
Leads → Ya hay 24 leads del seed. Explorá:

Buscá por nombre: "María García"
Filtrá por estado: NEW, CONTACTED, WON, etc.
Creá un lead nuevo manualmente: "Juan Demo", tel: +598991234567, email: juan@test.com
Asignale el tag "VIP" y la zona "Pocitos" en campos custom
Detalle de lead → Hacé click en cualquier lead para ver:

Info completa, estado, etapa del embudo, agente asignado
Tags: agregá/quitá tags
Campos custom: completá los campos que creaste
Lead Scoring: mirá el puntaje de calidad (se calcula automáticamente)
Timeline: historial de eventos del lead
Notas: agregá una nota manual
Conversación → Entrá a la conversación de un lead que tenga mensajes:

Elegí canal (WhatsApp/Telegram)
Enviá un mensaje de prueba
Observá el historial de mensajes (IN/OUT)
2E. Pipeline Visual
Embudo → Vista Kanban:
Arrastrá un lead de "Nuevo" a "Contactado"
Arrastrá otro de "Contactado" a "Calificado"
Verificá que el cambio se refleja en la lista de Leads
Observá los contadores por etapa
2F. Visitas
Visitas → Calendario semanal:
Creá una visita: seleccioná lead + propiedad + fecha/hora + agente
Cambiá estado: SCHEDULED → CONFIRMED → COMPLETED
Navegá entre semanas con las flechas
Creá otra visita para mañana y cancelala (CANCELLED)
2G. Seguimientos Automáticos
Seguimientos → Creá una secuencia:
Nombre: "Nurturing Post-Visita"
Trigger: stage_changed (cuando pasa a "Visita")
Paso 1: WhatsApp → "¡Gracias por la visita, {{nombre}}! ¿Qué te pareció?" → delay 2h
Paso 2: WhatsApp → "¿Te gustaría agendar otra visita?" → delay 24h
Paso 3: WhatsApp → "Tenemos más opciones que podrían interesarte" → delay 72h
Enrollá un lead manualmente para probar
2H. Importación
Importar → Preparate un CSV de prueba:
Subí el CSV → Mapeá columnas → Confirmá → Verificá que aparecen en Leads
2I. Reportes
Reportes → Seleccioná rango de fechas (último mes):
Leads por estado (chart)
Propiedades por estado
Visitas realizadas
Exportá CSV de leads
Exportá CSV de propiedades
2J. Rendimiento de Agentes
Rendimiento → Vista mensual:
Ve métricas de Lucía Torres y Martín Ruiz
Leads manejados, tasa de conversión, mensajes enviados, visitas
Leaderboard (ranking)
Establecé metas: 20 leads/mes, 5 visitas/mes para cada agente
2K. Comisiones
Comisiones → Tab "Reglas":

Configurá: Venta → 3% comisión, split 60% agente / 40% empresa
Alquiler → 100% del primer mes, split 50/50
Alquiler Temporal → 10%, split 70% agente / 30% empresa
Comisiones → Tab "Comisiones":

Creá una comisión: Agente Lucía, operación Venta, monto USD 185.000
El sistema calcula automáticamente: comisión $5.550, agente $3.330, empresa $2.220
Cambiá estado: Pendiente → Aprobada → Pagada
Comisiones → Tab "Resumen":

Observá KPIs: total deals, total comisiones, monto agentes, monto empresa
Desglose por estado, por tipo de operación, por agente
2L. Agente IA
Agente IA → (requiere plan PROFESSIONAL):
Seleccioná provider: OPENAI (o el que tengas API key)
Copiá tu API key del provider
Elegí modelo (ej: gpt-4o-mini)
Escribí un System Prompt: "Eres un asistente inmobiliario de InmoFlow. Respondés consultas sobre propiedades en español rioplatense. Sé amable y profesional."
Probalo en el chat de test
2M. Configuración de Equipo
Usuarios (Settings) → Gestión del equipo:

Ves los 5 usuarios del tenant A
Creá un nuevo agente: "Diego Test", diego@test.com, AGENT
Editá un usuario existente (cambiar nombre/rol)
Verificá los límites del plan PROFESSIONAL (10 usuarios max)
Mi Perfil →

Cambiá tu nombre
Configurá preferencias de notificación (in-app, email digest)
Cambiá tu contraseña si querés
FASE 3 — Agente (agent@demoa.com)
Login → agent@demoa.com / password123
Dashboard → Ve sus propias métricas (leads asignados, etc.)
Leads → Solo ve leads asignados o accesibles
Embudo → Arrastra sus leads entre etapas
Propiedades → Puede ver/crear propiedades, compartir por WhatsApp
Canales → Puede conectar su propio WhatsApp/Telegram
Comisiones → Ve sus propias comisiones (no puede crear/aprobar)
Mi Perfil → Edita su perfil, preferencias de notificación
FASE 4 — Viewer (viewer@demoa.com)
Login → viewer@demoa.com / password123
Dashboard → Solo lectura de métricas
Actividad → Ve log de eventos (solo lectura)
Mi Perfil → Solo puede editar su propio perfil
Verificá que NO ve: Leads, Embudo, Propiedades, Settings, Reportes, etc.
FASE 5 — Tenant B / Plan STARTER (admin@demob.com)
Login → admin@demob.com / password123
Dashboard → Métricas del Tenant B (solo 5 leads)
Verificar restricciones STARTER:
Max 3 usuarios (ya tiene 2)
Max 5 reglas
Agente IA → No visible o bloqueado (requiere PROFESSIONAL)
Intentar agregar más de 3 usuarios → Debería mostrar error de límite de plan
FASE 6 — Flujo Completo de Negocio (admin@demoa.com)
Simular venta completa desde inicio a fin:
Crear lead → Asignar agente → Contactar (mover a Contactado)
Calificar → Agendar visita → Completar visita
Negociar → Ganar (mover a Ganado)
Crear comisión → Aprobar → Pagar
Verificar en Reportes y Rendimiento