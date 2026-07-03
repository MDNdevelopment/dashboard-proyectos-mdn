# /cambios — Orquestador multi-agente

Implementa varios cambios independientes en paralelo: un agente por cambio, cada uno en su propio
worktree y rama. Al terminar muestra un resumen y espera tu aprobación antes de pushear y abrir PRs.

## Cómo usarlo

```
/cambios <descripción de los cambios que quieres>
```

O simplemente ejecuta `/cambios` justo después de aprobar un plan — el orquestador leerá los cambios
del plan aprobado en el contexto.

**Flujo recomendado completo:**
1. `Shift+Tab` → plan mode → describes los cambios.
2. Apruebas el plan.
3. Ejecutas `/cambios`.
4. Los agentes trabajan en paralelo. Ves el progreso en tiempo real.
5. Recibes la tabla-resumen y das tu OK.
6. Los PRs se crean y recibes los links.

---

## Instrucciones para Claude (orquestador)

Al recibir este comando debes:

### 1. Descomponer los cambios
Lee los cambios descritos por el usuario (en el prompt actual o en el plan aprobado en contexto).
Produce una lista de cambios **independientes**: cambios que no tocan los mismos archivos van en
paralelo; cambios que se pisan van en el mismo agente o en serie.

Para cada cambio determina:
- **nombre de rama** (`feat/<kebab>` o `fix/<kebab>`, kebab-case en español sin tildes)
- **título de PR** (Conventional Commits en español, ≤ 70 chars)

Anuncia la lista al usuario antes de lanzar los agentes.

### 2. Lanzar agentes en paralelo
Usa la herramienta `Agent` con `subagent_type: "implementador"` e `isolation: "worktree"`.
**Lanza todos los agentes independientes en un único mensaje** (múltiples tool calls en paralelo).
El prompt de cada agente debe incluir:
- La descripción exacta del cambio a implementar.
- La ruta absoluta del repo principal (para el symlink de node_modules).
- La rama que debe crear.
- Instrucción de devolver el JSON de resultado.

Para cambios en serie (se pisan): lanza el siguiente agente solo tras recibir el resultado del anterior.

### 3. Mostrar tabla-resumen
Al completarse todos los agentes, muestra una tabla markdown:

| Cambio | Rama | Archivos | Tests | Commit |
|--------|------|----------|-------|--------|
| Descripción breve | `feat/nombre` | N archivos | ✓ 12 passed | `abc1234` |
| Descripción breve | `fix/nombre` | N archivos | ✗ FAILED | — |

Resalta en rojo (⛔) los cambios con tests fallidos. Esos no se pushearán.

### 4. PAUSA — pedir aprobación
**No pushees nada todavía.** Muestra el resumen y escribe algo como:

> ¿Procedo a pushear las ramas con tests en verde y abrir los PRs?
> Ramas listas: `feat/x`, `fix/y`
> Ramas con fallos (no se pushean): `feat/z`

Espera respuesta explícita del usuario antes de continuar.

### 5. Push + PRs (tras aprobación)
Por cada rama con `commit_sha` no nulo (tests en verde):

```bash
git push -u origin <rama>
gh pr create --base main --title "<titulo_pr>" --body "<cuerpo_pr>"
```

El cuerpo del PR viene del JSON de resultado del agente (ya incluye checklist y nota de tests).

Devuelve la **lista de URLs de PR** creados, un link por línea.

### 6. Limpieza de worktrees
Tras hacer push de todas las ramas:
```bash
git worktree prune
```
