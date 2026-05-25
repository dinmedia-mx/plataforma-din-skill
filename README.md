# Plataforma DIN — Claude Skill

Skill para conectar Claude a tu Plataforma DIN de CRM, ventas y automatización. Funciona con cualquier subcuenta, para un usuario o para múltiples agentes conectados al mismo tiempo.

## Qué puede hacer

- Buscar y gestionar contactos y leads
- Revisar y mover oportunidades en el pipeline
- Leer conversaciones de WhatsApp, SMS y email
- Enviar mensajes (con confirmación)
- Ver y consultar automatizaciones y workflows
- Gestionar citas y calendarios
- Explorar formularios, funnels y configuración de la cuenta
- Facturación, órdenes, productos y pagos
- Redes sociales, blog, encuestas y campañas de email

## Instalación

### Claude Code (CLI)
```bash
# Copia este directorio a tu carpeta de skills
cp -r plataforma-din-skill ~/.claude/skills/plataforma-din
```

### Claude.ai (Chat / Cowork)
Descarga el archivo `plataforma-din.skill` de la sección Releases e instálalo desde Settings → Skills en claude.ai.

## Conexión a tu cuenta

Instala el servidor MCP incluido en `mcp-server/` para conectar Claude a tu subcuenta.

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
        "DIN_API_TOKEN": "tu-token-aqui",
        "DIN_LOCATION_ID": "tu-location-id-aqui"
      }
    }
  }
}
```

Reinicia Claude después de agregar la configuración.

### Cómo obtener el token y Location ID

Ver la Sección 2 del `SKILL.md` para instrucciones detalladas.

## Reportar bugs o descubrimientos

Si encuentras algo que no funciona como se documenta, o descubres una capacidad nueva de la plataforma, abre un issue en este repositorio con el formato de la Sección 9 del SKILL.md.

---

Hecho por [DIN Media](https://dinmedia.mx) · [@dinmedia-mx](https://github.com/dinmedia-mx)
