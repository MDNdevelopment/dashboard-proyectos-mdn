# CLAUDE.md

**MAPPI** es la suite de gestión interna de **MDN Publicidad**, una agencia de publicidad de
Maracaibo. Tiene 20 módulos: Tareas, Pautas audiovisuales, CNP, Chequeo, Métricas, Empresa,
Finanzas, Reuniones, Ads, Leads, Evaluaciones, Tickets, Asistente IA, MCP y otros.

- **Stack:** React 18 + Vite, React Router, Tailwind 3 y Supabase (Postgres, Auth, Realtime, Edge
  Functions). Las funciones de Netlify viven en `netlify/functions/` y el deploy es en Netlify.
- **Idioma:** toda la UI está en español. Los commits siguen Conventional Commits en español.

## Arquitectura: lee solo lo que vas a tocar

- `ARQUITECTURA.md` es un índice corto: stack, routing y mapa de módulos. Cada fila del mapa
  apunta a `docs/arquitectura/<modulo>.md`.
- Antes de cambiar un módulo, lee **su** doc. Si cruzas módulos o tocas tablas o permisos, lee
  además `datos.md`, `permisos.md` o `interconexiones.md`.
- Las reglas `.claude/rules/arq-*.md` se cargan solas al tocar archivos de cada módulo y te
  recuerdan qué doc leer.
- **No leas toda la carpeta `docs/arquitectura/` de una vez.**
- Al diseñar algo nuevo, propone interconexiones: busca dónde el módulo puede derivar datos de
  tablas existentes en vez de pedir captura manual, y dónde puede alimentar a otros módulos.

## Comandos

- `npm run dev` levanta el servidor de desarrollo en http://localhost:5173.
- `npm run build` hace el build de producción. Úsalo como verificación final de cualquier cambio de
  UI.
- `npm run lint` corre ESLint. `npm run format` corre Prettier.
- Tests:
  - `npx vitest related --run <archivos>`: solo los tests relacionados. Úsalo mientras iteras.
  - `npm test`: la suite completa. Córrela **una sola vez**, al final.
- Hooks automáticos:
  - Al editar `src/**/*.{js,jsx}`: ESLint `--fix` más los tests relacionados. Si fallan, bloquean.
  - Al terminar el turno: la suite completa, si tocaste `src`.
  - Pre-commit (husky): lint-staged.

## Reglas de desarrollo

- **"Terminado"** significa que se cumplen las cuatro cosas:
  1. Tests nuevos o actualizados, y `npm test` en verde.
  2. `npm run build` OK si tocaste UI.
  3. Doc del módulo actualizado si cambiaste rutas, tablas, columnas, permisos o relaciones.
  4. Ítem en el changelog (skill `changelog`).
- **Nunca** modifiques un test solo para que pase. Busca la causa en el código. Si no la
  resuelves, detente y pregunta.
- **Base de datos:**
  - Los cambios de esquema van **solo** como archivos nuevos en `supabase/migrations/`, con nombre
    `YYYYMMDDHHMMSS_descripcion.sql`.
  - Las migraciones **no se aplican a producción** sin confirmación explícita del desarrollador.
  - Antes de cualquier operación destructiva (DROP, DELETE, TRUNCATE), pide confirmación.
- **RLS y permisos:** toda capability nueva se valida también en RLS, no solo en la UI. Revisa
  `docs/arquitectura/permisos.md`.
- **Estilos:**
  - DM Sans para el cuerpo y DM Mono para etiquetas y números.
  - Color de marca `#FFB800` en estados activos. Fondo `#f2f0e8` (`.main-bg`).
  - Colores en hex hardcodeado, sin extender el tema de Tailwind. `.input-base` para inputs.
- Para vistas nuevas usa los componentes compartidos `FilterBar`, `DescribedSelect`, `StatusPill`
  y `NetworkIcon` (ver `docs/arquitectura/convenciones.md`).
- Mantén los docs de arquitectura en **estado actual**, sin historia. El historial ya está en git.

## Workflow con agentes

- `/feature <descripción>`: un cambio de punta a punta (plan, implementación, revisión y PR).
- `/cambios <lista>`: varios cambios independientes en paralelo, un agente y un worktree por
  cambio.
- `/tareas-mappi`: lee las tareas pendientes de código asignadas al desarrollador en MAPPI (vía el
  MCP), las clasifica, despliega agentes, verifica y avisa al terminar.
- Agentes disponibles en `.claude/agents/`:
  - `implementador`: implementa un cambio en su worktree.
  - `revisor`: revisa un diff antes del PR, en solo lectura.
- Los agentes que corren en paralelo **no editan** `src/data/changelog.js` ni los docs
  compartidos (`datos.md`, `permisos.md`, `interconexiones.md`). Devuelven ese texto en su
  resultado y el orquestador lo integra al final. Así se evitan conflictos entre ramas.

## Entorno

- `.env.local` define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, que se leen en
  `src/supabase.js`.
- MCP `supabase` (configurado en tu usuario): acceso administrativo a la base. Úsalo con cuidado y nunca
  apliques migraciones sin confirmación.
- MCP `mappi` (en `.mcp.json`, OAuth): el conector de MAPPI. Lee tareas con `query_database` y, con rol de escritura,
  actualiza tareas con `update_task` y `add_task_comment`.
