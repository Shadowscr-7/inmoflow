# InmoFlow — Guía de Demo Completa

> Recorrido paso a paso por toda la aplicación para armar un flujo de pruebas completo.

---

## Credenciales

| Usuario        | Email                 | Password       | Rol      | Tenant                          |
| -------------- | --------------------- | -------------- | -------- | ------------------------------- |
| Super Admin    | `admin@inmoflow.com`  | `password123`  | ADMIN    | Global (sin tenant)             |
| Admin Tenant A | `admin@demoa.com`     | `password123`  | BUSINESS | Inmobiliaria Demo A (PROFESSIONAL) |
| Agente 1       | `agent@demoa.com`     | `password123`  | AGENT    | Inmobiliaria Demo A             |
| Agente 2       | `agent2@demoa.com`    | `password123`  | AGENT    | Inmobiliaria Demo A             |
| Viewer         | `viewer@demoa.com`    | `password123`  | VIEWER   | Inmobiliaria Demo A             |
| Admin Tenant B | `admin@demob.com`     | `password123`  | BUSINESS | Inmobiliaria Demo B (STARTER)   |
| Agente B       | `agent@demob.com`     | `password123`  | AGENT    | Inmobiliaria Demo B             |

---

## Datos del Seed (Tenant A)

- **24 Leads** distribuidos en todas las etapas del pipeline
- **7 Etapas**: Nuevo → Contactado → Calificado → Visita → Negociación → Ganado → Perdido
- **5 Fuentes**: Manual, Formulario Web, WhatsApp Entrante, Facebook Lead Ads, Telegram
- **5 Plantillas**: Bienvenida WA, Bienvenida TG, Seguimiento 24hs, Confirmación Visita, Post Visita
- **6 Reglas de automatización**: Auto-assign, Bienvenidas, Notificación, Seguimiento 24h, IA
- **30+ Mensajes** realistas en español across múltiples leads
- **7 Notificaciones** de ejemplo

---

## FASE 1 — Super Admin (`admin@inmoflow.com`)

### Paso 1: Login
- Ir a `http://localhost:3000/login`
- Email: `admin@inmoflow.com` / Password: `password123`

### Paso 2: Dashboard
- Verificar métricas globales: total leads, propiedades, canales, tasa de conversión
- Gráficos de leads por estado y por fuente
- Timeline de actividad reciente
- Top agentes

### Paso 3: Usuarios (Settings)
- Ver TODOS los tenants y usuarios del sistema
- Verificar "Inmobiliaria Demo A" → plan PROFESSIONAL, 5 usuarios
- Verificar "Inmobiliaria Demo B" → plan STARTER, 2 usuarios
- Probar: cambiar plan de un tenant
- Probar: crear un nuevo tenant si se desea

### Paso 4: Actividad
- Ver el log global de eventos de toda la plataforma
- Filtrar por tipo de evento

### Paso 5: Mi Perfil
- Verificar nombre, email, rol ADMIN
- Verificar preferencias de notificación

### Paso 6: Logout
- Click en avatar → Cerrar sesión

---

## FASE 2 — Business Admin Tenant A (`admin@demoa.com`)

### Paso 7: Login
- Email: `admin@demoa.com` / Password: `password123`

---

### 2A. Configuración Base

#### Paso 8: Etapas del Embudo
- **Sidebar** → Etapas embudo
- Verificar las 7 etapas: Nuevo → Contactado → Calificado → Visita → Negociación → Ganado → Perdido
- Probar **reordenar** arrastrando las etapas
- Verificar que "Nuevo" está marcada como etapa **default**
- Opcional: crear una nueva etapa "Re-contacto" entre Contactado y Calificado

#### Paso 9: Tags
- **Sidebar** → Tags
- Crear tags para clasificar leads:
  - **VIP** (rojo)
  - **Urgente** (naranja)
  - **Inversor** (azul)
  - **Primera Vivienda** (verde)
  - **Relocation** (violeta)

#### Paso 10: Campos Custom
- **Sidebar** → Campos custom
- Crear campos personalizados:
  - "Presupuesto máximo" → tipo **NUMBER**
  - "Zona preferida" → tipo **SELECT** (opciones: Palermo, Pocitos, Carrasco, Centro, Punta Carretas)
  - "Fecha deseada mudanza" → tipo **DATE**
  - "Tiene preaprobación bancaria" → tipo **BOOLEAN**

