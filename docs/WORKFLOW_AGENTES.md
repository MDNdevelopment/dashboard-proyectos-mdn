# Workflow de desarrollo con agentes

## Cómo trabajar a diario

| Quiero…                                                 | Comando                              |
| ------------------------------------------------------- | ------------------------------------ |
| Implementar una feature o un fix, revisando el plan     | `/feature <descripción>`             |
| Lanzar varios cambios a la vez                          | `/cambios <lista>`                   |
| Que Claude tome mis tareas de MAPPI y las resuelva solo | `/tareas-mappi`                      |
| Ver qué haría con mis tareas, sin tocar nada            | `/tareas-mappi simular`              |
| Marcar como Terminado lo que ya mergeé                  | `/tareas-mappi cerrar`               |
| Publicar una versión del changelog                      | "haz un release" (skill `changelog`) |

Ya no hace falta abrir un chat nuevo en plan mode para cada feature. `/feature` hace el plan, te
lo muestra para que lo apruebes y después implementa, revisa y abre el PR.

## Qué pasa en `/tareas-mappi`

```
MAPPI (MCP)        →  tus tareas "Pendiente" cuya descripción menciona MAPPI
planificador ×N    →  spec por tarea (listo / necesita info / riesgo alto / descartar)
implementador ×N   →  cada una en su worktree y rama, con tests, lint y build
revisor ×N         →  revisión del diff; hasta 2 rondas de corrección
integración        →  rama lote/AAAAMMDD-HHMM + changelog + suite completa + build
PR                 →  un solo PR con todo el lote (etiqueta mappi-lote)
MAPPI (MCP)        →  comentario con el link del PR + estado "En proceso"
                      o preguntas a quien pidió la tarea, si era ambigua
aviso              →  notificación de macOS y resumen en el chat
```

Barandas de seguridad:

- Nunca mergea ni hace push a `main`.
- Nunca aplica migraciones.
- Las tareas de **riesgo alto** no se implementan solas: te deja el spec para que las lances con
  `/feature`. Riesgo alto es todo lo que toca permisos/RLS, Finanzas, borrado de datos, auth o el
  MCP de escritura.

Para correrlo sin estar mirando, desde la raíz del repo:

```bash
claude -p "/tareas-mappi" --permission-mode acceptEdits
```

Los permisos que necesita ya están en `.claude/settings.json`.

## Configuración (una sola vez)

1. **Conector MAPPI en Claude Code.** `.mcp.json` ya lo declara (`https://mdngestion.netlify.app/mcp`).
   Al abrir Claude Code en el repo, aprueba el servidor `mappi` y autentícate con `/mcp`.
   - Para **leer** tareas alcanza la contraseña de lectura.
   - Para **comentar y cambiar el estado**, necesitas una contraseña de **escritura** propia: agrega
     tu `user_id` a `MCP_WRITERS` en las variables de entorno de Netlify.
2. **Migración del MCP de escritura.** Aplica
   `supabase/migrations/20261003150000_mcp_writer_task_status_comments.sql`. Le da permiso al rol
   `mcp_writer` para cambiar el estado de las tareas y comentarlas. Después haz deploy en Netlify
   para publicar las tools `update_task` y `add_task_comment`.
3. **`gh` autenticado** (`gh auth status`) para abrir PRs.
4. **Ajustes de `/tareas-mappi`** en `.claude/tareas-mappi.json`: responsable, filtro, estados,
   paralelismo y si escribe en MAPPI. Mientras el paso 2 no esté listo, pon
   `"escribir_en_mappi": false`.

## Para que las tareas salgan bien

El agente interpreta la descripción de la tarea. Cuanto más concreta sea, menos preguntas va a
hacer. Por ejemplo:

- ❌ "Actualización de MAPPI: Total de videos en la agencia"
- ✅ "Actualización de MAPPI: en Pautas → Rendimiento, una tarjeta con el total de videos editados
  en el mes por toda la agencia"

Si la tarea es ambigua, el agente comenta las preguntas en la propia tarea de MAPPI. Cuando
alguien responde ahí, el siguiente `/tareas-mappi` toma esas respuestas como contexto.

## Documentación de arquitectura

- `ARQUITECTURA.md` es un índice. El detalle de cada módulo está en `docs/arquitectura/<modulo>.md`.
- Las reglas `.claude/rules/arq-*.md` hacen que Claude lea el doc del módulo que está tocando, y
  solo ese.
- Los docs describen el estado actual. Presupuesto: 25 KB por doc como máximo.
- Las dudas detectadas al condensar los docs están en `docs/arquitectura/verificar.md`.
