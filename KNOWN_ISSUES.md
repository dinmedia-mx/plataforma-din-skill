# Known Issues — API Behaviors

Registro de comportamientos documentados de la API de la Plataforma DIN.
Actualizado por Claude cuando encuentra algo nuevo. Contribuye abriendo un issue.

---

## Bugs confirmados

### Contactos
| Endpoint | Error | Solución | Confirmado |
|----------|-------|----------|------------|
| `GET /contacts/search` | 400 "Contact with id search not found" | Usar `GET /contacts/?locationId=LOC&query=X` | 2025-11-xx |

### Oportunidades
| Endpoint | Error | Solución | Confirmado |
|----------|-------|----------|------------|
| `GET /opportunities/search?locationId=LOC` | Falla silenciosamente | Usar `location_id` con guión bajo | 2025-11-xx |
| `GET /opportunities/search?contactId=X` | 422 Unprocessable | No soportado — filtrar por `query` | 2025-11-xx |

### Campos personalizados
| Endpoint | Error | Solución | Confirmado |
|----------|-------|----------|------------|
| `GET /locations/customFields?locationId=LOC` | 403 Forbidden | Usar path param: `GET /locations/{id}/customFields` | 2025-11-xx |

### Templates / Plantillas
| Endpoint | Error | Solución | Confirmado |
|----------|-------|----------|------------|
| `GET /conversations/templates` | 400 "Conversation with id templates not found" | Usar `GET /locations/{id}/templates?type=whatsapp` | 2026-05-xx |

---

## Limitaciones de plataforma (no son bugs — es cómo funciona)

| Área | Limitación | Notas |
|------|-----------|-------|
| Conversation AI | No expuesto en API | Solo configurable desde UI |
| Workflows | Solo lectura | No se pueden crear/editar via API |
| WhatsApp post-24h | Solo templates aprobadas | Meta requiere aprobación previa (24-72h) |
| Bulk operations | No hay endpoints | Operaciones de lote deben hacerse una por una |
| Filtro contactId en oportunidades | No soportado | Usar búsqueda por nombre |

---

## Por investigar

- [ ] Pagination en conversaciones (comportamiento con >100 resultados)
- [ ] Rate limits exactos de la API
- [ ] Scopes mínimos necesarios por operación
- [ ] Comportamiento de webhooks vs polling

---

*Para agregar un hallazgo: abre un issue en el repositorio con el formato de la Sección 9 del SKILL.md*
