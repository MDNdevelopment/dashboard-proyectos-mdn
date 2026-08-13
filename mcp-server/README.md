# MDN Database MCP

Servidor MCP **remoto** (alojado en Netlify, `netlify/functions/mcp.js`) que permite a Claude
consultar la base de datos de MDN Publicidad en modo **solo lectura** directamente desde el chat
— cualquier tabla, no solo proyectos — para hacer análisis ad-hoc.

Al ser remoto (HTTP, no un proceso local), funciona igual en **PC, Mac e iPhone/iPad**: no hay que
instalar Node ni nada en el dispositivo, solo agregar una URL como "custom connector" en Claude.
Agregar custom connectors requiere un plan Claude de pago (Pro/Max/Team/Enterprise).

Se autentica con **OAuth 2.1 + PKCE** (`netlify/functions/oauth.js`) — el único modelo que hoy
soporta el conector remoto de Claude. Al agregar el connector, Claude te lleva a una página donde
pides la contraseña compartida (una sola vez por cuenta); no hay ningún token en la URL.

## Configuración (una vez por persona/cuenta)

1. Abre Claude → **Settings → Connectors → Add custom connector**.
2. Pega la URL del servidor (sin token, es pública):
   ```
   https://mdngestion.netlify.app/mcp
   ```
3. Claude abrirá una pantalla pidiendo una contraseña — ingresa la que te dio el administrador y
   autoriza el acceso.
4. Listo. Disponible en todos tus dispositivos con esa cuenta (Desktop, web, iPhone).

Solo permite **leer** datos (nunca escribir: el rol de base de datos que usa el servidor es de solo
lectura), pero la contraseña sigue siendo sensible — no la compartas en canales públicos.

## Herramientas disponibles

- **list_tables** — lista las tablas y columnas del schema `public`, para saber qué se puede
  consultar.
- **query_database** — ejecuta un `SELECT` (o `WITH ... SELECT`) de solo lectura y devuelve las
  filas. Máximo 1000 filas por consulta (500 por defecto).

## Ejemplos de preguntas a Claude

- "¿Cuántas tareas hay por línea de negocio?"
- "Lista las tablas disponibles"
- "¿Cuáles proyectos están en proceso y qué departamentos tienen?"
- "Dame un resumen de las evaluaciones del último mes"

## Nota sobre `index.js` (servidor local, obsoleto)

Este directorio conserva `index.js`, la versión anterior del MCP como proceso local (stdio),
limitada a proyectos y solo utilizable en PC/Mac con Claude Desktop. Ya no es necesaria — todo el
mundo debería migrar al connector remoto de arriba. Se deja el archivo por ahora sin eliminar;
puede borrarse cuando se confirme que nadie lo sigue usando.
