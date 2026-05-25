---
name: plataforma-din
description: >
  Experto en conectar Claude a la Plataforma DIN (GoHighLevel) via MCP. Activa cuando el
  usuario hable de: CRM, leads, pipeline, oportunidades, contactos, conversaciones de
  WhatsApp o email con clientes, citas, calendarios, automatizaciones, workflows,
  formularios, subcuentas, agentes, notificaciones, seguimiento de prospectos, o cuando
  quiera conectar su Claude a la plataforma. También activa con: "mi plataforma", "el CRM",
  "la herramienta", "conectar mi claude", "configurar el MCP", o cualquier referencia a
  operar, revisar o gestionar leads, ventas o comunicación con clientes desde Claude.
  Funciona para cualquier subcuenta: clientes con una sola cuenta, agencias con varias.
version: "1.0.0"
github: "https://github.com/dinmedia-mx/plataforma-din-skill"
---

# Plataforma DIN — Skill Unificado
### Experto en CRM, automatización y comunicación con clientes desde Claude

---

## 0. Lo primero: verificar estado actual

Antes de cualquier cosa, revisa estas tres condiciones:

**A — ¿Hay conexión activa?**
Verifica si existen tools con prefijo `ghl_`, `din_` o similar (del MCP de la plataforma).
- Si hay tools → conexión activa, continúa al punto B.
- Si no hay tools → guía al usuario por el **Setup** (Sección 2).

**B — ¿Hay datos de cuenta en memoria?**
Busca en la memoria del usuario si hay una entrada con Location ID, nombre de subcuenta, pipelines o agentes guardados.
- Si hay datos → úsalos como contexto, no los pidas de nuevo.
- Si no hay datos → explora la cuenta activa con las tools y guarda lo relevante (Sección 3).

**C — ¿Hay varias subcuentas?**
Pregunta si el usuario trabaja con una o varias subcuentas.
- Una subcuenta → modo simple: trabaja directo.
- Varias subcuentas → modo multi-cuenta: confirma cuál usar antes de cada acción (Sección 4).

---

## 1. Auto-actualización

Este skill se actualiza desde GitHub. Para verificar si tienes la versión más reciente:

```
Consulta: https://raw.githubusercontent.com/dinmedia-mx/plataforma-din-skill/main/SKILL.md
Compara el campo `version:` del encabezado con el de tu copia local.
Si es diferente, avísale al usuario que hay una versión más nueva disponible.
```

**Cuándo verificar:** Cuando el usuario lo pida explícitamente, o cuando encuentres un comportamiento de la API que no esté documentado en este skill.

**Cómo actualizar:** El usuario instala la nueva versión del skill desde GitHub manualmente, o si tiene acceso de escritura, puede usar `curl` para descargar la versión más reciente.

---

## 2. Setup — Conectar Claude a la plataforma

Hay tres formas de conectar. Recomienda según el nivel de acceso que necesita el usuario.

### Opción A — MCP oficial de GHL *(más simple, menos tools)*
Disponible en `https://services.leadconnectorhq.com/mcp/`
- ~36 tools: contactos, conversaciones, calendario, oportunidades, tags, campos personalizados
- No requiere servidor local — solo configurar como HTTP MCP en Claude
- Ideal para usuarios que solo necesitan leer y actualizar datos básicos

```json
{
  "mcpServers": {
    "plataforma-din": {
      "type": "http",
      "url": "https://services.leadconnectorhq.com/mcp/",
      "headers": {
        "Authorization": "Bearer {TOKEN_DEL_USUARIO}",
        "Version": "2021-07-28"
      }
    }
  }
}
```

### Opción B — Servidor DIN Media *(balanceado, recomendado)*
Servidor Node.js local con ~30 tools cuidadosamente testeadas y con bugs corregidos.
- Contactos, conversaciones, oportunidades, pipelines, workflows, formularios, calendarios, usuarios, facturas, templates de email, funnels, negocios
- Requiere Node.js instalado

**Instalación:**
```bash
# 1. Clonar/descargar el servidor
git clone https://github.com/dinmedia/plataforma-din-skill
cd plataforma-din-skill/mcp-server

# 2. Instalar dependencias
npm install && npm run build

# 3. Agregar a ~/.claude/settings.json:
```
```json
{
  "mcpServers": {
    "plataforma-din": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/ruta/al/mcp-server/dist/index.js"],
      "env": {
        "GHL_PRIVATE_TOKEN": "{TOKEN_DEL_USUARIO}",
        "GHL_LOCATION_ID": "{LOCATION_ID_DEL_USUARIO}"
      }
    }
  }
}
```

### Opción C — mastanley13/GoHighLevel-MCP *(máxima cobertura)*
269+ tools en 19 categorías — incluyendo facturación avanzada, objetos personalizados, verificación de email, medios sociales.
- Repositorio: `https://github.com/mastanley13/GoHighLevel-MCP`
- Mayor complejidad de setup (requiere Vercel/Railway/Docker o ejecución local)
- Recomendado si necesitas facturación avanzada, objetos personalizados o integraciones complejas

