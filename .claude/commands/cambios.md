---
description: Implementa varios cambios independientes en paralelo (un agente y un worktree por cambio), los revisa, los integra en un lote verificado y abre un PR. Uso — /cambios <lista de cambios>
---

# /cambios

Cambios pedidos: `$ARGUMENTS`

Si `$ARGUMENTS` está vacío, toma los cambios del plan que se acaba de aprobar en esta
conversación. Si tampoco hay plan, pide la lista y termina.

1. Separa el pedido en cambios atómicos, con ids `c1`, `c2`, …, y muestra la lista en una línea
   por cambio.
2. Sigue la skill **`lote-agentes`** completa. Estas son las diferencias respecto de
   `/tareas-mappi`:
   - Los cambios vienen del desarrollador, que está presente. Si un planificador devuelve
     `necesita_info` o `riesgo: alto`, **pregúntale** con AskUserQuestion (una sola ronda, todas
     las preguntas juntas) en lugar de solo reportarlo. Con su respuesta, vuelve a planificar ese
     cambio.
   - En el PR no va el marcador `mappi-tasks`.
3. Termina con el reporte de la Fase 7.
