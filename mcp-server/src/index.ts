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
async function apiDelete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await ghlClient.delete<T>(path, { params });
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
      case 403: return "Error 403 - Sin permisos para este recurso. Revisa los scopes del token.";
      case 404: return `Error 404 - Recurso no encontrado. ${msg}`;
      case 422: return `Error 422 - Datos inválidos: ${msg}`;
      case 429: return "Error 429 - Rate limit alcanzado. Espera unos segundos antes de reintentar.";
      default:  return `Error ${status}: ${msg || error.message}`;
    }
  }
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + "\n\n[Respuesta truncada. Usa filtros o paginación para obtener más datos.]";
}

function loc(): string {
  if (!GHL_LOCATION_ID) throw new Error("GHL_LOCATION_ID no configurado. Agrega GHL_LOCATION_ID al archivo .env");
  return GHL_LOCATION_ID;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE_SAFE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const WRITE_IDEMPOTENT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "plataforma-din-mcp", version: "1.0.0" });

// ═══════════════════════════════════════════════════════════════════════════════
// SUBCUENTA / LOCATION
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_location", {
  title: "Info de la subcuenta",
  description: "Información general de la subcuenta activa: nombre, email, timezone, dirección, configuración.",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_custom_fields", {
  title: "Ver campos personalizados de contacto",
  description: "Lista los custom fields de la subcuenta para contactos, oportunidades o tareas. Necesarios para saber los IDs antes de actualizar registros con valores personalizados.",
  inputSchema: z.object({
    model: z.enum(["contact", "opportunity", "task"]).default("contact").describe("Tipo de objeto cuyos campos se quieren listar"),
  }).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}/customFields`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_custom_field", {
  title: "Crear campo personalizado",
  description: "Crea un nuevo campo personalizado para contactos, oportunidades o tareas.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Nombre del campo"),
    dataType: z.enum(["TEXT", "LARGE_TEXT", "NUMERICAL", "PHONE", "MONETARY", "CHECKBOX", "SINGLE_OPTIONS", "MULTIPLE_OPTIONS", "FLOAT", "TIME", "DATE", "FILE_UPLOAD", "SIGNATURE"]),
    model: z.enum(["contact", "opportunity", "task"]).default("contact"),
    placeholder: z.string().optional(),
    position: z.number().int().optional().describe("Posición/orden del campo"),
    options: z.array(z.string()).optional().describe("Opciones para campos SINGLE_OPTIONS o MULTIPLE_OPTIONS"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ name, dataType, model, placeholder, position, options }) => {
  try {
    const data = await apiPost(`/locations/${loc()}/customFields`, { name, dataType, model, placeholder, position, options });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_custom_field", {
  title: "Actualizar campo personalizado",
  description: "Actualiza el nombre, placeholder u opciones de un campo personalizado existente.",
  inputSchema: z.object({
    customFieldId: z.string().describe("ID del campo personalizado"),
    name: z.string().optional(),
    placeholder: z.string().optional(),
    position: z.number().int().optional(),
    options: z.array(z.string()).optional(),
  }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ customFieldId, ...fields }) => {
  try {
    const data = await apiPut(`/locations/${loc()}/customFields/${customFieldId}`, fields);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_delete_custom_field", {
  title: "Eliminar campo personalizado",
  description: "⚠️ DESTRUCTIVO — Elimina permanentemente un campo personalizado y todos sus valores en contactos.",
  inputSchema: z.object({
    customFieldId: z.string(),
  }).strict(),
  annotations: DESTRUCTIVE,
}, async ({ customFieldId }) => {
  try {
    const data = await apiDelete(`/locations/${loc()}/customFields/${customFieldId}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_custom_values", {
  title: "Ver variables del sistema",
  description: "Lista los custom values (variables/snippets de texto) configurados en la subcuenta: URLs de booking, nombres de promociones, etc.",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}/customValues`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_custom_value", {
  title: "Crear variable del sistema",
  description: "Crea un nuevo custom value (snippet de texto reutilizable) en la subcuenta.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Nombre de la variable"),
    value: z.string().describe("Valor/contenido de la variable"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ name, value }) => {
  try {
    const data = await apiPost(`/locations/${loc()}/customValues`, { name, value });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_custom_value", {
  title: "Actualizar variable del sistema",
  description: "Actualiza el nombre o valor de un custom value existente.",
  inputSchema: z.object({
    customValueId: z.string(),
    name: z.string().optional(),
    value: z.string().optional(),
  }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ customValueId, ...fields }) => {
  try {
    const data = await apiPut(`/locations/${loc()}/customValues/${customValueId}`, fields);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_delete_custom_value", {
  title: "Eliminar variable del sistema",
  description: "⚠️ Elimina un custom value de la subcuenta.",
  inputSchema: z.object({ customValueId: z.string() }).strict(),
  annotations: DESTRUCTIVE,
}, async ({ customValueId }) => {
  try {
    const data = await apiDelete(`/locations/${loc()}/customValues/${customValueId}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_tags", {
  title: "Ver tags disponibles",
  description: "Lista todos los tags configurados en la subcuenta (alineados con etapas del pipeline y estados de leads).",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet(`/locations/${loc()}/tags`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_tag", {
  title: "Crear tag",
  description: "Crea un nuevo tag en la subcuenta.",
  inputSchema: z.object({ name: z.string().min(1) }).strict(),
  annotations: WRITE_SAFE,
}, async ({ name }) => {
  try {
    const data = await apiPost(`/locations/${loc()}/tags`, { name });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_tag", {
  title: "Actualizar tag",
  description: "Renombra un tag existente.",
  inputSchema: z.object({ tagId: z.string(), name: z.string().min(1) }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ tagId, name }) => {
  try {
    const data = await apiPut(`/locations/${loc()}/tags/${tagId}`, { name });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_delete_tag", {
  title: "Eliminar tag",
  description: "⚠️ Elimina un tag de la subcuenta. Se borrará de todos los contactos que lo tengan.",
  inputSchema: z.object({ tagId: z.string() }).strict(),
  annotations: DESTRUCTIVE,
}, async ({ tagId }) => {
  try {
    const data = await apiDelete(`/locations/${loc()}/tags/${tagId}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_location_templates", {
  title: "Ver plantillas de mensajes",
  description: "Lista plantillas de WhatsApp, SMS u otros canales. Crítico: después de 24h sin respuesta del lead, solo se pueden enviar plantillas aprobadas por Meta — no mensajes libres.",
  inputSchema: z.object({
    type: z.enum(["whatsapp", "sms", "email"]).optional().describe("Tipo de plantilla a filtrar"),
    limit: z.number().int().default(50),
    skip: z.number().int().default(0),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ type, limit, skip }) => {
  try {
    const data = await apiGet(`/locations/${loc()}/templates`, { type, limit, skip });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTOS
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_search_contacts", {
  title: "Buscar contactos",
  description: "Busca contactos por nombre, email o teléfono. Usa paginación con startAfter (ID del último contacto).",
  inputSchema: z.object({
    query: z.string().optional().describe("Nombre, email o teléfono a buscar"),
    limit: z.number().int().min(1).max(100).default(20),
    startAfter: z.string().optional().describe("ID del último contacto (cursor de paginación)"),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ query, limit, startAfter }) => {
  try {
    const data = await apiGet("/contacts/", { locationId: loc(), query, limit, startAfter });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_contact", {
  title: "Obtener contacto por ID",
  description: "Detalle completo de un contacto: datos personales, tags, custom fields, source, agente asignado.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: READ_ONLY,
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
    assignedTo: z.string().optional().describe("userId del agente asignado"),
    customFields: z.array(z.object({ id: z.string(), value: z.unknown() })).optional(),
  }).strict(),
  annotations: WRITE_SAFE,
}, async (params) => {
  try {
    const data = await apiPost("/contacts/", { ...params, locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_contact", {
  title: "Actualizar contacto",
  description: "Actualiza campos de un contacto. Solo modifica los campos incluidos en la llamada.",
  inputSchema: z.object({
    contactId: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    companyName: z.string().optional(),
    assignedTo: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.array(z.object({ id: z.string(), value: z.unknown() })).optional(),
  }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ contactId, ...fields }) => {
  try {
    const data = await apiPut(`/contacts/${contactId}`, fields);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_delete_contact", {
  title: "Eliminar contacto",
  description: "⚠️ DESTRUCTIVO — Elimina permanentemente un contacto y todos sus datos asociados.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: DESTRUCTIVE,
}, async ({ contactId }) => {
  try {
    const data = await apiDelete(`/contacts/${contactId}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_add_contact_tags", {
  title: "Agregar tags a contacto",
  description: "Agrega uno o varios tags a un contacto sin eliminar los existentes.",
  inputSchema: z.object({
    contactId: z.string(),
    tags: z.array(z.string()).min(1).describe("Tags a agregar (ver ghl_get_tags para los disponibles)"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ contactId, tags }) => {
  try {
    const data = await apiPost(`/contacts/${contactId}/tags`, { tags });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_remove_contact_tags", {
  title: "Quitar tags de contacto",
  description: "Elimina tags específicos de un contacto (no elimina otros tags que tenga).",
  inputSchema: z.object({
    contactId: z.string(),
    tags: z.array(z.string()).min(1).describe("Tags a quitar"),
  }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ contactId, tags }) => {
  try {
    const data = await apiDelete(`/contacts/${contactId}/tags`, { tags });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTAS Y TAREAS
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_contact_notes", {
  title: "Ver notas de un contacto",
  description: "Lista todas las notas de un contacto. Pueden incluir resúmenes de conversaciones generados por IA.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: READ_ONLY,
}, async ({ contactId }) => {
  try {
    const data = await apiGet(`/contacts/${contactId}/notes`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_note", {
  title: "Crear nota en contacto",
  description: "Agrega una nota a un contacto para registrar información importante o un resumen de interacción.",
  inputSchema: z.object({
    contactId: z.string(),
    body: z.string().min(1).describe("Contenido de la nota (acepta HTML básico)"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ contactId, body }) => {
  try {
    const data = await apiPost(`/contacts/${contactId}/notes`, { body, userId: "" });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_contact_tasks", {
  title: "Ver tareas de un contacto",
  description: "Lista todas las tareas (pendientes y completadas) asociadas a un contacto.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: READ_ONLY,
}, async ({ contactId }) => {
  try {
    const data = await apiGet(`/contacts/${contactId}/tasks`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_task", {
  title: "Crear tarea en contacto",
  description: "Crea una tarea asociada a un contacto. Usar ghl_get_users para obtener el userId del agente responsable.",
  inputSchema: z.object({
    contactId: z.string(),
    title: z.string().min(1),
    body: z.string().optional().describe("Descripción o notas de la tarea"),
    dueDate: z.string().optional().describe("Fecha límite en ISO 8601: 2024-12-31T10:00:00Z"),
    assignedTo: z.string().optional().describe("userId del agente responsable"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ contactId, ...rest }) => {
  try {
    const data = await apiPost(`/contacts/${contactId}/tasks`, { ...rest, completed: false });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE / OPORTUNIDADES
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_pipelines", {
  title: "Ver pipelines",
  description: "Lista los pipelines y sus etapas. Incluye IDs necesarios para crear/mover oportunidades.",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet("/opportunities/pipelines", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_search_opportunities", {
  title: "Buscar oportunidades",
  description: "Busca oportunidades en el pipeline. ⚠️ Usa location_id (guión bajo, no camelCase). Filtro por contactId no soportado — usar query con nombre del contacto.",
  inputSchema: z.object({
    pipelineId: z.string().optional().describe("Filtrar por pipeline específico"),
    stageId: z.string().optional().describe("Filtrar por etapa del pipeline"),
    status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
    query: z.string().optional().describe("Buscar por nombre de oportunidad o contacto"),
    assignedTo: z.string().optional().describe("Filtrar por agente asignado (userId)"),
    limit: z.number().int().min(1).max(100).default(20),
    startAfter: z.number().optional().describe("Timestamp numérico para paginación"),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ limit, ...params }) => {
  try {
    const data = await apiGet("/opportunities/search", { location_id: loc(), limit, ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_opportunity", {
  title: "Obtener oportunidad por ID",
  description: "Detalle completo de una oportunidad: nombre, etapa, valor monetario, contacto, agente, status.",
  inputSchema: z.object({ opportunityId: z.string() }).strict(),
  annotations: READ_ONLY,
}, async ({ opportunityId }) => {
  try {
    const data = await apiGet(`/opportunities/${opportunityId}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_opportunity", {
  title: "Crear oportunidad",
  description: "Crea una oportunidad en el pipeline. ⚠️ Usar ghl_get_pipelines primero para IDs válidos. Puede disparar workflows automáticos si están configurados.",
  inputSchema: z.object({
    pipelineId: z.string(),
    pipelineStageId: z.string(),
    contactId: z.string(),
    name: z.string().min(1),
    status: z.enum(["open", "won", "lost", "abandoned"]).default("open"),
    monetaryValue: z.number().optional(),
    assignedTo: z.string().optional().describe("userId del agente responsable"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async (params) => {
  try {
    const data = await apiPost("/opportunities/", { ...params, locationId: loc() });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_opportunity", {
  title: "Actualizar oportunidad",
  description: "Mueve etapa o actualiza status de una oportunidad. ⚠️ Cambiar etapa puede disparar workflows automáticos activos — verificar con ghl_get_workflows antes.",
  inputSchema: z.object({
    opportunityId: z.string(),
    pipelineStageId: z.string().optional().describe("Nueva etapa del pipeline"),
    status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
    monetaryValue: z.number().optional(),
    name: z.string().optional(),
    assignedTo: z.string().optional(),
  }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ opportunityId, ...fields }) => {
  try {
    const data = await apiPut(`/opportunities/${opportunityId}`, fields);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_delete_opportunity", {
  title: "Eliminar oportunidad",
  description: "⚠️ DESTRUCTIVO — Elimina permanentemente una oportunidad del pipeline.",
  inputSchema: z.object({ opportunityId: z.string() }).strict(),
  annotations: DESTRUCTIVE,
}, async ({ opportunityId }) => {
  try {
    const data = await apiDelete(`/opportunities/${opportunityId}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSACIONES Y MENSAJES
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_search_conversations", {
  title: "Buscar conversaciones",
  description: "Busca conversaciones por contacto, canal o consulta. Canales posibles: WhatsApp, SMS, Email, Instagram.",
  inputSchema: z.object({
    contactId: z.string().optional().describe("Filtrar conversaciones de un contacto específico"),
    query: z.string().optional().describe("Buscar por texto o nombre"),
    limit: z.number().int().min(1).max(100).default(20),
    startAfterDate: z.number().optional().describe("Timestamp en ms para paginación"),
    assignedTo: z.string().optional().describe("Filtrar por agente asignado (userId)"),
  }).strict(),
  annotations: READ_ONLY,
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
  annotations: READ_ONLY,
}, async ({ conversationId }) => {
  try {
    const data = await apiGet(`/conversations/${conversationId}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_messages", {
  title: "Ver mensajes de una conversación",
  description: "Lista los mensajes de una conversación con paginación. Incluye mensajes de IA si el bot está activo.",
  inputSchema: z.object({
    conversationId: z.string(),
    limit: z.number().int().min(1).max(100).default(20),
    lastMessageId: z.string().optional().describe("ID del último mensaje para paginación"),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ conversationId, limit, lastMessageId }) => {
  try {
    const data = await apiGet(`/conversations/${conversationId}/messages`, { limit, lastMessageId });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_send_message", {
  title: "Enviar mensaje",
  description: "⚠️ ACCIÓN REAL — el mensaje llega al contacto. Confirmar contenido y canal antes de enviar. IMPORTANTE: si el contacto lleva más de 24h sin responder, usar ghl_send_template_message en su lugar.",
  inputSchema: z.object({
    conversationId: z.string(),
    type: z.enum(["SMS", "Email", "WhatsApp", "IG", "FB", "GMB", "Custom"]),
    message: z.string().min(1).describe("Cuerpo del mensaje"),
    subject: z.string().optional().describe("Asunto (solo para Email)"),
    html: z.string().optional().describe("HTML del cuerpo (solo para Email)"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ conversationId, ...rest }) => {
  try {
    const data = await apiPost("/conversations/messages", { conversationId, ...rest });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_send_template_message", {
  title: "Enviar mensaje de plantilla (post-24h)",
  description: "⚠️ ACCIÓN REAL — Envía una plantilla aprobada por Meta. Obligatorio cuando el lead lleva más de 24h sin responder por WhatsApp. Usar ghl_get_location_templates para ver las plantillas disponibles.",
  inputSchema: z.object({
    conversationId: z.string(),
    contactId: z.string(),
    templateId: z.string().describe("ID de la plantilla aprobada (ver ghl_get_location_templates)"),
    name: z.string().describe("Nombre de la plantilla"),
    variables: z.array(z.string()).optional().describe("Valores para los {{1}}, {{2}}... de la plantilla"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ conversationId, contactId, templateId, name, variables }) => {
  try {
    const data = await apiPost("/conversations/messages", {
      conversationId,
      contactId,
      type: "WhatsApp",
      templateId,
      name,
      variables: variables?.map((v, i) => ({ key: `${i + 1}`, value: v })),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDARIOS Y CITAS
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_calendars", {
  title: "Ver calendarios",
  description: "Lista todos los calendarios de la subcuenta: personales, de servicio y de eventos.",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet("/calendars/", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_calendar_events", {
  title: "Ver citas por rango de fechas",
  description: "Lista citas en un rango de fechas. Timestamps en milisegundos Unix.",
  inputSchema: z.object({
    startTime: z.number().describe("Timestamp Unix ms de inicio del rango"),
    endTime: z.number().describe("Timestamp Unix ms de fin del rango"),
    calendarId: z.string().optional().describe("Filtrar por calendario específico"),
    userId: z.string().optional().describe("Filtrar por agente"),
  }).strict(),
  annotations: READ_ONLY,
}, async (params) => {
  try {
    const data = await apiGet("/calendars/events", { locationId: loc(), ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_appointments", {
  title: "Ver citas de un contacto",
  description: "Lista el historial de citas de un contacto específico.",
  inputSchema: z.object({ contactId: z.string() }).strict(),
  annotations: READ_ONLY,
}, async ({ contactId }) => {
  try {
    const data = await apiGet(`/contacts/${contactId}/appointments`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_users", {
  title: "Ver usuarios / agentes",
  description: "Lista todos los agentes/usuarios de la subcuenta con sus IDs. Útil para asignar leads, tareas y filtrar conversaciones.",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet("/users/", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_workflows", {
  title: "Ver workflows / automatizaciones",
  description: "Lista todos los workflows (publicados y borradores). Revisar antes de mover etapas en el pipeline para identificar flujos que se puedan disparar.",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
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
  description: "Lista los formularios de captación de leads de la subcuenta.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
  annotations: READ_ONLY,
}, async ({ limit }) => {
  try {
    const data = await apiGet("/forms/", { locationId: loc(), limit, skip: 0 });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_form_submissions", {
  title: "Ver respuestas de formulario",
  description: "Lista las respuestas enviadas a un formulario específico.",
  inputSchema: z.object({
    formId: z.string().describe("ID del formulario (ver ghl_get_forms)"),
    limit: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ formId, limit, page }) => {
  try {
    const data = await apiGet("/forms/submissions", { locationId: loc(), formId, limit, page });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_funnels", {
  title: "Ver funnels",
  description: "Lista los funnels de la subcuenta.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
  annotations: READ_ONLY,
}, async ({ limit }) => {
  try {
    const data = await apiGet("/funnels/funnel/list", { locationId: loc(), limit });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_email_templates", {
  title: "Ver plantillas de email (builder)",
  description: "Lista las plantillas de email creadas con el email builder de la plataforma.",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet("/emails/builder", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_businesses", {
  title: "Ver empresas/negocios",
  description: "Lista las empresas/negocios registrados en la subcuenta.",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict(),
  annotations: READ_ONLY,
}, async ({ limit }) => {
  try {
    const data = await apiGet("/businesses/", { locationId: loc(), limit });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTURAS / INVOICES
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_list_invoices", {
  title: "Listar facturas",
  description: "Lista facturas de la subcuenta con filtros de estado, contacto y búsqueda.",
  inputSchema: z.object({
    status: z.enum(["draft", "sent", "payment_processing", "paid", "void", "partially_paid"]).optional(),
    contactId: z.string().optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.string().default("0"),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ limit, offset, ...params }) => {
  try {
    const data = await apiGet("/invoices/", { altId: loc(), altType: "location", limit, offset, ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_invoice", {
  title: "Obtener factura por ID",
  description: "Detalle completo de una factura.",
  inputSchema: z.object({ invoiceId: z.string() }).strict(),
  annotations: READ_ONLY,
}, async ({ invoiceId }) => {
  try {
    const data = await apiGet(`/invoices/${invoiceId}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_invoice", {
  title: "Crear factura",
  description: "Crea una nueva factura para un contacto.",
  inputSchema: z.object({
    contactId: z.string(),
    title: z.string().min(1).describe("Título/descripción de la factura"),
    currency: z.string().default("MXN").describe("Código ISO de moneda: MXN, USD, etc."),
    issueDate: z.string().optional().describe("Fecha de emisión ISO 8601"),
    dueDate: z.string().optional().describe("Fecha de vencimiento ISO 8601"),
    lineItems: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      quantity: z.number(),
      unitPrice: z.number(),
      discount: z.number().optional(),
    })).optional(),
  }).strict(),
  annotations: WRITE_SAFE,
}, async (params) => {
  try {
    const data = await apiPost("/invoices/", { ...params, altId: loc(), altType: "location" });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_invoice", {
  title: "Actualizar factura",
  description: "Actualiza campos de una factura en estado draft.",
  inputSchema: z.object({
    invoiceId: z.string(),
    title: z.string().optional(),
    dueDate: z.string().optional(),
    lineItems: z.array(z.object({
      name: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
    })).optional(),
  }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ invoiceId, ...fields }) => {
  try {
    const data = await apiPut(`/invoices/${invoiceId}`, fields);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_send_invoice", {
  title: "Enviar factura",
  description: "⚠️ ACCIÓN REAL — Envía una factura al contacto por email.",
  inputSchema: z.object({
    invoiceId: z.string(),
    subject: z.string().optional().describe("Asunto del email"),
    message: z.string().optional().describe("Mensaje adicional en el email"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ invoiceId, ...params }) => {
  try {
    const data = await apiPost(`/invoices/${invoiceId}/send`, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_void_invoice", {
  title: "Anular factura",
  description: "⚠️ Anula una factura (cambia su estado a void). No se puede deshacer.",
  inputSchema: z.object({ invoiceId: z.string() }).strict(),
  annotations: DESTRUCTIVE,
}, async ({ invoiceId }) => {
  try {
    const data = await apiPost(`/invoices/${invoiceId}/void`, {});
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_record_invoice_payment", {
  title: "Registrar pago de factura",
  description: "Registra un pago manual recibido para una factura.",
  inputSchema: z.object({
    invoiceId: z.string(),
    amount: z.number().describe("Monto del pago"),
    mode: z.enum(["cash", "card", "bank_transfer", "check", "other"]).optional(),
    notes: z.string().optional(),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ invoiceId, ...params }) => {
  try {
    const data = await apiPost(`/invoices/${invoiceId}/payment`, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ESTIMADOS / PRESUPUESTOS
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_list_estimates", {
  title: "Listar estimados/presupuestos",
  description: "Lista los estimados de la subcuenta.",
  inputSchema: z.object({
    status: z.enum(["draft", "sent", "accepted", "declined", "invoiced", "viewed"]).optional(),
    limit: z.number().int().default(20),
    offset: z.string().default("0"),
  }).strict(),
  annotations: READ_ONLY,
}, async (params) => {
  try {
    const data = await apiGet("/estimates/", { altId: loc(), altType: "location", ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_estimate", {
  title: "Crear estimado/presupuesto",
  description: "Crea un estimado o presupuesto para un contacto.",
  inputSchema: z.object({
    contactId: z.string(),
    title: z.string().min(1),
    validityDate: z.string().optional().describe("Fecha de validez ISO 8601"),
    lineItems: z.array(z.object({
      name: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
    })).optional(),
  }).strict(),
  annotations: WRITE_SAFE,
}, async (params) => {
  try {
    const data = await apiPost("/estimates/", { ...params, altId: loc(), altType: "location" });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_send_estimate", {
  title: "Enviar estimado",
  description: "⚠️ ACCIÓN REAL — Envía un estimado al contacto por email.",
  inputSchema: z.object({
    estimateId: z.string(),
    subject: z.string().optional(),
    message: z.string().optional(),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ estimateId, ...params }) => {
  try {
    const data = await apiPost(`/estimates/${estimateId}/send`, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_convert_estimate_to_invoice", {
  title: "Convertir estimado en factura",
  description: "Convierte un estimado aceptado en una factura.",
  inputSchema: z.object({ estimateId: z.string() }).strict(),
  annotations: WRITE_SAFE,
}, async ({ estimateId }) => {
  try {
    const data = await apiPost(`/estimates/${estimateId}/convert-to-invoice`, {});
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGOS — ÓRDENES, TRANSACCIONES, SUSCRIPCIONES
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_list_orders", {
  title: "Listar órdenes de pago",
  description: "Lista órdenes de pago de la subcuenta con filtros.",
  inputSchema: z.object({
    status: z.string().optional(),
    contactId: z.string().optional(),
    limit: z.number().int().default(20),
    offset: z.string().default("0"),
  }).strict(),
  annotations: READ_ONLY,
}, async (params) => {
  try {
    const data = await apiGet("/payments/orders", { altId: loc(), altType: "location", ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_order", {
  title: "Obtener orden por ID",
  description: "Detalle completo de una orden de pago.",
  inputSchema: z.object({ orderId: z.string() }).strict(),
  annotations: READ_ONLY,
}, async ({ orderId }) => {
  try {
    const data = await apiGet(`/payments/orders/${orderId}`, { altId: loc(), altType: "location" });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_list_transactions", {
  title: "Listar transacciones",
  description: "Lista el historial de transacciones de pagos de la subcuenta.",
  inputSchema: z.object({
    contactId: z.string().optional(),
    search: z.string().optional(),
    limit: z.number().int().default(20),
    offset: z.string().default("0"),
  }).strict(),
  annotations: READ_ONLY,
}, async (params) => {
  try {
    const data = await apiGet("/payments/transactions", { altId: loc(), altType: "location", ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_list_subscriptions", {
  title: "Listar suscripciones",
  description: "Lista las suscripciones activas o pasadas de la subcuenta.",
  inputSchema: z.object({
    contactId: z.string().optional(),
    search: z.string().optional(),
    limit: z.number().int().default(20),
    offset: z.string().default("0"),
  }).strict(),
  annotations: READ_ONLY,
}, async (params) => {
  try {
    const data = await apiGet("/payments/subscriptions", { altId: loc(), altType: "location", ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_list_coupons", {
  title: "Listar cupones de descuento",
  description: "Lista los cupones de descuento disponibles en la subcuenta.",
  inputSchema: z.object({
    status: z.enum(["scheduled", "active", "expired"]).optional(),
    search: z.string().optional(),
    limit: z.number().int().default(20),
    offset: z.string().default("0"),
  }).strict(),
  annotations: READ_ONLY,
}, async (params) => {
  try {
    const data = await apiGet("/payments/coupons", { altId: loc(), altType: "location", ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_coupon", {
  title: "Crear cupón de descuento",
  description: "Crea un nuevo cupón de descuento para productos o servicios.",
  inputSchema: z.object({
    name: z.string().min(1),
    code: z.string().min(1).describe("Código único del cupón (ej: PROMO20)"),
    discountType: z.enum(["percentage", "amount"]),
    discountValue: z.number().describe("Valor del descuento (% o monto fijo)"),
    startDate: z.string().describe("Fecha de inicio ISO 8601"),
    endDate: z.string().optional().describe("Fecha de fin ISO 8601"),
    usageLimit: z.number().int().optional().describe("Usos máximos del cupón"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async (params) => {
  try {
    const data = await apiPost("/payments/coupons", { ...params, altId: loc(), altType: "location" });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OBJETOS PERSONALIZADOS (Custom Objects)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_object_schemas", {
  title: "Ver esquemas de objetos personalizados",
  description: "Lista todos los tipos de objetos personalizados configurados (ej: Propiedad, Visita, Contrato).",
  inputSchema: z.object({}).strict(),
  annotations: READ_ONLY,
}, async () => {
  try {
    const data = await apiGet("/objects", { locationId: loc() });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_object_schema", {
  title: "Ver esquema de un objeto personalizado",
  description: "Detalle de un tipo de objeto: sus campos, etiquetas y configuración.",
  inputSchema: z.object({ schemaKey: z.string().describe("Clave del esquema (ej: 'propiedad', 'visita')") }).strict(),
  annotations: READ_ONLY,
}, async ({ schemaKey }) => {
  try {
    const data = await apiGet(`/objects/${schemaKey}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_object_record", {
  title: "Crear registro de objeto personalizado",
  description: "Crea un nuevo registro de un tipo de objeto (ej: una propiedad, una visita).",
  inputSchema: z.object({
    schemaKey: z.string().describe("Tipo de objeto (ver ghl_get_object_schemas)"),
    properties: z.record(z.unknown()).describe("Campos del registro como objeto clave-valor"),
    owner: z.string().optional().describe("userId del propietario del registro"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async ({ schemaKey, ...params }) => {
  try {
    const data = await apiPost(`/objects/${schemaKey}/records`, params);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_object_record", {
  title: "Obtener registro de objeto personalizado",
  description: "Detalle de un registro específico de un objeto personalizado.",
  inputSchema: z.object({
    schemaKey: z.string(),
    recordId: z.string(),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ schemaKey, recordId }) => {
  try {
    const data = await apiGet(`/objects/${schemaKey}/records/${recordId}`);
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_update_object_record", {
  title: "Actualizar registro de objeto personalizado",
  description: "Actualiza los campos de un registro existente.",
  inputSchema: z.object({
    schemaKey: z.string(),
    recordId: z.string(),
    properties: z.record(z.unknown()).describe("Campos a actualizar"),
  }).strict(),
  annotations: WRITE_IDEMPOTENT,
}, async ({ schemaKey, recordId, properties }) => {
  try {
    const data = await apiPut(`/objects/${schemaKey}/records/${recordId}`, { properties });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_search_object_records", {
  title: "Buscar registros de objeto personalizado",
  description: "Busca registros dentro de un tipo de objeto personalizado.",
  inputSchema: z.object({
    schemaKey: z.string(),
    query: z.string().optional(),
    limit: z.number().int().default(20),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ schemaKey, query, limit }) => {
  try {
    const data = await apiGet(`/objects/${schemaKey}/records/search`, { query, pageLimit: limit });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ASOCIACIONES (relaciones entre registros)
// ═══════════════════════════════════════════════════════════════════════════════

server.registerTool("ghl_get_associations", {
  title: "Ver tipos de asociaciones",
  description: "Lista los tipos de relaciones configuradas entre objetos (ej: Contacto ↔ Propiedad).",
  inputSchema: z.object({
    limit: z.number().int().default(20),
    skip: z.number().int().default(0),
  }).strict(),
  annotations: READ_ONLY,
}, async (params) => {
  try {
    const data = await apiGet("/associations", { locationId: loc(), ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_association", {
  title: "Crear tipo de asociación",
  description: "Define un nuevo tipo de relación entre dos tipos de objetos.",
  inputSchema: z.object({
    key: z.string().describe("Clave única para esta asociación (ej: 'contacto_propiedad')"),
    firstObjectLabel: z.string().describe("Etiqueta del primer objeto (ej: 'Contacto')"),
    firstObjectKey: z.string().describe("Clave del primer objeto (ej: 'contact')"),
    secondObjectLabel: z.string().describe("Etiqueta del segundo objeto (ej: 'Propiedad')"),
    secondObjectKey: z.string().describe("Clave del segundo objeto (ej: 'propiedad')"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async (params) => {
  try {
    const data = await apiPost("/associations", { locationId: loc(), ...params });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_create_relation", {
  title: "Crear relación entre registros",
  description: "Enlaza dos registros específicos usando un tipo de asociación definido (ej: ligar un contacto con una propiedad).",
  inputSchema: z.object({
    associationId: z.string().describe("ID del tipo de asociación (ver ghl_get_associations)"),
    firstRecordId: z.string().describe("ID del primer registro"),
    secondRecordId: z.string().describe("ID del segundo registro"),
  }).strict(),
  annotations: WRITE_SAFE,
}, async (params) => {
  try {
    const data = await apiPost("/relations", { locationId: loc(), ...params });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_get_relations_by_record", {
  title: "Ver relaciones de un registro",
  description: "Lista todas las relaciones de un registro específico (ej: todas las propiedades asociadas a un contacto).",
  inputSchema: z.object({
    recordId: z.string(),
    associationIds: z.array(z.string()).optional().describe("Filtrar por tipos de asociación específicos"),
    limit: z.number().int().default(20),
    skip: z.number().int().default(0),
  }).strict(),
  annotations: READ_ONLY,
}, async ({ recordId, ...params }) => {
  try {
    const data = await apiGet(`/relations/record/${recordId}`, { locationId: loc(), ...params });
    return { content: [{ type: "text", text: truncate(JSON.stringify(data, null, 2)) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

server.registerTool("ghl_delete_relation", {
  title: "Eliminar relación entre registros",
  description: "⚠️ Elimina el vínculo entre dos registros (no elimina los registros, solo la relación).",
  inputSchema: z.object({ relationId: z.string() }).strict(),
  annotations: DESTRUCTIVE,
}, async ({ relationId }) => {
  try {
    const data = await apiDelete(`/relations/${relationId}`, { locationId: loc() });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) { return { content: [{ type: "text", text: handleError(e) }] }; }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INICIO
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Plataforma DIN MCP Server v1.0.0 activo via stdio");
}

main().catch(err => { console.error("Error fatal:", err); process.exit(1); });
