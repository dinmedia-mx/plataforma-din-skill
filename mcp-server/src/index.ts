#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios, { AxiosError } from "axios";
import { z } from "zod";

// ─── Config ───────────────────────────────────────────────────────────────────

const GHL_TOKEN = process.env.GHL_PRIVATE_TOKEN;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";
const CHARACTER_LIMIT = 25000;

if (!GHL_TOKEN) {
  console.error("ERROR: GHL_PRIVATE_TOKEN environment variable is required");
  process.exit(1);
}

// ─── HTTP Client ──────────────────────────────────────────────────────────────

const ghlClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    Authorization: `Bearer ${GHL_TOKEN}`,
    Version: API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await ghlClient.get<T>(path, { params });
  return res.data;
}
async function apiPost<T>(path: string, data: unknown): Promise<T> {
  const res = await ghlClient.post<T>(path, data);
  return res.data;
}
async function apiPut<T>(path: string, data: unknown): Promise<T> {
  const res = await ghlClient.put<T>(path, data);
  return res.data;
}
async function apiDelete<T>(path: string): Promise<T> {
  const res = await ghlClient.delete<T>(path);
  return res.data;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function handleError(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const detail = error.response?.data?.message || error.response?.data?.msg || "";
    const msg = Array.isArray(detail) ? detail.join(", ") : String(detail);
    switch (status) {
      case 400: return `Error 400 - Bad request: ${msg}`;
      case 401: return "Error 401 - Token inválido o expirado. Verifica GHL_PRIVATE_TOKEN.";
      case 403: return "Error 403 - Sin permisos para este recurso.";
      case 404: return `Error 404 - Recurso no encontrado. ${msg}`;
      case 422: return `Error 422 - Datos inválidos: ${msg}`;
      case 429: return "Error 429 - Rate limit alcanzado. Espera unos segundos.";
      default:  return `Error ${status}: ${msg || error.message}`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + "\n\n[Respuesta truncada. Usa filtros o paginación.]";
}

function loc(): string {
  if (!GHL_LOCATION_ID) throw new Error("GHL_LOCATION_ID no configurado en .env");
  return GHL_LOCATION_ID;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "ghl-mcp-server", version: "2.0.0" });

// ═══════════════════════════════════════════════════════════════════════════════
// CUENTA / LOCATION
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_location", {
  title: "Info de la subcuenta",
  description: "Información general de la subcuenta IKALMEX: nombre, email, timezone, dirección, configuración.",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_custom_fields", {
  title: "Ver campos personalizados",
  description: "Lista los custom fields de la subcuenta. Necesarios para saber los IDs antes de actualizar contactos u oportunidades con campos personalizados. IKALMEX tiene: Presupuesto, Tipo de propiedad, Zona de Interés, Precio estimado, Tamaño (m2), Documentación en regla, LinkedIn, Descripción propiedad.",
  inputSchema: z.object({
    model: z.enum(["contact", "opportunity", "task"]).default("contact"),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}/customFields`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_custom_values", {
  title: "Ver variables del sistema",
  description: "Lista los custom values (variables/snippets) configurados: Promotion Name, booking URLs, etc.",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}/customValues`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_tags", {
  title: "Ver tags disponibles",
  description: "Lista los 14 tags de IKALMEX (alineados con etapas de pipeline): agendado, asignado, cerrado/vendido, contrato firmado, en proceso (ai), lead, negociación, no procede, proceso de cierre, proceso de firma, propiedad calificada, propiedad descartada, propiedad vendida/rentada, propietario.",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}/tags`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTOS (671 en IKALMEX)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_search_contacts", {
  title: "Buscar contactos",
  description: "Busca en los 671 contactos de IKALMEX por nombre, email o teléfono. Endpoint correcto: /contacts/ con param query.",
  inputSchema: z.object({
    query: z.string().optional().describe("Nombre, email o teléfono a buscar"),
    limit: z.number().int().min(1).max(100).default(20),
    startAfter: z.string().optional().describe("ID del último contacto para paginación (cursor)"),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ query, limit, startAfter }) => {
  try {
    const data = await apiGet("/contacts/", { locationId: loc(), query, limit, startAfter });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_contact", {
  title: "Obtener contacto por ID",
  description: "Detalle completo de un contacto: datos personales, tags, custom fields (Presupuesto, Tipo de propiedad, Zona, etc.), source, assignedTo.",
  inputSchema: z.object({
    contactId: z.string().describe("ID del contacto en GHL"),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ contactId }) => {
  try {
    const data = await apiGet(`/contacts/${contactId}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_contact", {
  title: "Crear contacto",
  description: "Crea un contacto nuevo. ⚠️ Buscar primero con ghl_search_contacts para evitar duplicados.",
  inputSchema: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional().describe("Formato E.164: +521234567890"),
    companyName: z.string().optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
    customFields: z.array(z.object({ id: z.string(), value: z.unknown() })).optional(),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async (params) => {
  try {
    const data = await apiPost("/contacts/", { ...params, locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_contact", {
  title: "Actualizar contacto",
  description: "Actualiza campos de un contacto. Solo modifica los campos que se incluyan.",
  inputSchema: z.object({
    contactId: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    companyName: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.array(z.object({ id: z.string(), value: z.unknown() })).optional(),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ contactId, ...fields }) => {
  try {
    const data = await apiPut(`/contacts/${contactId}`, fields);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_add_contact_tags", {
  title: "Agregar tags a contacto",
  description: "Agrega tags sin borrar los existentes. Tags disponibles en IKALMEX: lead, agendado, asignado, negociación, proceso de cierre, cerrado/vendido, no procede, propietario, etc.",
  inputSchema: z.object({
    contactId: z.string(),
    tags: z.array(z.string()).min(1),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ contactId, tags }) => {
  try {
    const data = await apiPost(`/contacts/${contactId}/tags`, { tags });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTAS Y TAREAS
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_contact_notes", {
  title: "Ver notas de un contacto",
  description: "Lista todas las notas de un contacto. Las notas pueden contener resúmenes de conversaciones con IA.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ contactId }) => {
  try {
    const data = await apiGet(`/contacts/${contactId}/notes`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_note", {
  title: "Crear nota en contacto",
  description: "Agrega una nota a un contacto para registrar información importante o resumen de interacción.",
  inputSchema: z.object({
    contactId: z.string(),
    body: z.string().min(1).describe("Contenido de la nota (acepta HTML básico)"),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ contactId, body }) => {
  try {
    const data = await apiPost(`/contacts/${contactId}/notes`, { body, userId: "" });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_contact_tasks", {
  title: "Ver tareas de un contacto",
  description: "Lista todas las tareas (pendientes y completadas) de un contacto.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ contactId }) => {
  try {
    const data = await apiGet(`/contacts/${contactId}/tasks`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_task", {
  title: "Crear tarea en contacto",
  description: "Crea una tarea asociada a un contacto. Asignar a un agente con su userId (ver ghl_get_users).",
  inputSchema: z.object({
    contactId: z.string(),
    title: z.string().min(1),
    body: z.string().optional(),
    dueDate: z.string().optional().describe("ISO 8601: 2024-12-31T10:00:00Z"),
    assignedTo: z.string().optional().describe("userId del responsable (ver ghl_get_users)"),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ contactId, ...rest }) => {
  try {
    const data = await apiPost(`/contacts/${contactId}/tasks`, { ...rest, completed: false });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE / OPORTUNIDADES (7 activas en IKALMEX)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_pipelines", {
  title: "Ver pipelines",
  description: "Lista los 2 pipelines de IKALMEX: 'Estatus de Leads' (7 etapas: En Proceso AI → Asignado → Agendado → Negociación → Proceso de Cierre → Cerrado/Vendido → NO Procede) y 'Estatus de Propietarios' (6 etapas: Nuevo Propietario → Propiedad Calificada → En proceso de Firma → Contrato Firmado → Propiedad Vendida/Rentada → Propiedad Descartada).",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet("/opportunities/pipelines", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_search_opportunities", {
  title: "Buscar oportunidades",
  description: "Busca oportunidades en los pipelines de IKALMEX. ⚠️ Usa location_id (con guión bajo). NO soporta filtro por contactId — para ver oportunidades de un contacto específico usa ghl_search_opportunities y filtra por nombre.",
  inputSchema: z.object({
    pipelineId: z.string().optional(),
    stageId: z.string().optional().describe("ID de etapa del pipeline"),
    status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
    query: z.string().optional().describe("Buscar por nombre de oportunidad o contacto"),
    limit: z.number().int().min(1).max(100).default(20),
    startAfter: z.number().optional().describe("Timestamp numérico para paginación"),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit, ...params }) => {
  try {
    // IMPORTANTE: este endpoint usa location_id (guión bajo), no locationId
    const data = await apiGet("/opportunities/search", { location_id: loc(), limit, ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_opportunity", {
  title: "Obtener oportunidad por ID",
  description: "Detalle completo de una oportunidad: nombre, etapa, valor monetario, contacto asignado, status.",
  inputSchema: z.object({ opportunityId: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ opportunityId }) => {
  try {
    const data = await apiGet(`/opportunities/${opportunityId}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_opportunity", {
  title: "Crear oportunidad",
  description: "Crea una oportunidad en el pipeline. ⚠️ Usar ghl_get_pipelines primero para obtener pipelineId y pipelineStageId válidos. Puede disparar workflows 'Crear Oportunidad y Asignar LEAD calificado' si está configurado.",
  inputSchema: z.object({
    pipelineId: z.string(),
    pipelineStageId: z.string(),
    contactId: z.string(),
    name: z.string().min(1),
    status: z.enum(["open", "won", "lost", "abandoned"]).default("open"),
    monetaryValue: z.number().optional(),
    assignedTo: z.string().optional(),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async (params) => {
  try {
    const data = await apiPost("/opportunities/", { ...params, locationId: loc() });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_opportunity", {
  title: "Actualizar oportunidad",
  description: "Mueve etapa o cambia status de una oportunidad. ⚠️ Cambiar etapa puede disparar workflows automáticos activos (ej: 'Crear Oportunidad y Asignar LEAD calificado').",
  inputSchema: z.object({
    opportunityId: z.string(),
    pipelineStageId: z.string().optional(),
    status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
    monetaryValue: z.number().optional(),
    name: z.string().optional(),
    assignedTo: z.string().optional(),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ opportunityId, ...fields }) => {
  try {
    const data = await apiPut(`/opportunities/${opportunityId}`, fields);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSACIONES (477 en IKALMEX: WhatsApp, SMS, Instagram)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_search_conversations", {
  title: "Buscar conversaciones",
  description: "Busca en las 477 conversaciones de IKALMEX. Tipos activos: WhatsApp (dominante), SMS, Instagram. Filtrar por contactId para ver historial de un lead específico.",
  inputSchema: z.object({
    contactId: z.string().optional(),
    query: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    startAfterDate: z.number().optional().describe("Timestamp en ms para paginación"),
    assignedTo: z.string().optional().describe("Filtrar por agente (userId)"),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit, ...params }) => {
  try {
    const data = await apiGet("/conversations/search", { locationId: loc(), limit, ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_conversation", {
  title: "Obtener conversación por ID",
  description: "Detalle de una conversación: canal, último mensaje, contacto, agente asignado, fecha.",
  inputSchema: z.object({ conversationId: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ conversationId }) => {
  try {
    const data = await apiGet(`/conversations/${conversationId}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_messages", {
  title: "Ver mensajes de una conversación",
  description: "Lista los mensajes de una conversación. Los mensajes de IKALMEX incluyen respuestas de IA (WhatsApp). Soporta paginación con nextPage.",
  inputSchema: z.object({
    conversationId: z.string(),
    limit: z.number().int().min(1).max(100).default(20),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ conversationId, limit }) => {
  try {
    const data = await apiGet(`/conversations/${conversationId}/messages`, { limit });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_send_message", {
  title: "Enviar mensaje",
  description: "⚠️ ACCIÓN REAL — mensaje llega al cliente. Confirmar contenido, canal y destinatario antes de enviar. Canales disponibles en IKALMEX: WhatsApp (principal), SMS, Email, Instagram.",
  inputSchema: z.object({
    conversationId: z.string(),
    type: z.enum(["SMS", "Email", "WhatsApp", "IG", "FB", "GMB", "Custom"]).describe("Canal: WhatsApp es el principal en IKALMEX"),
    message: z.string().min(1),
    subject: z.string().optional().describe("Asunto (solo Email)"),
    html: z.string().optional().describe("HTML del cuerpo (solo Email)"),
  }).strict(),
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
}, async ({ conversationId, ...rest }) => {
  try {
    const data = await apiPost("/conversations/messages", { conversationId, ...rest });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDARIOS Y CITAS (12 calendarios en IKALMEX)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_calendars", {
  title: "Ver calendarios",
  description: "Lista los 12 calendarios de IKALMEX: personales (Ivonne, Paloma, Emilio, Dino, Jose Ruben, Sara, Rep Prueba) + service booking (Investor Networking, Property Analysis, Assignment of Contracts, Property Sourcing) + event (Schedule an Appointment).",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet("/calendars/", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_calendar_events", {
  title: "Ver citas por rango de fechas",
  description: "Lista citas en un rango de fechas. Usar timestamps Unix en milisegundos.",
  inputSchema: z.object({
    startTime: z.number().describe("Timestamp Unix ms inicio"),
    endTime: z.number().describe("Timestamp Unix ms fin"),
    calendarId: z.string().optional(),
    userId: z.string().optional().describe("Filtrar por agente"),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async (params) => {
  try {
    const data = await apiGet("/calendars/events", { locationId: loc(), ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_appointments", {
  title: "Ver citas de un contacto",
  description: "Lista las citas asociadas a un contacto específico.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ contactId }) => {
  try {
    const data = await apiGet(`/contacts/${contactId}/appointments`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USUARIOS (10 agentes en IKALMEX)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_users", {
  title: "Ver usuarios / agentes",
  description: "Lista los 10 agentes de IKALMEX: Andrea Mata, David Tenorio, Diego Velazquez, Dino Valezzi, Emilio Centeno, Gabriela Solís, Jose Lima Echegaray, Jose Ruben Lima, Maximiliano Montañez, Melissa Hernandez. Útil para asignar leads y tareas.",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet("/users/", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKFLOWS (9 publicados en IKALMEX)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_workflows", {
  title: "Ver workflows / automatizaciones",
  description: "Lista los 12 workflows (9 publicados) de IKALMEX: 'Crear Oportunidad y Asignar LEAD calificado', 'Crear Oportunidad y Evaluar (No ventas)', 'Lausana (Whatsapp)', 'Notificación por correo al seguidor', 'Plaza.del.Angel', 'Ummbal', 'WOHA 2', 'Zienna', 'Zienna_3'. Los 3 en draft son: Amares, Lotes.Tulum, PRUEBA.",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet("/workflows/", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FORMULARIOS, FUNNELS, EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_forms", {
  title: "Ver formularios",
  description: "Lista los formularios de IKALMEX. Actualmente tiene 1: 'Marketing Form - Claim Offer'.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit }) => {
  try {
    const data = await apiGet("/forms/", { locationId: loc(), limit, skip: 0 });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_form_submissions", {
  title: "Ver respuestas de formulario",
  description: "Lista las respuestas enviadas al formulario 'Marketing Form - Claim Offer' u otro por ID.",
  inputSchema: z.object({
    formId: z.string().describe("ID del formulario (ver ghl_get_forms)"),
    limit: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ formId, limit, page }) => {
  try {
    const data = await apiGet("/forms/submissions", { locationId: loc(), formId, limit, page });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_funnels", {
  title: "Ver funnels",
  description: "Lista los 3 funnels de IKALMEX: 'Real Estate Wholesaling', 'Real Estate Services', 'Real Estate Offer'.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit }) => {
  try {
    const data = await apiGet("/funnels/funnel/list", { locationId: loc(), limit });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_email_templates", {
  title: "Ver plantillas de email",
  description: "Lista los 4 templates de email de IKALMEX: 'Investor Networking', 'Property Analysis', 'Assignment of Contracts', 'Property Sourcing'.",
  inputSchema: z.object({}).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async () => {
  try {
    const data = await apiGet("/emails/builder", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESSES (3 en IKALMEX)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_businesses", {
  title: "Ver empresas/negocios",
  description: "Lista las 3 empresas/negocios registrados en la subcuenta IKALMEX.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit }) => {
  try {
    const data = await apiGet("/businesses/", { locationId: loc(), limit });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGOS E INVOICES
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_invoices", {
  title: "Ver facturas / invoices",
  description: "Lista las facturas de la subcuenta. IKALMEX actualmente tiene 0 facturas activas.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.string().default("0").describe("Cursor string para paginación"),
  }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit, offset }) => {
  try {
    const data = await apiGet("/invoices/", { altId: loc(), altType: "location", limit, offset });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_payment_orders", {
  title: "Ver órdenes de pago",
  description: "Lista las órdenes de pago de la subcuenta.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
}, async ({ limit }) => {
  try {
    const data = await apiGet("/payments/orders", { altId: loc(), altType: "location", limit });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INICIO
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GHL MCP Server v2 (IKALMEX - Plataforma DIN) activo via stdio");
}

main().catch(err => { console.error("Error fatal:", err); process.exit(1); });
