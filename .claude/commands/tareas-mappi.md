---
description: Lee mis tareas de código pendientes en MAPPI, las implementa con agentes en paralelo, verifica todo y abre un PR del lote. Uso — /tareas-mappi [ids de tarea | cerrar | simular]
---

# /tareas-mappi

Argumentos: `$ARGUMENTS`

- _(vacío)_: procesa todas las tareas pendientes de código del desarrollador.
- `<uuid> <uuid> …`: procesa solo esas tareas.
- `simular`: hace solo la Fase 1 (lectura y planificación) y muestra qué haría, sin implementar
  ni escribir en MAPPI.
- `cerrar`: marca como `Terminado` las tareas de los lotes ya mergeados (ver más abajo).

## Configuración

Lee `.claude/tareas-mappi.json`:

- `responsable_email`: el usuario de MAPPI cuyas tareas se procesan.
- `filtro_descripcion`: patrones `ILIKE` que identifican tareas de código de la plataforma.
- `estados`: estados que se toman.
- `max_paralelo`: límite de implementadores en paralelo.
- `escribir_en_mappi`: si se comenta y se cambia el estado en MAPPI.

## 1. Leer las tareas (MCP `mappi`, solo lectura)

Con `mcp__mappi__query_database`:

```sql
select user_id::text as uid, first_name, last_name
from users where lower(email) = lower('<responsable_email>') and deleted_at is null;
```

```sql
select t.id, t.description, t.status, t.request_date, t.due_date, t.client,
       coalesce(c.first_name || ' ' || c.last_name, t.created_by) as pedido_por,
       (select string_agg(tc.content, E'\n---\n' order by tc.created_at)
          from task_comments tc where tc.task_id = t.id) as comentarios
from tasks t
left join users c on c.user_id::text = t.created_by
where (t.assignee_id = '<uid>' or '<uid>' = any(t.assignee_ids))
  and t.status = any(array[<estados>])
  and (t.description ilike any(array[<filtro_descripcion>]))
order by t.due_date nulls last, t.request_date;
```

Si se pasaron ids, filtra por `t.id = any(array[...]::uuid[])` en lugar del filtro de
descripción.

**Excluye las tareas que ya tienen un lote abierto.** Son las que tienen un comentario con
`🤖 Lote` y un PR que todavía no está mergeado (compruébalo con `gh pr view <url> --json state`).

**Los comentarios cuentan como contexto.** Si alguien respondió a preguntas anteriores del agente,
esas respuestas son parte del pedido.

Si no hay tareas, dilo y termina.

## 2. Ejecutar el lote

Sigue la skill **`lote-agentes`** completa, con `max_paralelo` de la configuración.

- Cada cambio usa como `id` el uuid de la tarea y como pedido la descripción, los comentarios, el
  "pedido por" y las fechas.
- La rama de cada cambio termina con los primeros 8 caracteres del id. Por ejemplo:
  `feat/total-videos-agencia-86b61c31`.
- Con `simular`, detente al terminar la Fase 1 de la skill y muestra la tabla de lo que se haría.

## 3. Escribir de vuelta en MAPPI

Esto solo aplica si `escribir_en_mappi` es true y el MCP expone `update_task` /
`add_task_comment`. Si no los expone, sáltalo y menciónalo en el reporte.

- **✅ En el PR**:
  - `add_task_comment`:
    `🤖 Lote <LOTE>: implementado y verificado (tests, lint, build). PR: <url>. Queda pendiente de revisión y publicación.`
    Si hay pruebas manuales sugeridas, agrégalas en una línea.
  - `update_task` con `status: "En proceso"`.
- **❓ Necesita info**:
  - `add_task_comment`:
    `🤖 Antes de implementar esta tarea necesito confirmar: 1) … 2) …`, con las preguntas del
    planificador en lenguaje no técnico.
  - El estado no se toca.
- **⚠️ Riesgo alto, ⛔ falló o 🗑️ descartado**: no se comenta en MAPPI. Se reporta solo al
  desarrollador.

## 4. Reporte

Termina con el reporte de la Fase 7 de la skill: link del PR, tabla por tarea (descripción
original y estado), preguntas enviadas y migraciones pendientes.

## Modo `cerrar`

1. `gh pr list --label mappi-lote --state merged --json number,url,body,mergedAt --limit 20`.
2. Extrae los ids del marcador `<!-- mappi-tasks: … -->` de cada PR.
3. Con `query_database`, quédate con las tareas de esos ids que siguen en `En proceso`.
4. Para cada una:
   - `update_task` con `status: "Terminado"`.
   - `add_task_comment` con
     `🤖 Publicado en el PR #<n> (mergeado el <fecha>). Disponible tras el próximo deploy.`
5. Reporta qué se cerró.