### Cómo obtener el token y Location ID

**Token (Private Integration):**
1. Entra a la plataforma
2. Menú lateral → **Settings** → **Private Integrations**
3. Clic en **Create New Integration**
4. Nombre: `Claude AI` (o el que prefieras)
5. **Select all** en los Scopes
6. Clic en **Create** → copia el token (empieza con `pit-`)

**Location ID:**
Está en la URL cuando estás dentro de la subcuenta:
`.../location/XXXXXXXXXXXXXXXX/...`
Los caracteres entre `/location/` y el siguiente `/` son tu Location ID.

**Reinicia Claude** después de configurar el MCP para que la conexión quede activa.

---

## 3. Memoria de cuenta — Cómo y dónde guardar

Cuando explores una cuenta nueva, guarda su información para no tener que redescubrirla. El usuario elige dónde guardar:

### Opción 1 — Memoria automática de Claude *(default recomendado)*
Claude guarda automáticamente en su sistema de memoria persistente. Usa este esquema:

```
Tipo: project
Nombre: subcuenta-[nombre]
Contenido:
  - Nombre de la subcuenta
  - Location ID
  - Opción de conexión usada (A/B/C)
  - Pipelines: nombre → etapas en orden
  - Custom fields: nombre → ID
  - Agentes/usuarios: nombre → ID
  - Tags disponibles
  - Workflows activos (nombre y propósito)
  - Notas sobre comportamientos específicos de esta cuenta
```

### Opción 2 — Carpeta de archivos .md
Crea un archivo por subcuenta en una carpeta dedicada:
```
~/Documents/CRM/subcuentas/[nombre-cuenta].md
```
Con el mismo esquema de arriba en formato Markdown.

### Opción 3 — Notion u otro segundo cerebro
Si el usuario tiene Notion MCP u otra herramienta conectada, crea una página/entrada por subcuenta con el esquema de arriba.

### Cuándo guardar
- Primera vez que explores una cuenta: guarda todo lo que descubras
- Cuando encuentres un campo, pipeline o agente nuevo: actualiza la entrada existente
- **Nunca guardes** datos de contactos específicos, conversaciones privadas o información personal de prospectos — solo la estructura de la cuenta

---

## 4. Multi-cuenta — Trabajar con varias subcuentas

Para usuarios con varias subcuentas (agencias, operadores):

**Al iniciar sesión:**
Si hay datos de varias cuentas en memoria, pregunta:
> "¿Con cuál subcuenta trabajamos hoy? Tengo guardadas: [lista las disponibles]"

**Para cambiar de cuenta mid-sesión:**
Si el MCP usa variables de entorno, el usuario necesita reiniciar Claude con las credenciales de la otra cuenta. Si usa el MCP oficial (Opción A), el token puede cambiarse sin reiniciar.

**Patrón recomendado para agencias:**
Tener una instancia de MCP configurada por subcuenta con nombres distintos:
```json
{
  "mcpServers": {
    "din-cuenta-ikalmex": { ... },
    "din-cuenta-cliente2": { ... }
  }
}
```

---

## 5. Capacidades por categoría

Lo que puedes hacer con el MCP activo (varía según la Opción elegida):

### Contactos
- Buscar por nombre, email, teléfono
- Ver perfil completo, notas, tareas, historial
- Crear y actualizar contactos
- Agregar/quitar tags
- Ver campos personalizados

### Oportunidades y Pipeline
- Ver oportunidades por etapa
- Crear y mover oportunidades entre etapas
- Identificar leads estancados
- ⚠️ Mover una etapa puede disparar workflows — verificar antes

### Conversaciones y Mensajería
- Buscar conversaciones (WhatsApp, SMS, Email, Instagram)
- Ver historial completo de mensajes
- Enviar mensajes (WhatsApp, SMS, Email)
- ⚠️ Después de 24h sin respuesta del lead, GHL solo permite enviar **plantillas aprobadas por Meta** — no mensajes libres

### Calendarios y Citas
- Ver calendarios disponibles
- Consultar eventos y citas
- Ver disponibilidad de agentes
- Consultar historial de citas de un contacto

### Automatizaciones
- Ver workflows (activos y borradores)
- Consultar qué hace cada workflow
- ⚠️ No se puede crear ni modificar workflows via API — solo se pueden leer

### Configuración de cuenta
- Ver campos personalizados de contacto
- Ver tags disponibles
- Ver usuarios y agentes
- Ver formularios y sus campos
- Ver funnels

### Facturación (solo Opción C o API directa)
- Facturas, órdenes de pago, productos
- 39 tools especializadas en billing (mastanley13)

---

## 6. Comportamientos conocidos de la API

Documentación de lo que funciona, lo que no, y cómo manejarlo.

### Bugs documentados

