# Roadmap de blindaje de calidad — MDN Dashboard

## Context

**El objetivo real (palabras del autor):** llegar a un punto donde no tengas que revisar
manualmente el código que genera la IA, porque un sistema de **gates automáticos** lo
valida por vos. La filosofía de _Clean Code_ aplicada aquí no es "escribir código bonito",
sino: **cada cosa que un revisor humano atraparía, la atrapa una máquina antes de mergear.**

**Diagnóstico actual (revisión de agentes, 2026-08-04):**

- 🟢 **Base sólida**: suite madura de **123 archivos de test** (Vitest 4 + Testing Library +
  jsdom), con edge cases y comentarios del "por qué". Esto es lo caro y ya lo tenés.
- 🔴 **El problema**: esos tests **no bloquean nada**. No hay CI, Netlify despliega aunque
  fallen, y nada corre lint/cobertura. Tenés el cinturón de seguridad guardado en la
  guantera. El trabajo es **conectarlo como gate obligatorio**, no escribir más tests.

**Este documento es solo el roadmap** (no se implementa nada de código todavía). Al
aprobarlo, se generan **dos archivos** (y nada más):

1. **El roadmap técnico** → `docs/QA_BLINDAJE.md` dentro del repo (este documento), como
   referencia viva del plan de endurecimiento.
2. **Un resumen didáctico** → `~/Desktop/GUIA_TESTING_MDN.md`, escrito para alguien **nuevo
   en testing/QA**: explica en lenguaje simple qué es cada herramienta (CI, linter,
   cobertura, mutation testing, hooks, etc.), **para qué sirve**, qué problema resuelve y una
   analogía. Sin jerga innecesaria. Es la versión "para entender", no la "para ejecutar".

**Prioridad elegida:** (1) Gates automáticos CI/hooks · (2) Calidad real de los tests.
El resto de capas (seguridad RLS, robustez runtime) quedan documentadas como fases
posteriores, no como foco inmediato.

---

## Principio rector: defensa en profundidad (4 anillos)

La confianza para "no revisar" no viene de un solo gate, sino de anillos que fallan distinto:

```
Anillo 1  EDITOR/LOCAL   Claude Code hooks + git hooks   → feedback en segundos, antes de commitear
Anillo 2  PRE-MERGE      GitHub Actions (PR gate)        → bloquea el merge si algo falla
Anillo 3  PRE-DEPLOY     Netlify build corre tests       → nada roto llega a producción
Anillo 4  RUNTIME        Error Boundary + telemetría     → si algo se escapa, te enterás vos, no el cliente
```

Los anillos 1–3 son tu prioridad. El 4 se documenta como fase posterior.

---

## FASE 1 — Gates automáticos (prioridad máxima)

> Meta: que sea **imposible** mergear o desplegar código que rompe tests, no compila, o
> viola reglas de lint. Aquí es donde de verdad dejás de revisar a mano.

### 1.1 CI con GitHub Actions — _el gate que hoy no existe_

Crear `.github/workflows/ci.yml` que en cada `push` y `pull_request` corra, en paralelo:

- `npm ci` (instalación reproducible desde `package-lock.json`)
- `npm run build` (que el bundle de Vite compile)
- `npm test` (los 123 tests que ya tenés)
- `npm run lint` (una vez exista, ver 1.3)
- `npm run test:coverage` con umbral (ver Fase 2)

**Branch protection en `main`**: exigir que el check de CI esté en verde para poder
mergear. _Este es el candado._ Sin esto, el CI es solo decorativo.

> **Por qué CI y no solo confiar en el hook local:** el hook local se puede saltar
> (`--no-verify`), y un agente en un worktree puede no dispararlo. El CI corre en un
> entorno limpio que nadie puede eludir: es la única fuente de verdad sobre "esto pasa".

### 1.2 Netlify: fallar el deploy si fallan los tests

Hoy `netlify.toml` usa `command = "npm run build"` — despliega aunque los tests estén
rotos. Cambiar a que el build **dependa** de los tests:

```toml
command = "npm test && npm run build"
```

Así el Anillo 3 queda cerrado: producción nunca recibe un commit con tests en rojo,
incluso si alguien saltó el CI.

### 1.3 ESLint + Prettier — análisis estático

No hay linter (confirmado: cero eslint/prettier en `package.json`). Para un proyecto de
~51k líneas y 195 `.jsx`, esto es un hueco grande: un linter atrapa bugs reales que la IA
comete y que un test no cubre.