#### Paso 11: Fuentes de Leads
- **Sidebar** → Fuentes
- Revisar las 5 fuentes existentes: Manual, Formulario Web, WhatsApp Entrante, Facebook Lead Ads, Telegram
- Copiar la **URL del Webhook** para pruebas externas
- Revisar la config de **Meta Lead Ads** (requiere cuenta Meta conectada)
- Ver el **Web Form Key** para integrar formularios

#### Paso 12: Plantillas de Mensajes
- **Sidebar** → Plantillas
- Revisar las 5 plantillas existentes
- Crear una nueva plantilla:
  - Nombre: "Oferta especial"
  - Canal: WhatsApp
  - Contenido: `Hola {{nombre}}, tenemos una propiedad que te puede interesar en la zona que buscás. ¿Te gustaría recibir más información?`
- Probar activar/desactivar una plantilla con el toggle

#### Paso 13: Automatizaciones
- **Sidebar** → Automatizaciones
- Revisar las 6 reglas existentes:
  1. Auto-asignación round-robin de leads nuevos
  2. Enviar bienvenida por WhatsApp automáticamente
  3. Enviar bienvenida por Telegram automáticamente
  4. Notificar al agente cuando llega un lead
  5. Seguimiento automático si no hay respuesta en 24h
  6. IA responde mensajes entrantes
- Probar **activar/desactivar** cada una con el toggle
- Opcional: crear una nueva regla de prueba

---

### 2B. Canales de Comunicación

#### Paso 14: Canales
- **Sidebar** → Canales
- Verificar estado de **WhatsApp** (badge verde "Conectado" si ya escaneaste el QR)
- Probar **Conectar Telegram** → se genera un link `t.me/InmoFlowBot?start=...`
- Ver tabla de "Canales del equipo" con todos los agentes y su estado de conexión

---

### 2C. Gestión de Propiedades

#### Paso 15: Crear Propiedades
- **Sidebar** → Propiedades
- Crear **Propiedad 1**:
  - Título: "Apartamento 2 dormitorios Pocitos"
  - Tipo: Apartamento
  - Operación: Venta
  - Precio: USD 185.000
  - Dormitorios: 2, Baños: 1, Área: 75 m²
  - Dirección: "Av. Brasil 2850, Pocitos"
- Crear **Propiedad 2**:
  - Título: "Casa con jardín Carrasco"
  - Tipo: Casa
  - Operación: Venta
  - Precio: USD 320.000
  - Dormitorios: 3, Baños: 2, Área: 180 m²
- Crear **Propiedad 3**:
  - Título: "Oficina premium Centro"
  - Tipo: Oficina
  - Operación: Alquiler
  - Precio: USD 1.500/mes
  - Área: 45 m²
- Para cada propiedad:
  - Generar **QR Code**
  - Copiar **Link público**
  - Probar botón **Compartir por WhatsApp**

#### Paso 16: Probar Página Pública
- Abrir el link público de una propiedad en una **pestaña de incógnito**
- URL: `http://localhost:3000/p/{tenantId}/{slug}`
- Llenar el formulario de contacto con datos de prueba
- Verificar que se crea un **lead automáticamente** en el sistema

---

### 2D. Gestión de Leads

#### Paso 17: Explorar Leads
- **Sidebar** → Leads
- Ya hay **24 leads** del seed
- **Buscar** por nombre: "María García"
- **Filtrar** por estado: NEW, CONTACTED, WON, etc.
- **Crear lead nuevo** manualmente:
  - Nombre: "Juan Demo"
  - Teléfono: +598991234567
  - Email: juan@test.com
  - Estado: NEW
- Asignar el tag **"VIP"**
- Completar campo custom "Zona preferida": Pocitos

#### Paso 18: Detalle de Lead
- Click en cualquier lead para ver su ficha completa:
  - **Info**: estado, etapa del embudo, agente asignado
  - **Tags**: agregar/quitar tags
  - **Campos custom**: completar los campos creados en el paso 10
  - **Lead Scoring**: ver el puntaje de calidad (cálculo automático)
  - **Timeline**: historial de todos los eventos del lead
  - **Notas**: agregar una nota manual: "Interesado en propiedad de Pocitos, presupuesto ~200k USD"

