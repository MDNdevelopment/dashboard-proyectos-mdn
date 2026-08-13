# MDN Projects MCP

Servidor MCP que permite a Claude acceder directamente a los proyectos del dashboard de MDN Publicidad.

## Instalación

1. Asegúrate de tener Node.js 18+ instalado.
2. Abre una terminal en esta carpeta (`mcp-server/`) y ejecuta:
   ```
   npm install
   ```

## Configuración en Claude Desktop

Agrega esto a tu archivo `claude_desktop_config.json`:

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mdn-projects": {
      "command": "node",
      "args": ["/ruta/absoluta/a/mcp-server/index.js"],
      "env": {
        "MDN_API_BASE_URL": "https://mdngestion.netlify.app",
        "MDN_API_TOKEN": "el-token-que-te-dio-el-admin"
      }
    }
  }
}
```

Reemplaza `/ruta/absoluta/a/mcp-server/index.js` con la ruta real donde guardaste esta carpeta.

Reinicia Claude Desktop después de guardar el archivo.

## Herramientas disponibles

- **list_projects** — Lista todos los proyectos. Acepta filtros opcionales:
  - `status`: `"Pendiente"`, `"En proceso"`, o `"Completado"`
  - `department`: `"Redes"`, `"Diseño"`, `"Audiovisual"`, o `"Tecnología"`
- **get_project** — Obtiene el detalle completo de un proyecto por su ID (fases, tareas, equipo, etc.)

## Ejemplos de preguntas a Claude

- "¿Cuáles proyectos están en proceso?"
- "Dame el detalle del proyecto con ID abc-123"
- "¿Qué proyectos tiene asignado el departamento de Redes?"
