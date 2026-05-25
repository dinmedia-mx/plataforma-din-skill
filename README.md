# Plataforma DIN — Claude Skill

Skill para conectar Claude a tu plataforma CRM de ventas y automatización. Funciona con cualquier subcuenta, para un usuario o para múltiples agentes conectados al mismo tiempo.

## Qué puede hacer

- Buscar y gestionar contactos y leads
- Revisar y mover oportunidades en el pipeline
- Leer conversaciones de WhatsApp, SMS y email
- Enviar mensajes (con confirmación)
- Ver y consultar automatizaciones y workflows
- Gestionar citas y calendarios
- Explorar formularios, funnels y configuración de la cuenta

## Instalación

### Claude Code (CLI)
```bash
# Copia este directorio a tu carpeta de skills
cp -r plataforma-din-skill ~/.claude/skills/plataforma-din
```

### Claude.ai (Chat / Cowork)
Descarga el archivo `plataforma-din.skill` de la sección Releases e instálalo desde Settings → Skills en claude.ai.

## Conexión a tu cuenta

El skill incluye tres opciones de conexión (ver SKILL.md → Sección 2). La más simple es el MCP oficial de GHL, la más completa es el servidor incluido en `mcp-server/`.

### Instalar el servidor MCP incluido

```bash
cd mcp-server
npm install
npm run build
```

Agrega en `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "plataforma-din": {
      "command": "node",
      "args": ["/ruta/al/mcp-server/dist/index.js"],
      "env": {
        "GHL_PRIVATE_TOKEN": "pit-tu-token-aqui",
        "GHL_LOCATION_ID": "tu-location-id-aqui"
      }
    }
  }
}
```

## Reportar bugs o descubrimientos

Si encuentras algo que no funciona como se documenta, o descubres una capacidad nueva de la plataforma, abre un issue en este repositorio con el formato de la Sección 9 del SKILL.md.

## Comunidad y referencias

Este skill se nutre de hallazgos propios y de la comunidad:
- [mastanley13/GoHighLevel-MCP](https://github.com/mastanley13/GoHighLevel-MCP) — 269 tools, la implementación más completa
- [tenfoldmarc/ghl-mcp](https://github.com/tenfoldmarc/ghl-mcp) — 70+ tools, enfoque práctico
- [GHL Official MCP](https://help.gohighlevel.com/support/solutions/articles/155000005741) — MCP oficial de GoHighLevel

---

Hecho por [DIN Media](https://dinmedia.mx)