#### Paso 19: Conversación con Lead
- Entrar a la conversación de un lead que tenga mensajes (ej: Carlos López)
- Elegir canal: WhatsApp o Telegram
- Enviar un mensaje de prueba
- Observar el historial de mensajes (IN/OUT) con timestamps

---

### 2E. Pipeline Visual (Embudo)

#### Paso 20: Kanban
- **Sidebar** → Embudo
- Vista Kanban con las 7 columnas
- **Arrastrar** un lead de "Nuevo" a "Contactado"
- **Arrastrar** otro de "Contactado" a "Calificado"
- Verificar que los contadores por etapa se actualizan
- Volver a **Leads** y confirmar que el cambio de etapa se refleja

---

### 2F. Visitas

#### Paso 21: Calendario de Visitas
- **Sidebar** → Visitas
- Vista de calendario semanal
- **Crear visita**:
  - Lead: seleccionar uno de los leads calificados
  - Propiedad: "Apartamento 2 dormitorios Pocitos"
  - Fecha: mañana a las 10:00
  - Agente: Lucía Torres
- Cambiar estado: SCHEDULED → CONFIRMED → COMPLETED
- **Crear otra visita** para pasado mañana y **cancelarla** (CANCELLED)
- Navegar entre semanas con las flechas

---

### 2G. Seguimientos Automáticos

#### Paso 22: Crear Secuencia
- **Sidebar** → Seguimientos
- Crear nueva secuencia:
  - Nombre: "Nurturing Post-Visita"
  - Trigger: `stage_changed` (cuando el lead pasa a "Visita")
  - **Paso 1**: Canal WhatsApp → "¡Gracias por la visita, {{nombre}}! ¿Qué te pareció la propiedad?" → delay 2 horas
  - **Paso 2**: Canal WhatsApp → "{{nombre}}, ¿te gustaría agendar otra visita para ver más opciones?" → delay 24 horas
  - **Paso 3**: Canal WhatsApp → "Hola {{nombre}}, tenemos nuevas propiedades que podrían interesarte. ¿Hablamos?" → delay 72 horas
- **Enrollar** un lead manualmente para probar la secuencia

---

### 2H. Importación de Leads

#### Paso 23: Importar CSV
- **Sidebar** → Importar
- Preparar archivo `leads-demo.csv`:

```csv
nombre,telefono,email,estado,notas
Test Import 1,+598999111222,test1@demo.com,NEW,Lead de prueba importado
Test Import 2,+598999333444,test2@demo.com,NEW,Lead importado CSV
Test Import 3,+598999555666,test3@demo.com,CONTACTED,Ya contactado previamente
Test Import 4,+598999777888,test4@demo.com,NEW,Interesado en alquileres
Test Import 5,+598999999000,test5@demo.com,QUALIFIED,Lead calificado externamente
```

- **Paso 1**: Subir el archivo (drag & drop o click)
- **Paso 2**: Mapear columnas → nombre, teléfono, email, estado, notas
- **Paso 3**: Confirmar importación
- Verificar en **Leads** que los 5 nuevos leads aparecen

---

### 2I. Reportes

#### Paso 24: Generar Reportes
- **Sidebar** → Reportes
- Seleccionar rango de fechas: **último mes**
- Revisar:
  - Leads por estado (gráfico)
  - Propiedades por estado
  - Visitas realizadas
- **Exportar CSV de leads** → descargar y verificar
- **Exportar CSV de propiedades** → descargar y verificar

---

### 2J. Rendimiento de Agentes

#### Paso 25: Panel de Performance
- **Sidebar** → Rendimiento
- Vista mensual de métricas por agente:
  - **Lucía Torres**: leads manejados, tasa de conversión, mensajes enviados, visitas completadas
  - **Martín Ruiz**: mismas métricas
- Ver **Leaderboard** (ranking de agentes)
- **Establecer metas**:
  - Lucía: 20 leads/mes, 5 visitas/mes
  - Martín: 15 leads/mes, 3 visitas/mes
- Navegar entre meses con las flechas

---

### 2K. Comisiones

#### Paso 26: Configurar Reglas de Comisión
- **Sidebar** → Comisiones → Tab **"Reglas"**
- Configurar:
  - **Venta**: 3% de comisión, split 60% agente / 40% empresa
  - **Alquiler**: 100% del primer mes, split 50% agente / 50% empresa
  - **Alquiler Temporal**: 10% de comisión, split 70% agente / 30% empresa