```
❌ GET /contacts/search → 400 "Contact with id search not found"
✅ Correcto: GET /contacts/?locationId=LOC&query=X

❌ GET /opportunities/search?locationId=LOC → falla
✅ Correcto: usar location_id con guión bajo (no camelCase)

❌ GET /opportunities/search?contactId=X → 422
✅ No soportado: filtrar por query o nombre del contacto en su lugar

❌ GET /locations/customFields?locationId=LOC → 403
✅ Correcto: GET /locations/{locationId}/customFields (path param, no query param)

❌ GET /conversations/templates → 400
✅ Correcto: GET /locations/{locationId}/templates (y especificar type=whatsapp)
```

### Limitaciones conocidas

| Área | Limitación |
|------|-----------|
| Conversation AI | No expuesto en API — solo configurable desde UI |
| Workflows | Solo lectura — no se pueden crear/editar via API |
| WhatsApp templates | Requieren aprobación de Meta (24-72h) |
| Plantillas post-24h | Obligatorio usar templates aprobadas después de 24h sin respuesta del lead |
| Bulk operations | No hay endpoints de bulk — operaciones de lote deben hacerse una por una |
| Social media | Limitado según plan y scopes del token |

### Señales de error comunes y qué significan

| Error | Causa probable |
|-------|---------------|
| 400 "Contact with id X not found" | Endpoint incorrecto — revisar URL |
| 403 en customFields | Usar path param en vez de query param |
| 422 en opportunities | Filtro no soportado (ej. contactId) |
| 401 Unauthorized | Token expirado o sin scope suficiente |
| 404 en endpoint | Feature no disponible en API — probablemente solo UI |

---

## 7. Workflows comunes

### Buscar y perfilar un contacto
```
1. Buscar: GET /contacts/?locationId=LOC&query=nombre
2. Perfil completo: GET /contacts/{id}
3. Notas: GET /contacts/{id}/notes
4. Conversaciones: GET /conversations/search?contactId={id}
5. Oportunidades: GET /opportunities/search?query=nombre (no filtrar por contactId)
6. Presentar resumen al usuario
```

### Revisar estado del pipeline
```
1. GET /pipelines/ → anotar IDs y nombres de etapas
2. GET /opportunities/search?location_id=LOC&status=open
3. Agrupar por etapa, calcular tiempo en cada una
4. Identificar leads con más de N días sin movimiento
```

### Antes de mover un lead de etapa
```
1. GET /workflows/ → revisar cuáles están publicados
2. ¿Alguno se dispara al entrar a la etapa destino? → Avisar al usuario
3. Confirmar antes de ejecutar
```

### Preparar mensaje para lead sin actividad +24h
```
1. Verificar cuándo fue el último mensaje inbound
2. Si >24h: solo puedes usar plantillas aprobadas
3. GET /locations/{id}/templates?type=whatsapp → ver plantillas disponibles
4. Si no hay plantillas adecuadas → avisar y sugerir crearlas desde la UI
```

---

## 8. Reglas de seguridad

**Sin confirmación — ejecutar libremente:**
Cualquier lectura, agregar notas/tareas/tags.

**Avisar antes de ejecutar:**
- Enviar mensajes → mostrar texto exacto + canal + destinatario
- Mover etapa de oportunidad → indicar si hay workflow activo en esa etapa
- Crear contacto → buscar duplicados primero
- Operaciones en lote

**Nunca sin confirmación explícita:**
- Eliminar registros de cualquier tipo
- Modificar configuración de la cuenta
- Acciones masivas que afecten a 10+ registros

---

## 9. Descubrimientos — Feedback a GitHub

Cuando encuentres algo nuevo sobre el comportamiento de la plataforma (un endpoint que falla, uno que funciona diferente a lo documentado, una capacidad nueva, una limitación no documentada), ayuda a que ese conocimiento mejore este skill:

**Cómo reportar:**
1. Documenta el hallazgo con: endpoint, parámetros usados, respuesta recibida, comportamiento esperado vs real
2. Sugiere al usuario crear un issue en: `https://github.com/dinmedia-mx/plataforma-din-skill/issues`
3. Usa este formato:

```
Título: [API] [Endpoint] - Descripción breve del comportamiento
Cuerpo:
- Endpoint: GET/POST /ruta/del/endpoint
- Parámetros: los que se usaron
- Comportamiento observado: lo que pasó
- Comportamiento esperado: lo que debería pasar
- ¿Workaround disponible?: sí/no, y cuál
```

**Qué reportar:**
- ✅ Endpoints que fallan con respuesta inesperada
- ✅ Funciones que resultaron ser solo-UI (no API)
- ✅ Parámetros que no funcionan como documenta GHL
- ✅ Tools que funcionan mejor de lo esperado (documentar el patrón)
- ❌ Datos específicos de contactos o cuentas (solo comportamiento de la plataforma)

---

*Skill v1.0.0 — Plataforma DIN by DIN Media*
*GitHub: https://github.com/dinmedia-mx/plataforma-din-skill*
*Comunidad: basado en hallazgos de mastanley13/GoHighLevel-MCP, tenfoldmarc/ghl-mcp, y GHL Official MCP*
