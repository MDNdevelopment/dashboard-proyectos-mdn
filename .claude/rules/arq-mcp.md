---
paths:
  - 'netlify/functions/mcp.js'
  - 'netlify/functions/oauth.js'
  - 'netlify/functions/_lib/mcp*'
  - 'netlify/functions/_lib/oauth*'
  - 'netlify/functions/_lib/db.js'
  - 'supabase/migrations/*mcp*'
---

Estás tocando el módulo **MCP**. Antes de cambiar código aquí, lee `docs/arquitectura/mcp.md` (estado actual del módulo: rutas, tablas, permisos, reglas de negocio y gotchas). Si el cambio toca tablas, permisos u otros módulos, consulta también `docs/arquitectura/datos.md`, `permisos.md` o `interconexiones.md`.

Si tu cambio altera rutas, tablas, columnas, permisos o relaciones de este módulo, actualiza `docs/arquitectura/mcp.md` en el mismo commit (estado actual, sin historia).