- **ESLint** (flat config `eslint.config.js`) con: `eslint`, `@eslint/js`,
  `eslint-plugin-react`, `eslint-plugin-react-hooks` (crítico: detecta deps faltantes en
  `useEffect`, causa #1 de bugs sutiles en React), `eslint-plugin-jsx-a11y`.
- **Prettier** para formato, integrado vía `eslint-config-prettier` (que Prettier gane en
  formato y ESLint en lógica, sin pelearse).
- Scripts nuevos: `lint` (`eslint .`) y `format` (`prettier --write`).

> **Por qué reglas de hooks son no-negociables:** el error más común de código React
> generado por IA es un `useEffect` con array de dependencias incompleto → estado obsoleto
> o loops. Ningún test de "humo" lo atrapa; `react-hooks/exhaustive-deps` sí, y de forma
> gratuita en cada archivo.

### 1.4 Git hooks locales — Husky + lint-staged (Anillo 1)

Instalar `husky` + `lint-staged` para un hook `pre-commit` que, **solo sobre los archivos
staged**, corra ESLint + Prettier y los tests relacionados
(`vitest related --run`). Feedback en segundos, antes de que el código malo exista siquiera
como commit.

> **Naive vs. elegido:** lo naive es correr `npm test` completo en cada commit → lento,
> molesto, la gente lo desactiva. `lint-staged` + `vitest related` solo toca lo que
> cambiaste: rápido, y por eso _sostenible_.

### 1.5 Claude Code hooks — el gate específico para "no revisar la IA"

Esto es lo que ataca tu problema de raíz. En `.claude/settings.json` (hoy solo tiene
permisos, cero hooks), configurar un **`PostToolUse` hook** sobre `Edit`/`Write` que, cada
vez que la IA toca un archivo de `src/`, dispare automáticamente lint + los tests
relacionados de ese archivo. Si fallan, **la IA recibe el error como feedback y lo corrige
en el mismo turno**, sin que vos intervengas.

Complementar con un **`Stop` hook** que corra `npm test` al final de cada tarea, para que
la IA no pueda declarar "listo" con la suite en rojo (refuerza la regla que ya tenés en
`CLAUDE.md`, pero de forma que el harness la _obliga_, no solo la sugiere).

> Este es el eslabón que convierte tu `CLAUDE.md` de "reglas que la IA debería seguir" en
> "gates que la IA no puede evitar". Es la diferencia entre pedir y garantizar.
> La configuración de hooks se hace con la skill `update-config`.

---

## FASE 2 — Calidad real de los tests (segunda prioridad)

> Meta: dejar de confiar en "los tests pasan" y empezar a medir **si los tests sirven**.
> 123 archivos en verde no significan nada si no ejercitan la lógica que importa. Esta fase
> responde a la pregunta honesta: _"¿mis tests son lo bastante buenos como para no revisar?"_

### 2.1 Cobertura con umbral que bloquea

Añadir `@vitest/coverage-v8` y un bloque `coverage` en `vite.config.js` con **thresholds**
(ej. 70% líneas/ramas al inicio, subiendo con el tiempo). Script `test:coverage`. En CI,
si la cobertura baja del umbral, **el build falla**.

Esto le pone un piso al agente: _no puede agregar código nuevo sin tests que lo cubran_,
porque tumbaría el umbral y el CI lo rechazaría. Convierte "escribí tests, por favor" en
una obligación mecánica.

> **Trade-off honesto sobre el %:** un umbral alto de golpe (90%) sobre 51k líneas te
> frena. Recomendación: fijar el umbral en el nivel actual real (lo medimos primero) y una
> regla de "no bajar nunca" (`ratcheting`). Sube solo, nunca baja. Menos fricción, mismo
> efecto a largo plazo.

### 2.2 Mutation testing (Stryker) — _el que verifica a los tests_

Cobertura mide **qué líneas se ejecutan**, no si el test **notaría** un bug ahí. Un test
que corre una línea pero no afirma nada da 100% de cobertura y cero protección.

**Stryker** (`@stryker-mutator/core` + runner de Vitest) introduce bugs artificiales
(cambia `>` por `>=`, borra líneas, invierte booleanos) y verifica que **algún test
falle**. Si nadie se queja, ese test es teatro. El _mutation score_ es la métrica más
cercana a "¿puedo confiar en estos tests sin leerlos?".

> **Por qué esto y no solo más cobertura:** cobertura es necesaria pero no suficiente —
> mide presencia, no eficacia. Mutation testing mide eficacia. Para tu objetivo de "no
> revisar", es la herramienta conceptualmente correcta: audita a los auditores.
> **Trade-off:** es lento (corre la suite N veces). Estrategia: no correrlo en cada PR,
> sino sobre los archivos cambiados en el PR (`--since`), o en un job nocturno programado,
> enfocándolo primero en la lógica pura de alto riesgo (`src/lib/`: permisos, SLA,
> progreso, scoring — donde un bug silencioso hace más daño).

### 2.3 Factory de mock de Supabase compartido

Hoy el mock de Supabase está **duplicado inline en 47 archivos** con dos estilos distintos.
Riesgo: cada test simula el backend a su manera, y un mock inconsistente puede pasar un
test que en realidad no refleja cómo responde Supabase (falsos positivos = confianza falsa).

Extraer un único `src/test/helpers/supabaseMock.js` (basado en el patrón `makeQuery`
thenable que ya existe en `EvaluacionesPage.test.jsx`, el más completo) que todos importen.
Un solo lugar donde el mock es correcto = los 123 tests comparten la misma verdad sobre el
backend.

> **Por qué importa para "no revisar":** si cada test miente distinto sobre Supabase, no
> podés confiar en el conjunto sin leerlos uno por uno. Un mock canónico hace que "el test
> pasa" signifique lo mismo en los 123 archivos.

### 2.4 (Opcional) Smoke E2E con Playwright

1–3 tests end-to-end de los flujos críticos (login → ver proyectos → crear tarea) contra el
build real. Atrapan lo que los tests con mocks nunca ven: que el wiring real
frontend↔Supabase↔routing funciona. Pocos y estables, no una suite E2E completa.

---

## FASES POSTERIORES (documentadas, fuera del foco inmediato)

Estas cubren los otros riesgos que encontró la revisión. No son la prioridad ahora, pero
quedan aquí para no perderlas:

- **Seguridad / RLS**: endurecer las políticas permisivas (`projects`, `metric_line_members`,
  `task_comments` permiten a cualquier autenticado leer/escribir/borrar datos ajenos);
  sincronizar la doble fuente de verdad JS/SQL en permisos de Métricas (caveat conocido,
  `ARQUITECTURA.md:213`); correr `mcp__supabase__get_advisors` (security + performance) en CI.
- **Robustez runtime**: React **Error Boundary** (hoy un error de render = pantalla blanca);
  **Sentry** para telemetría (hoy no te enterás de errores en producción); validación por
  esquema con **zod** en los límites con Supabase (hoy 100% manual, sin CHECK en varias
  columnas de estado).
- **Higiene de dependencias**: **Dependabot** o **Renovate** para actualizaciones y CVEs
  automáticos.
- **Definición de "hecho"**: PR template con checklist, y aprovechar los slash commands ya
  disponibles `/code-review` y `/security-review` como paso previo al merge.

---

## Verificación (cómo comprobar que cada gate funciona de verdad)

Un gate no probado es un gate que no existe. Al implementar cada fase:

1. **CI**: abrir un PR de prueba que rompe un test a propósito → el check debe ponerse rojo
   y bloquear el merge. Romper el build → idem. Revertir.
2. **Netlify**: un commit con test roto no debe llegar a producción (deploy falla).
3. **Claude Code hook**: pedirle a la IA un cambio que rompe un test → debe recibir el error
   y autocorregirse sin intervención tuya.
4. **Cobertura**: agregar una función sin test → el umbral debe hacer fallar el CI.
5. **Stryker**: correr sobre `src/lib/permissions.js`; revisar los mutantes "supervivientes"
   (bugs que ningún test detectó) → esa lista _es_ tu backlog de tests faltantes.

## Orden de implementación sugerido

```
1. ESLint + Prettier + scripts          (1.3)  ── base para todo lo demás
2. GitHub Actions CI + branch protection (1.1) ── el candado principal
3. Netlify test-gate                     (1.2)
4. Cobertura con umbral "no bajar"       (2.1)
5. Husky + lint-staged                   (1.4)
6. Claude Code hooks                     (1.5) ── el gate anti-IA-sin-revisar
7. Factory de mock Supabase              (2.3)
8. Stryker sobre src/lib/                (2.2)
9. (opcional) Playwright smoke           (2.4)
```

Cada punto es un PR pequeño e independiente, verificable por sí solo.
