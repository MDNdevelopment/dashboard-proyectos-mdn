---
name: lote-agentes
description: Pipeline para ejecutar un lote de cambios de código en MAPPI con agentes en paralelo (planificador → implementador → revisor → integración → verificación → PR). Lo usan los comandos /cambios y /tareas-mappi; úsalo siempre que haya que implementar varios cambios a la vez.
---

# Pipeline de lote con agentes

Tú eres el **orquestador**. No implementas código tú mismo: delegas en agentes y mantienes tu
contexto limpio. Cada cambio del lote tiene: `id` (id de tarea MAPPI o `c1`, `c2`…), `pedido`
(texto original) y, tras planificar, su `spec`.

## Fase 0: preparar

- `REPO` = la raíz del repo principal (`git rev-parse --show-toplevel`).
- Trae lo último y parte de `origin/main`: `git fetch origin`. **No** cambies de rama ni toques
  el checkout del usuario.
- `LOTE` = `lote/AAAAMMDD-HHMM` (hora de Caracas).
- Crea la lista de tareas (TaskCreate), una por cambio, para que se vea el progreso.

## Fase 1: planificar (en paralelo)

Lanza un agente `planificador` por cambio, **todos en un solo mensaje**. Dale el pedido, quién lo
pidió y la fecha (si se conocen). Resultados:

- `listo` → pasa a la Fase 2.
- `necesita_info` → no se implementa. Guarda las preguntas para el reporte (y para MAPPI si
  aplica).
- `descartar` → no se implementa. Anota el motivo.
- `riesgo: alto` → **no se implementa en automático.** Se reporta con el spec propuesto para que
  el desarrollador lo apruebe y lo lance con `/feature`.

**Solapamiento:** si dos specs tocan los mismos archivos, agrúpalos en un solo implementador (un
spec combinado y una sola rama) o ejecútalos en serie. Limita el paralelismo a `max_paralelo`
(por defecto 4).

## Fase 2: implementar (en paralelo)

Lanza un `implementador` por cambio (o grupo) con `isolation: "worktree"`, todos en un mensaje.
El prompt incluye:

- Spec completo, criterios de aceptación, tests esperados y riesgo.
- `REPO` (para el symlink de `node_modules`) y la rama a crear.
- Que devuelva el JSON.

Si `commit_sha` es `null`, el cambio queda como fallido, con sus `notas`.

## Fase 3: revisar y corregir

Por cada rama commiteada, lanza un `revisor` (pueden ir en paralelo) con la rama, la base
`origin/main` y el spec.

- Si devuelve `cambios_requeridos`, lanza un `implementador` en **modo corrección** (misma rama,
  `isolation: "worktree"`, con los hallazgos bloqueantes e importantes) y vuelve a revisar.
- **Máximo 2 rondas.** Si sigue con hallazgos bloqueantes, el cambio queda fuera del lote como
  "necesita intervención", con los hallazgos.

## Fase 4: integrar

En un worktree propio, para no tocar el checkout del usuario:

```bash
git worktree add "$REPO/.claude/worktrees/lote" -b "$LOTE" origin/main
cd "$REPO/.claude/worktrees/lote" && ln -s "$REPO/node_modules" node_modules
ln -s "$REPO/.env.local" .env.local 2>/dev/null || true
git merge --no-ff <rama> -m "merge: <titulo>"   # una por cambio aprobado
```

Si hay conflicto:

- En docs de arquitectura, resuélvelo tú conservando ambos contenidos.
- En código, intenta una resolución obvia. Si no es obvia, `git merge --abort`, saca ese cambio del
  lote y anótalo.

Después:

- Agrega los ítems `changelog` de todos los cambios integrados a `CHANGELOG[0].changes` (skill
  `changelog`).
- Agrega los `docs_compartidos` al doc que corresponda.
- Commit: `chore: changelog y docs del lote`.

## Fase 5: verificar el lote completo

En el worktree del lote corre `npm test`, `npm run lint` y `npm run build`.

Si algo falla, identifica qué merge lo rompió (con `git log` y los archivos tocados), quítalo del
lote (`git reset --hard` al merge anterior y vuelve a integrar los demás) y repite la
verificación. Nunca abras un PR en rojo.

## Fase 6: publicar el PR

```bash
git push -u origin "$LOTE"
gh label create mappi-lote --color FFB800 --force >/dev/null 2>&1 || true
gh pr create --base main --head "$LOTE" --label mappi-lote --title "<título>" --body-file <archivo>
```

- **Título:** `lote: N cambios — <resumen corto>`.
- **Cuerpo**, en español:
  - Una sección por cambio: pedido original, interpretación, qué se hizo, archivos, tests y
    pruebas manuales sugeridas.
  - Una sección "⚠️ Migraciones" (si hay) que diga que **no están aplicadas** y en qué orden
    aplicarlas.
  - Resultado de la verificación (tests, lint, build).
  - Al final, el marcador `<!-- mappi-tasks: id1,id2 -->` con los ids de tareas MAPPI incluidas
    (si aplica).

**Nunca** mergees el PR, nunca hagas push a `main` y nunca apliques migraciones.

## Fase 7: limpiar y reportar

- `git worktree remove` del worktree del lote y `git worktree prune`. Las ramas de cada cambio
  quedan locales. Bórralas solo si el usuario lo pide.
- Notificación de escritorio (macOS):
  `osascript -e 'display notification "<N> listos, <M> con preguntas" with title "MAPPI · lote listo"'`
  (ignora el error si no es macOS).
- Reporte final al usuario: el link del PR y una tabla
  `| Cambio | Estado | Detalle |`, donde Estado es ✅ en el PR, ❓ necesita info, ⚠️ riesgo
  alto (spec propuesto), ⛔ falló o 🗑️ descartado. Debajo van las preguntas pendientes y las
  migraciones por aplicar.