#### Paso 27: Crear Comisiones
- Tab **"Comisiones"**
- Crear comisión:
  - Agente: Lucía Torres
  - Tipo: Venta
  - Monto del negocio: USD 185.000
  - El sistema calcula automáticamente:
    - Comisión total: **$5.550**
    - Monto agente (60%): **$3.330**
    - Monto empresa (40%): **$2.220**
- Cambiar estado: **Pendiente** → **Aprobada** → **Pagada**
- Crear otra comisión para Martín con un alquiler

#### Paso 28: Resumen de Comisiones
- Tab **"Resumen"**
- Verificar KPIs:
  - Total de negocios
  - Total comisiones generadas
  - Monto total agentes
  - Monto total empresa
- Desglose por estado, por tipo de operación, por agente

---

### 2L. Agente IA

#### Paso 29: Configurar IA
- **Sidebar** → Agente IA (requiere plan **PROFESSIONAL**)
- Seleccionar provider: **OPENAI** (o el que tengas API key)
- Ingresar tu API Key del provider
- Elegir modelo: `gpt-4o-mini` (o similar)
- Escribir **System Prompt**:

```
Eres un asistente inmobiliario de InmoFlow para Inmobiliaria Demo A.
Respondés consultas sobre propiedades en español rioplatense.
Sé amable, profesional y conciso. Ayudá a los clientes a encontrar
la propiedad ideal según su presupuesto y preferencias.
Siempre intentá agendar una visita como próximo paso.
```

- Probar en el **chat de test**: "Hola, estoy buscando un apartamento de 2 dormitorios en Pocitos"
- Verificar que la IA responde correctamente

---

### 2M. Configuración del Equipo

#### Paso 30: Gestión de Usuarios
- **Sidebar** → Usuarios (Settings)
- Ver los 5 usuarios del Tenant A
- **Crear nuevo agente**:
  - Nombre: "Diego Test"
  - Email: diego@test.com
  - Rol: AGENT
  - Password: password123
- **Editar** un usuario existente (cambiar nombre)
- Verificar límites del plan PROFESSIONAL: **máximo 10 usuarios**

#### Paso 31: Mi Perfil
- **Sidebar** → Mi Perfil
- Cambiar nombre si se desea
- Configurar **preferencias de notificación**: in-app, email digest
- Opcional: cambiar contraseña
- Verificar: email, rol, tenant, fecha de creación

---

## FASE 3 — Agente (`agent@demoa.com`)

#### Paso 32: Login
- Email: `agent@demoa.com` / Password: `password123`

#### Paso 33: Dashboard
- Ve **sus propias métricas** (leads asignados, mensajes, visitas)
- Comparar con lo que veía el Business Admin

#### Paso 34: Leads
- Ve leads asignados o accesibles
- Puede crear leads nuevos
- Puede editar leads existentes

#### Paso 35: Embudo
- Puede arrastrar **sus leads** entre etapas
- Mover un lead a "Negociación"

#### Paso 36: Propiedades
- Puede ver y crear propiedades
- Probar compartir una propiedad por WhatsApp
- Generar QR de una propiedad

#### Paso 37: Canales
- Puede conectar su **propio** WhatsApp/Telegram
- No ve canales de otros agentes (excepto la tabla admin)

#### Paso 38: Comisiones
- Ve **sus propias comisiones** en la lista
- **No puede** crear, aprobar ni pagar comisiones (solo Admin/Business)

#### Paso 39: Mi Perfil
- Edita su propio perfil
- Cambia preferencias de notificación

---

## FASE 4 — Viewer (`viewer@demoa.com`)

#### Paso 40: Login
- Email: `viewer@demoa.com` / Password: `password123`

#### Paso 41: Dashboard
- Solo **lectura** de métricas generales

#### Paso 42: Actividad
- Ve log de eventos (solo lectura)

#### Paso 43: Mi Perfil
- Puede editar su propio perfil

#### Paso 44: Verificar Restricciones
- Confirmar que **NO aparecen** en el sidebar:
  - ❌ Leads
  - ❌ Embudo
  - ❌ Propiedades
  - ❌ Visitas
  - ❌ Seguimientos
  - ❌ Tags / Campos custom / Etapas
  - ❌ Fuentes / Canales / Plantillas
  - ❌ Automatizaciones / Importar / Reportes
  - ❌ Rendimiento / Comisiones / Agente IA
  - ❌ Settings

