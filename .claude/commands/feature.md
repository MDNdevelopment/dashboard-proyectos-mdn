---
description: Un cambio de punta a punta — plan con aprobación, implementación en worktree, revisión automática, verificación y PR. Reemplaza "abrir un chat nuevo en plan mode por cada feature". Uso — /feature <descripción>
---

# /feature

Pedido: `$ARGUMENTS`

1. **Planificar.** Lanza un agente `planificador` con el pedido. Muestra al desarrollador:
   - La interpretación.
   - El spec y los criterios de aceptación.
   - El riesgo y si requiere migración.
   - Una sección `## Razonamiento del plan` (ver `.claude/rules/planning.md`).

   Si el planificador devolvió preguntas, házlas con AskUserQuestion y vuelve a planificar con las
   respuestas.

2. **Aprobación.** Espera el OK explícito del desarrollador al plan. Si pide ajustes, incorpóralos
   al spec. No hace falta otro planificador si los ajustes son menores.
3. **Implementar.** Lanza un `implementador` con `isolation: "worktree"`, el spec aprobado, la ruta
   del repo principal y la rama.
4. **Revisar.** Lanza un `revisor` sobre la rama. Si pide cambios, lanza un `implementador` en modo
   corrección y vuelve a revisar, con un máximo de 2 rondas. Si sigue bloqueado, muestra los
   hallazgos y pregunta cómo seguir.
5. **Cerrar la rama.** En el worktree de la rama:
   - Agrega el ítem de changelog (skill `changelog`) y los `docs_compartidos`.
   - Haz commit `chore: changelog`.
   - Corre una vez `npm test` y `npm run build`.
6. **PR.** `git push -u origin <rama>` y `gh pr create --base main`. El cuerpo lleva:
   - Qué cambia.
   - Tests.
   - Pruebas manuales sugeridas.
   - Migraciones no aplicadas, si hay.

   Nunca mergees el PR ni apliques migraciones.

7. **Reportar.** Link del PR, resumen en 3 líneas y migraciones pendientes, si las hay.
