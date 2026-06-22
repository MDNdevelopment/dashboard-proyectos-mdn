# Cómo conectar Claude con el dashboard de MDN

Esta guía te permite hacer preguntas a Claude sobre los proyectos activos sin tener que exportar nada manualmente.

---

## Lo que necesitas

- [Node.js](https://nodejs.org) instalado (descarga la versión "LTS")
- [Claude Desktop](https://claude.ai/download) instalado
- La carpeta `mcp-server` (pídesela al administrador)
- El token de acceso (pídeselo al administrador)

---

## Paso 1 — Instalar dependencias

Abre la carpeta `mcp-server`, haz clic derecho dentro de ella y abre una terminal en esa ubicación. Luego escribe:

```
npm install
```

Espera a que termine y cierra la terminal.

---

## Paso 2 — Editar la configuración de Claude Desktop

1. Abre el archivo de configuración de Claude Desktop. Está en:

   **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

   Para llegar rápido: abre Finder → menú "Ir" → "Ir a la carpeta…" → pega la ruta de arriba.

2. Abre ese archivo con cualquier editor de texto (TextEdit, VS Code, etc.).

3. Busca la línea que dice `"mcpServers": {}` y reemplázala con esto:

```json
"mcpServers": {
  "mdn-projects": {
    "command": "node",
    "args": ["/ruta/a/mcp-server/index.js"],
    "env": {
      "MDN_API_BASE_URL": "https://mdngestion.netlify.app",
      "MDN_API_TOKEN": "TOKEN_QUE_TE_DIO_EL_ADMIN"
    }
  }
},
```

4. Cambia `/ruta/a/mcp-server/index.js` por la ruta real donde guardaste la carpeta. Por ejemplo:
   `/Users/tunombre/Desktop/mcp-server/index.js`

5. Cambia `TOKEN_QUE_TE_DIO_EL_ADMIN` por el token que te pasaron.

6. Guarda el archivo.

---

## Paso 3 — Reiniciar Claude Desktop

Cierra Claude Desktop completamente y vuelve a abrirlo.

---

## Paso 4 — Verificar que funciona

En un chat nuevo, escribe por ejemplo:

> "¿Cuáles proyectos están en proceso?"

Claude debería responderte con los proyectos actuales del dashboard.

---

## Preguntas de ejemplo que puedes hacerle a Claude

- ¿Qué proyectos están pendientes?
- ¿Cuáles proyectos tiene asignados Redes?
- Dame el detalle del proyecto "Campaña Verano"
- ¿Cuántos proyectos están completados este mes?

---

## ¿Algo no funciona?

Avísale al administrador e indica qué paso falló.