---

## FASE 5 — Tenant B / Plan STARTER (`admin@demob.com`)

#### Paso 45: Login
- Email: `admin@demob.com` / Password: `password123`

#### Paso 46: Dashboard
- Métricas del Tenant B (solo 5 leads)
- Comparar con Tenant A (mucho menos datos)

#### Paso 47: Verificar Restricciones STARTER
- **Máximo 3 usuarios** (ya tiene 2)
- **Máximo 5 reglas** de automatización
- **Agente IA** → No visible o bloqueado (requiere PROFESSIONAL)

#### Paso 48: Testear Límites de Plan
- Intentar agregar un 4to usuario → debería mostrar **error de límite de plan**
- Intentar crear más de 5 reglas → debería bloquear
- Verificar que NO aparece "Agente IA" en el sidebar

---

## FASE 6 — Flujo Completo de Negocio (`admin@demoa.com`)

> Simular una **venta completa** de inicio a fin.

#### Paso 49: Ciclo Completo

1. **Login** como `admin@demoa.com`
2. **Crear lead**: "Cliente Cierre Demo", +598990001122, cierre@test.com
3. **Asignar agente**: Lucía Torres
4. **Mover a Contactado** en el Embudo (drag & drop)
5. **Enviar mensaje** de bienvenida por WhatsApp desde la conversación
6. **Agregar tags**: "VIP", "Inversor"
7. **Completar campos custom**: Presupuesto 200.000, Zona: Pocitos
8. **Mover a Calificado** en el Embudo
9. **Crear visita**: propiedad "Apartamento Pocitos", mañana 10:00
10. **Mover a Visita** en el Embudo
11. **Completar visita** (cambiar estado a COMPLETED)
12. **Agregar nota**: "Muy interesado, quiere negociar precio"
13. **Mover a Negociación** en el Embudo
14. **Mover a Ganado** 🎉
15. **Crear comisión**: Venta, USD 185.000, agente Lucía
16. **Aprobar comisión** → **Pagar comisión**
17. **Verificar en Reportes**: el nuevo lead aparece como WON
18. **Verificar en Rendimiento**: métricas de Lucía actualizadas
19. **Verificar en Comisiones → Resumen**: totales actualizados

---

## Checklist Rápido

| # | Paso | Estado |
|---|------|--------|
| 1 | Login Super Admin | ⬜ |
| 2 | Dashboard global | ⬜ |
| 3 | Gestión de tenants/usuarios (Settings) | ⬜ |
| 4 | Actividad global | ⬜ |
| 5 | Perfil Super Admin | ⬜ |
| 6 | Logout | ⬜ |
| 7 | Login Business Admin (Tenant A) | ⬜ |
| 8 | Etapas del embudo | ⬜ |
| 9 | Tags | ⬜ |
| 10 | Campos custom | ⬜ |
| 11 | Fuentes de leads | ⬜ |
| 12 | Plantillas de mensajes | ⬜ |
| 13 | Automatizaciones | ⬜ |
| 14 | Canales (WhatsApp/Telegram) | ⬜ |
| 15 | Propiedades (crear 3) | ⬜ |
| 16 | Página pública de propiedad | ⬜ |
| 17 | Leads (explorar + crear) | ⬜ |
| 18 | Detalle de lead | ⬜ |
| 19 | Conversación con lead | ⬜ |
| 20 | Pipeline Kanban (drag & drop) | ⬜ |
| 21 | Visitas (calendario) | ⬜ |
| 22 | Seguimientos automáticos | ⬜ |
| 23 | Importar CSV | ⬜ |
| 24 | Reportes + exportar | ⬜ |
| 25 | Rendimiento de agentes | ⬜ |
| 26 | Comisiones → Reglas | ⬜ |
| 27 | Comisiones → Crear/Aprobar/Pagar | ⬜ |
| 28 | Comisiones → Resumen | ⬜ |
| 29 | Agente IA | ⬜ |
| 30 | Gestión de equipo | ⬜ |
| 31 | Mi Perfil | ⬜ |
| 32-39 | Prueba como Agente | ⬜ |
| 40-44 | Prueba como Viewer | ⬜ |
| 45-48 | Prueba Tenant B (STARTER) | ⬜ |
| 49 | Flujo completo de venta | ⬜ |
