---
name: mdn-dashboard-metrics
description: Cómo se calcula el score 0-100 de "Reportes mensuales · Líneas operativas" en el dashboard de MDN Publicidad, y cómo interpretar los datos de metric_reports, tasks, evaluation_sessions, support_tickets, campaigns/paid_campaigns, meetings y leads vía el conector MCP de solo lectura. Usar siempre que se pida un score/puntaje/ranking, se analicen tareas, evaluaciones de desempeño, tickets de soporte, campañas/ads, reuniones o leads, o cualquier consulta SQL sobre las tablas del dashboard.
---

# MDN Dashboard — Guía de interpretación de datos (MCP de solo lectura)

Este skill documenta el dashboard interno de MDN Publicidad (agencia de publicidad
venezolana): 9 módulos — Proyectos, Tareas, Métricas, Empresa, Evaluaciones, Tickets,
Ads, Reuniones y Auth. Es la referencia para interpretar correctamente los datos
cuando se consulta la base de datos vía el conector MCP de solo lectura "MDN
Proyectos" (`netlify/functions/mcp.js` en el repo `dashboard-proyectos-mdn`), que
expone dos tools: `list_tables` (esquema vía `information_schema.columns`) y
`query_database` (`sql`, un único `SELECT`/`WITH...SELECT`, `limit` ≤1000, default
500).

El grueso de este documento es el módulo **Métricas** (score 0-100 de líneas
operativas) — **no existe ninguna vista SQL ni función RPC que lo calcule**, todo el
cálculo vive en JavaScript en el frontend (`src/utils/metricsScore.js`) y nunca se
persiste como columna; hay que **recalcularlo con la fórmula de este documento**. La
sección final ("Otros módulos") cubre el resto del dashboard — incluida
**Evaluaciones, que sí tiene una vista y un RPC ya calculados** (ver más abajo).

## ⚠️ Aislamiento por empresa (multi-tenant) — leer primero

El rol de Postgres que usa el conector MCP (`mcp_readonly`) se conecta **sin JWT de
Supabase Auth y con `BYPASSRLS`**, así que ve las filas de **todas las empresas
clientes del dashboard a la vez** (y de todos los niveles de usuario), sin ninguno de
los filtrados que aplica la app normalmente vía RLS (por empresa, por línea, por
nivel). No existe una tabla `companies`; el tenant se identifica con el campo de
texto `company_id` presente en casi todas las tablas de negocio (`metric_lines`,
`metric_clients`, `metric_reports`, `tasks`, `support_tickets`, `paid_campaigns`,
`meetings`, `notifications`... y `users.company_id`, tipo uuid, con el que se cruza
haciendo cast a texto). **Excepción notable: `leads` no tiene `company_id`** — es una
tabla global sin aislar por empresa (ver sección Leads más abajo).

**Regla obligatoria: todo `SELECT` sobre estas tablas debe filtrar por `company_id`**
(salvo que el usuario pida explícitamente comparar entre empresas). Si no se sabe la
empresa del usuario que pregunta, primero resolverla (p. ej. vía `users` con su email)
antes de calcular cualquier score, ranking o cualquier otra consulta — mezclar datos
de dos empresas en el mismo resultado produce respuestas sin sentido.

**Datos sensibles sin gating:** el frontend oculta ciertos campos a usuarios de nivel
bajo (`isFinancePrivileged`: nivel 4/admin) — `metric_clients.monthly_fee`/
`payment_day`, `users.monthly_salary`, y el detalle de `metric_reports.data.finanzas`.
Ese gating es **solo de UI**; el rol MCP los lee sin restricción por ser `BYPASSRLS`.
Al responder preguntas que toquen sueldos o mensualidades, tratar el dato como
sensible aunque la consulta SQL lo haya devuelto sin objeciones — no asumir que quien
pregunta por el conector tendría ese permiso dentro de la app.

**Niveles de usuario (`users.access_level`, entero) + `users.admin` (booleano
independiente, siempre pasa todos los checks):**

| Nivel | Rol típico           |
| ----- | -------------------- |
| 1     | Empleado base        |
| 2     | Coordinador          |
| 3     | Jefe de línea        |
| 4     | Director / dirección |

`metric_line_members.is_lead = true` marca a la jefa/jefe de una línea específica
(distinto de `access_level`, que es global al usuario).

## Dominio: qué es una "línea"

Una **línea operativa** (tabla `metric_lines`) es un equipo/unidad de la agencia
(ej.: Redes, Diseño, Audiovisual...). Cada línea tiene una **cartera de clientes**
(`metric_clients.line_id`) y reporta métricas **mensuales** en `metric_reports`
(una fila por `line_id + year + month`, `unique(line_id, year, month)`).

- `metric_lines.is_general = true` marca una fila especial oculta llamada
  "Independientes" (empleados sin línea asignada); no es una línea operativa real y
  normalmente se excluye de scores/rankings.
- `metric_reports.closed_at` no nulo = el reporte quedó cerrado permanentemente (no
  editable en la app; un trigger de Postgres lo bloquea). Esto no afecta si cuenta o
  no para el score — para eso ver `incompleto` más abajo.

## La fórmula del score (0–100)

El score es la suma de **6 indicadores parciales ponderados** que suman 100 puntos.
Se calcula **por línea y por mes**, leyendo el jsonb `metric_reports.data`. No hay
score a nivel de cliente ni de empresa — solo línea×mes (los agregados de dashboard,
como el promedio anual, son promedios de estos scores mensuales).

| Indicador     | Peso | Campo en `data`          | Fórmula                                                                               |
| ------------- | ---: | ------------------------ | ------------------------------------------------------------------------------------- |
| Reuniones     |   20 | `reuniones`              | `(realizadas / meta) * 20`, o `0` si `meta = 0`                                       |
| Productividad |   20 | `productividad.tareas[]` | `(Σ realizado / Σ meta) * 20` sobre todas las tareas del array, o `0` si `Σ meta = 0` |
| Crecimiento   |   20 | `crecimiento.items[]`    | `(clientes que cumplieron meta / total items) * 20`, o `0` si no hay items            |
| Solicitudes   |   10 | `solicitudes`            | `(editadas / solicitudes) * 10`, o `0` si `solicitudes = 0`                           |
| Pautas        |   20 | `pautas.items[]`         | `(clientes que cumplieron meta / total items) * 20`, o `0` si no hay items            |
| Piezas        |   10 | `piezas`                 | `(editadas / piezas) * 10`, o `0` si `piezas = 0`                                     |

```
score = min(100, reuniones + productividad + crecimiento + solicitudes + pautas + piezas)
```

Notas importantes:

- **Cada indicador se calcula sobre el `report.data` de un único mes.** No se
  promedia con meses anteriores, salvo Crecimiento, que necesita el mes previo solo
  para el _fallback_ histórico (ver abajo).
- El resultado se **clampa a 100** (por si algún parcial se pasa de su peso — no
  debería ocurrir con datos válidos, pero la fórmula lo protege).
- `feedback` (satisfacción del cliente) **NO entra en el score**. Es informativo/
  cualitativo únicamente — no lo sumes ni lo menciones como parte del 0-100.
- `finanzas` (ingresos/egresos/nómina) **tampoco entra en el score**. Se muestra por
  separado (ver sección Finanzas más abajo).

### Detalle: Reuniones

```
reuniones_score = meta == 0 ? 0 : (realizadas / meta) * 20
```

Campos: `data.reuniones.realizadas` (número), `data.reuniones.meta` (número,
configurable por línea, tope = cantidad de clientes activos de la línea).

**`realizadas` puede estar desactualizado en la fila cruda.** No es un campo que el
usuario tipee: para meses `>= 2026-07` (`REUNIONES_MODULE_START`) y reportes no
cerrados, la app lo **recalcula y sobreescribe cada vez que alguien abre la vista
Operaciones de esa línea** (`countMeetingsHeldForLine`: cuenta filas de `meetings` con
`status = 'realizada'` en ese mes/línea, **deduplicadas por `client_id`** — máx. 1 por
cliente, para que la meta no se infle reuniéndose repetidas veces con la misma marca).
No hay trigger que lo mantenga sincronizado. Si se necesita el número **actual y
exacto** (no el guardado la última vez que alguien miró la pantalla), recalcularlo
directo desde `meetings`:

```sql
select count(distinct coalesce(client_id::text, id::text)) as realizadas
from meetings
where line_id = '<line_id>' and status = 'realizada'
  and date_trunc('month', starts_at) = date '<year>-<month>-01';
```

Para meses **anteriores** a 2026-07, `meetings` no tiene filas (el módulo no existía)
— ahí sí hay que confiar en el valor guardado en `data.reuniones.realizadas` tal cual,
no recalcularlo (daría 0 y estaría mal). Para reportes **cerrados** (`closed_at` no
nulo), también vale el guardado tal cual — quedó congelado en el cierre.

### Detalle: Productividad

Se suman **todas** las tareas fijas del array antes de dividir (no es un promedio de
razones individuales):

```
real = Σ data.productividad.tareas[].realizado
meta = Σ data.productividad.tareas[].meta
productividad_score = meta == 0 ? 0 : (real / meta) * 20
```

### Detalle: Crecimiento (seguidores)

Por cada item de `data.crecimiento.items[]` (uno por cliente de la cartera) se
determina cuántos seguidores ganó ese cliente en el mes:

1. **Modelo actual (preferido):** usar `item.seguidoresGanados` directamente si no es
   `null`.
2. **Fallback (reportes históricos sin ese campo):**
   `ganados = seguidoresActuales - base`, donde `base` es
   `crecimiento.items[mismo clienteId].seguidoresActuales` del reporte del **mes
   anterior** (`month - 1`, mismo `line_id`, mismo año salvo cruce dic→ene), o si no
   hay mes anterior, `item.seguidoresBase` (valor manual).
3. Si no hay datos suficientes para determinar `ganados` (ni campo explícito ni
   fallback resolvible), ese item **cuenta como "no cumplió" pero SIGUE en el
   denominador** — no se resta del total de items. ⚠️ Esto contradice el comentario
   JSDoc del propio código fuente (`metricsScore.js`, que dice "se omite del total");
   **verificado empíricamente contra datos reales de julio 2026** (ver tabla de
   verificación más abajo): un item con `seguidoresGanados: null` y sin fallback
   posible sigue contando en `items.length`, solo no suma a `cumplieron`. No
   confundir con "se excluye del cálculo".

Un cliente "cumple" si `ganados >= item.meta` (`meta` nulo cuenta como `0`). Luego:

```
crecimiento_score = items.length == 0 ? 0 : (clientes_que_cumplieron / items.length) * 20
```

### Detalle: Solicitudes vs Entregados

```
solicitudes_score = solicitudes == 0 ? 0 : (editadas / solicitudes) * 10
```

Campos: `data.solicitudes.solicitudes` (cantidad pedida), `data.solicitudes.editadas`
(cantidad entregada) — siguen existiendo como la suma de las dos fuentes de abajo, para
que reportes/queries antiguas sigan funcionando igual.

**Desde `SOLICITUDES_MODULE_START` (septiembre 2026) el indicador se deriva
automáticamente de dos tablas, 5 pts cada una:** `cnp_requests` (módulo CNP,
"Contenido No Planificado") y `tasks` (Gestión de Tareas). El desglose vive en
`data.solicitudes.cnp` y `data.solicitudes.tareas`, cada uno `{solicitudes, entregados}`
— "solicitudes" = filas creadas ese mes en esa línea, "entregados" = de esas, las que
llegaron a `status = 'Terminado'`. Si una fuente no tuvo solicitudes ese mes, sus 5 pts
se redistribuyen a la otra en vez de perderse (ver `calcSolicitudes` en
`src/utils/metricsScore.js`). Reportes sin ese desglose (meses anteriores a la era, o
capturados a mano) siguen usando la fórmula original de arriba sobre los dos campos
planos — **Productividad** (`data.productividad.tareas[]`) sigue siendo la única
excepción manual entre los 6 indicadores, salvo para los meses previos a
`TAREAS_FIJAS_MODULE_START`.

### Detalle: Pautas

Igual patrón que Crecimiento pero más simple (sin fallback histórico): por cada
`data.pautas.items[]` (uno por cliente), cumple si `realizadas >= meta`.

```
pautas_score = items.length == 0 ? 0 : (clientes_que_cumplieron / items.length) * 20
```

### Detalle: Piezas

```
piezas_score = piezas == 0 ? 0 : (editadas / piezas) * 10
```

Campos: `data.piezas.piezas` (piezas solicitadas), `data.piezas.editadas` (piezas
entregadas/editadas).

## El flag `incompleto`

`data.incompleto` (boolean, dentro del jsonb, sibling de `reuniones`/`pautas`/etc.) se
marca **manualmente** desde la UI ("Marcar mes como incompleto — no contar en el
promedio anual"). Es una decisión humana, no derivada de los datos.

**Efecto:** un reporte con `data.incompleto = true` (o inexistente, o de un mes
futuro) se trata como **si no existiera** para cualquier cálculo de score, promedio,
ranking o "línea líder del mes":

```sql
-- pseudocódigo del criterio de exclusión, aplicado siempre antes de calcular el score
WHERE NOT (data->>'incompleto')::boolean IS TRUE
  AND (year, month) <= (año_actual, mes_actual)  -- no hay reportes de meses futuros
```

Un mes marcado incompleto **sí sigue existiendo como fila** en `metric_reports`
(no se borra), simplemente se omite de:

- El score/ranking de ese mes.
- El promedio anual de la línea.
- La búsqueda de "último mes cerrado con score" de una línea (se salta al mes anterior
  válido).
- El cálculo de cobertura (ver abajo) — cuenta como "no cargado".

## Rankings y agregados del dashboard

Estas lógicas viven en `src/utils/aggregateMetricsDashboard.js` (frontend, sin
contraparte SQL) y son las que arma la vista "Reportes mensuales · Líneas
operativas". Replicarlas en SQL/razonamiento así:

- **Ranking del mes:** para el mes de referencia (por defecto, el mes actual;
  retrocede automáticamente si ninguna línea tiene reporte válido ese mes), ordenar
  las líneas con score no-nulo por `score DESC`.
- **Línea líder:** la de mayor score en el **mes de referencia** (no el promedio
  anual — así no se premia a una línea con pocos meses cargados sobre una que
  reporta todos los meses).
- **Promedio mes actual:** promedio simple de los scores de todas las líneas que
  tienen reporte válido en el mes de referencia.
- **Promedio anual:** promedio simple de todos los scores línea×mes válidos del año
  (ene–mes actual), sin ponderar por línea.
- **Cobertura:** `reportes_cargados_válidos / (nº_líneas * nº_meses_transcurridos) * 100`.
  Mide qué % de los reportes esperados hasta la fecha realmente se cargaron (excluye
  los `incompleto`).
- **Semáforo de color del score** (usado en el dial/gauge visual, `ScoreDial.jsx`):
  - `score >= 80` → verde (`#10B981`, "bueno")
  - `60 <= score < 80` → ámbar (`#FAB51A`, "medio")
  - `score < 60` → rojo (`#EF4444`, "bajo")

## Finanzas (no forma parte del score)

`data.finanzas = { ingresos[], gastosOperativos[], sueldos[], otrosGastos[] }`, cada
item con `{ monto, clienteId?, ... }`. Se totaliza por separado:

```
totIngresos  = Σ finanzas.ingresos[].monto
totEgresos   = Σ gastosOperativos[].monto + Σ sueldos[].monto + Σ otrosGastos[].monto
diferencia   = totIngresos - totEgresos
```

No influye en el score 0-100; se muestra como KPI financiero aparte (ingresos vs
egresos vs nómina) en la misma vista.

## Diccionario de campos de `metric_reports.data` (jsonb)

```
{
  incompleto: boolean,             // manual, excluye el mes de score/promedio/ranking

  reuniones: {
    realizadas: number,            // reuniones efectivamente realizadas en el mes
    meta: number,                  // objetivo del mes (tope = nº de clientes activos de la línea)
    comentario: string|null,
    justificativos: object         // detalle de reuniones no realizadas, por marca/cliente
  },

  productividad: {
    tareas: [{ nombre: string, realizado: number, meta: number }]
    // tareas fijas/recurrentes de la línea (no confundir con el módulo Tareas)
  },

  crecimiento: {
    items: [{
      clienteId: uuid,             // → metric_clients.id
      seguidoresGanados: number|null,      // modelo actual: preferir este campo
      seguidoresGanadosPrev: number|null,  // informativo
      seguidoresActuales: number|null,     // usado como "base" del mes siguiente en el fallback
      seguidoresBase: number|null,         // fallback manual si no hay mes anterior
      meta: number                 // seguidores a ganar en el mes para "cumplir"
    }]
  },

  solicitudes: { solicitudes: number, editadas: number },  // pedidas vs entregadas

  pautas: {
    items: [{ clienteId: uuid, realizadas: number, meta: number }]
    // "pautas" = piezas/publicaciones pautadas (paid/organic) por cliente
  },

  piezas: { piezas: number, editadas: number },  // piezas de diseño/contenido pedidas vs entregadas

  feedback: {
    items: [{ clienteId: uuid, score: number|null }]
    // satisfacción cualitativa del cliente, 1-5. NO pondera en el score 0-100.
  },

  finanzas: {
    ingresos:         [{ id, clienteId?, descripcion, monto }],
    gastosOperativos: [{ id, clienteId?, descripcion, monto }],
    sueldos:          [{ id, empleadoId, descripcion, monto }],
    otrosGastos:      [{ id, descripcion, monto }]
  }
}
```

Otros términos del dominio:

- **"Línea"** = equipo operativo (`metric_lines`), no una línea de código ni un
  producto. Ej.: "la línea Redes", "el jefe de línea".
- **"Cartera"** = el conjunto de `metric_clients` asignados a una línea
  (`metric_clients.line_id`).
- **"Marca"** = sinónimo informal de cliente (`metric_clients`) usado en la UI.
- **"Mes cerrado"** = mes con `metric_reports.closed_at` no nulo (bloqueado para
  edición, ver arriba); no implica `incompleto`.
- **Pautas vs Ads:** el módulo separado "Ads" (`paid_campaigns`) registra pauta paga
  con métricas de alcance/interacciones — es distinto del campo `pautas` de
  `metric_reports`, que es el cumplimiento de la meta de piezas pautadas por cliente.

## Cómo consultar directamente por SQL (sin recalcular en la cabeza)

No hay vista ni función que devuelva el score ya calculado — hay que traer las filas
crudas y aplicar la fórmula. Patrón recomendado:

```sql
-- 1. Traer los reportes válidos (no incompletos) de una empresa/año, con su mes anterior
--    para poder resolver el fallback de crecimiento si hace falta.
select line_id, year, month, data, closed_at
from metric_reports
where company_id = '<company_id de la empresa a analizar>'
  and year = 2026
  and coalesce((data->>'incompleto')::boolean, false) = false
order by line_id, month;
```

Con esas filas (jsonb `data` por línea×mes), aplicar la fórmula de la sección
"La fórmula del score" — en SQL con expresiones jsonb (`data->'reuniones'->>'meta'`,
etc.) o resolviéndolo en el razonamiento del asistente fila por fila. Para
Crecimiento, si algún item no trae `seguidoresGanados`, buscar el `seguidoresActuales`
del mismo `clienteId` en la fila del mes anterior (`month - 1`, mismo `line_id`) antes
de descartarlo.

Para nombres de línea/cliente, cruzar con `metric_lines` (`id, name, company_id,
is_general`) y `metric_clients` (`id, name, line_id, company_id`, con soft-delete vía
`deleted_at`).

### Query completa (probada) que calcula el score sin arrastrar aritmética a mano

Esta consulta reproduce el score exacto que muestra el dashboard (ver tabla de
verificación abajo). No cubre el fallback de `crecimiento` para reportes históricos
sin `seguidoresGanados` (ese caso hay que resolverlo aparte contra el mes anterior);
para reportes del modelo actual funciona tal cual. Reemplaza `year`/`month`/
`company_id` según el caso.

```sql
with base as (
  select mr.line_id, ml.name as line_name, mr.data
  from metric_reports mr
  join metric_lines ml on ml.id = mr.line_id
  where mr.company_id = '<company_id>'
    and mr.year = 2026 and mr.month = 7
    and coalesce((mr.data->>'incompleto')::boolean, false) = false
),
reuniones as (
  select line_id,
    case when coalesce((data->'reuniones'->>'meta')::numeric,0) = 0 then 0
      else coalesce((data->'reuniones'->>'realizadas')::numeric,0) / (data->'reuniones'->>'meta')::numeric * 20 end as score
  from base
),
productividad as (
  select b.line_id,
    case when sum(coalesce((t->>'meta')::numeric,0)) = 0 then 0
      else sum(coalesce((t->>'realizado')::numeric,0)) / sum((t->>'meta')::numeric) * 20 end as score
  from base b, jsonb_array_elements(b.data->'productividad'->'tareas') t
  group by b.line_id
),
crecimiento as (
  select b.line_id,
    -- OJO: el denominador es count(*) de TODOS los items, incluidos los que no
    -- tienen seguidoresGanados resoluble (ver nota de la sección Crecimiento).
    (count(*) filter (
      where (it->>'seguidoresGanados') is not null
        and (it->>'seguidoresGanados')::numeric >= coalesce((it->>'meta')::numeric,0)
    ))::numeric / count(*) * 20 as score
  from base b, jsonb_array_elements(b.data->'crecimiento'->'items') it
  group by b.line_id
),
-- CAVEAT desde SOLICITUDES_MODULE_START (sept. 2026): esta fórmula (editadas/solicitudes*10
-- sobre los campos planos) es una APROXIMACIÓN cuando existe desglose cnp/tareas — solo
-- coincide exacto con el score real si ambas fuentes tienen la misma proporción
-- entregados/solicitudes. El cálculo exacto pondera 5+5 pts por fuente por separado
-- (ver calcSolicitudes en src/utils/metricsScore.js); para reproducirlo en SQL, sumar
-- (data->'solicitudes'->'cnp'->>'entregados')::numeric / NULLIF((...->>'solicitudes')::numeric,0) * 5
-- + lo mismo para 'tareas', con redistribución de los 5 pts si una fuente está en 0.
solicitudes as (
  select line_id,
    case when coalesce((data->'solicitudes'->>'solicitudes')::numeric,0) = 0 then 0
      else (data->'solicitudes'->>'editadas')::numeric / (data->'solicitudes'->>'solicitudes')::numeric * 10 end as score
  from base
),
pautas as (
  select b.line_id,
    (count(*) filter (
      where coalesce((it->>'realizadas')::numeric,0) >= coalesce((it->>'meta')::numeric,0)
    ))::numeric / count(*) * 20 as score
  from base b, jsonb_array_elements(b.data->'pautas'->'items') it
  group by b.line_id
),
piezas as (
  select line_id,
    case when coalesce((data->'piezas'->>'piezas')::numeric,0) = 0 then 0
      else (data->'piezas'->>'editadas')::numeric / (data->'piezas'->>'piezas')::numeric * 10 end as score
  from base
)
select b.line_name,
  round(least(100, r.score+p.score+c.score+s.score+pa.score+pz.score),1) as score_total
from base b
join reuniones r on r.line_id=b.line_id
join productividad p on p.line_id=b.line_id
join crecimiento c on c.line_id=b.line_id
join solicitudes s on s.line_id=b.line_id
join pautas pa on pa.line_id=b.line_id
join piezas pz on pz.line_id=b.line_id
order by score_total desc;
```

### ⚠️ Errores ya observados en producción — no repetirlos

Un análisis anterior sin este skill (o ignorándolo) le dio a un usuario un score
**incorrecto** ("Team Sabrina 95.5/100" en vez de 94.5, y peor aún para otras líneas —
ver checkpoint de verificación abajo). Los errores concretos que hay que evitar:

1. **No promediar el % de cumplimiento por tarea/cliente cuando la categoría suma
   numerador y denominador globalmente.** Reuniones y Productividad se calculan como
   `Σrealizado / Σmeta` (una sola división agregada), **no** como el promedio de
   `realizado/meta` de cada tarea individual capado en 100%. La diferencia es grande
   cuando una tarea tiene una meta mucho mayor que las demás (p. ej. "Actualización de
   Plataformas" con meta 204 vs. metas de 14-56 en las demás tareas): promediar
   diluye un mal resultado ahí; sumar antes de dividir lo refleja con su peso real.
2. **No usar 4 categorías con igual peso.** Son **6 categorías con pesos distintos**
   (20/20/20/10/20/10) — omitir Solicitudes o Piezas, o pesarlas igual que las demás,
   da un número que no corresponde al dashboard.
3. **No promediar el % de cumplimiento de Crecimiento/Pautas.** Es el **% de clientes
   que llegaron a su meta individual** (conteo binario cumple/no cumple por cliente),
   no el promedio de cuánto se acercó cada cliente a su meta.
4. **No confundir la tarea `productividad.tareas[].nombre = "Métricas"` con el
   indicador `reuniones`.** Son cosas distintas que suelen rondar valores parecidos
   (~100% de cumplimiento) y es fácil mezclarlas al armar una tabla a mano.
5. **Si `feedback.score` está vacío para todo un mes, eso NO significa que no hay
   score.** El score 0-100 nunca depende de `feedback` — no hace falta preguntar al
   usuario "¿te refieres al feedback o al cumplimiento de metas?"; el score de líneas
   siempre es la fórmula de 6 categorías de esta guía.

### ✅ Checkpoint de verificación (datos reales, julio 2026)

Estos valores fueron recalculados con la query de arriba contra `metric_reports` real
y coinciden exactamente con lo que muestra el dashboard (`Ranking · Julio 2026`).
Úsalos para autoverificar la fórmula: si tu cálculo para estas líneas/mes no da estos
números, hay un error en la aplicación de la fórmula, no en los datos.

| Línea          | Reuniones | Productividad | Crecimiento | Solicitudes | Pautas | Piezas |   **Total** |
| -------------- | --------: | ------------: | ----------: | ----------: | -----: | -----: | ----------: |
| Team Sabrina   |     20.00 |         19.51 |       16.25 |       10.00 |  18.75 |  10.00 | **94.5** 🏆 |
| Team Georgina  |     20.00 |         16.63 |        8.00 |       10.00 |  20.00 |  10.00 |    **84.6** |
| Team Daniellys |     18.00 |         16.66 |       10.77 |       10.00 |  16.92 |   8.82 |    **81.2** |
| Team Bianca    |     20.00 |          9.36 |       10.00 |       10.00 |  15.71 |  10.00 |    **75.1** |

Promedio del mes: 83.85 ≈ 83.8 (coincide con el KPI "Mes actual" del dashboard).
Línea líder: **Team Sabrina**. Nota cómo la Productividad de Team Bianca (9.36/20,
~47%) es mucho más baja de lo que daría un promedio ingenuo de sus 5 tareas — ahí es
donde el error de metodología del punto 1 se nota más.

---

## Otros módulos: cómo interpretar sus datos crudos

Lo que sigue no forma parte del score 0-100 de Métricas, pero es igual de fácil de
malinterpretar sin acceso al código. Cubre las tablas que probablemente aparezcan en
preguntas del chat sobre este dashboard.

### Tareas (`tasks`)

- **Status** (5 valores, título-caso español, string libre sin CHECK): `"Pendiente"`,
  `"En proceso"`, `"Por revisar"`, `"Paralizado"`, `"Terminado"`. Es **siempre
  manual** — no hay derivación automática desde el `checklist`.
- **`assignee_ids` (text[])** es el campo vigente (múltiples responsables).
  **`assignee_id` (singular) está DEPRECATED** — no usarlo para contar/filtrar
  responsables, puede estar vacío en tareas nuevas.
- **`checklist` (jsonb, default `[]`)**: array de `{ id, title, assignee_id, due_date,
done }`. Es informativo/de seguimiento — **no cambia `status`**; el chip "N/M
  hechos" en la UI es solo un resumen visual del array.
- **`blocked_reason`**: motivo de texto libre cuando `status = 'Paralizado'`.
- **`team_id`** apunta a `metric_lines.id` **por convención, sin FK formal** (las
  tablas legacy `teams`/`team_members` están inertes desde la migración
  `20260627000000` — no las uses).
- El grupo "Independientes" (`metric_lines.is_general = true`) agrupa tareas de
  empleados sin línea asignada (dirección, IT, administración) — normalmente se
  excluye de reportes por línea; inclúyelo solo si preguntan explícitamente por
  empleados sin línea.

### Evaluaciones (desempeño) — score 1-5, sistema separado del score 0-100 de Métricas

**No confundir con el score de Métricas.** Este es un score de **desempeño individual
por empleado**, escala 1-5, calculado por sesión de evaluación (un manager evaluando a
un empleado en un período = el mes anterior al actual).

- **Tablas:** `evaluation_sessions` (`id, manager_id, employee_id, period` — fecha,
  primer día del mes evaluado, siempre el mes **anterior** al actual —
  `, total_score, created_at`), `evaluation_responses` (`evaluation_id, question_id,
response` int 1-5), `evaluation_comments`, `questions`/`question_positions`
  (preguntas asignadas por cargo).
- **Fórmula de `total_score`:** `(Σ response de todas las preguntas / (n_preguntas *
5)) * 5` — es decir, el promedio de las respuestas 1-5, no una suma cruda. Rango
  0-5.
- **Ya hay una vista y un RPC que lo calculan — úsalos en vez de recalcular a mano:**
  - Vista `employee_evaluation_summary_last_month` — resumen del mes cerrado más
    reciente por empleado. `select * from employee_evaluation_summary_last_month
where company_id = '<company_id>'`.
  - RPC `summary(period_param)` — resumen para un período arbitrario:
    `select * from summary('<year>-<month>-01')`.
- Etiqueta cualitativa del score (frontend, `src/utils/scoreScale.js`):
  `<=1` Deficiente · `<=2` Irregular · `<=3` Aceptable · `<4.5` Bueno · `>=4.5`
  Excelente.
- No hay `incompleto` ni concepto de exclusión aquí — cada sesión es un evento
  puntual, no un reporte periódico como en Métricas.

### Tickets (`support_tickets`, `ticket_comments`)

- **Status** (3 valores): `abierto` · `en_progreso` · `resuelto`.
- **Priority** (4 valores) con SLA en horas: `urgente` (4h) · `alta` (12h) · `media`
  (24h) · `baja` (48h). "Vencido"/"Por vencer"/"A tiempo" se calculan comparando
  `created_at + SLA_HOURS[priority]` contra ahora — no es un campo almacenado.
- **Category** (5 valores): `hardware` · `software` · `red` · `accesos` · `otro`.
- **`department_id = 0`** es la convención para identificar al rol/departamento IT
  (no hay un flag booleano separado) — usado para gatear analíticas/notificaciones de
  Tickets, no una capability config-driven como el resto del sistema de permisos.

### Ads / Campañas (`campaigns`, `paid_campaigns`)

Dos tablas para dos cosas distintas — no las mezcles en un mismo conteo:

- **`campaigns`** = tácticas **orgánicas** (sin inversión). Campos: `client_id,
assignee, priority, status, notes, checklist jsonb, start_date, end_date`.
- **`paid_campaigns`** = pauta **pagada** (Ads). ⚠️ **el nombre de tabla NO es
  `ads`** — se renombró (`20260715000000_rename_ads_to_paid_campaigns.sql`) porque
  ad-blockers bloqueaban peticiones REST con `/ads` en la URL. Campos: `client_id,
amount` (inversión), `responsable_id` (texto, sin FK — resolver contra `users`
  manualmente), `reach, interactions, followers, impressions, views, profile_visits`
  (los 6 "resultados", todos `integer` **nullable** — solo se llenan los que el
  usuario eligió capturar al marcar `Finalizado`; el resto queda `null`, **no** en
  0 — no interpretar `null` como "cero resultados", es "no capturado").
- **`status`** (ambas tablas, columna `text` libre sin CHECK): valores
  seleccionables `Pendiente` · `En Curso` · `Finalizado`. `Descartado` es **legacy**
  (puede aparecer en filas viejas, ya no se puede asignar).
- **`duracion` no se almacena** — se deriva en JS de `end_date - start_date`; si se
  necesita en SQL, calcularlo igual (`end_date - start_date`).
- **`paid_campaigns.results_pending = true`**: un cron diario marca `Finalizado`
  automáticamente las campañas vencidas por fecha, pero no puede pedir resultados —
  este flag indica que a esa fila le faltan cargar los 6 indicadores.
- **Presupuesto:** `metric_clients.campaign_budget` (USD/mes) — **visible a todos los
  niveles, no es un campo financiero gateado** (a diferencia de `monthly_fee`/
  `monthly_salary`). Comparar contra `Σ paid_campaigns.amount` del cliente en el mes
  para ver sobregasto; no hay un campo `over_budget` almacenado, es un cálculo.

### Reuniones (`meetings`)

- **`status`** (3 valores): `programada` (default) · `realizada` (marcado manual, no
  automático) · `cancelada` (no se borra el registro). No hay marcado automático por
  fecha vencida — una reunión pasada que nadie marcó sigue en `programada` para
  siempre (la UI la muestra con alerta visual, pero el dato no cambia solo).
- **`line_id`/`client_name` son un snapshot** tomado al crear/editar la reunión, no
  una referencia viva: si el cliente cambia de línea después, la reunión **conserva**
  la línea de cuando se agendó (para no falsear reportes de meses ya cerrados). No
  asumas que `meetings.line_id` siempre coincide con `metric_clients.line_id` actual
  del mismo `client_id`.
- Alimenta `metric_reports.data.reuniones.realizadas` — ver la nota de staleness en
  la sección Métricas más arriba (§ Detalle: Reuniones).

### Leads (`leads`) — ⚠️ tabla global, sin `company_id`

- A diferencia de prácticamente cualquier otra tabla de negocio, `leads` **no tiene
  columna `company_id`** — es una tabla global que preexistía (alimentada por el
  formulario de contacto de la web) y no está aislada por empresa. Si el usuario pide
  "los leads de mi empresa", no hay forma de filtrar por SQL con `company_id`; hay
  que aclarar la limitación en vez de inventar un filtro que no existe.
- **`status`**: `pendiente` (default al crear) · `contactado` · `cancelado`.

### `metric_clients` / `users` — soft delete (aplica en casi todo el dashboard)

- **Soft delete universal:** `deleted_at IS NULL` = activo, con valor = archivado.
  Los registros **nunca se borran** (se preserva el historial en tareas, reportes,
  campañas, evaluaciones). Al contar "clientes activos" o "empleados activos" en
  cualquier consulta, filtrar siempre `deleted_at is null` salvo que pidan
  explícitamente históricos/archivados.
- **`metric_clients.contract_end`** tiene prioridad sobre `deleted_at` para saber si
  un cliente "cuenta" en un mes dado: el mes que contiene `contract_end` cuenta
  completo, desde el siguiente ya no aparece.
- **`metric_clients.baja_incluye_mes`** (default `true`) decide si el mes en que se
  archivó un cliente todavía cuenta en los reportes de ese mes (`true`) o se excluye
  también ese mes (`false`) — no afecta meses anteriores a la baja, que siempre
  cuentan.
- **`users.on_probation`** (boolean): empleado en período de prueba — no afecta
  ninguna lógica de negocio salvo la UI de RRHH (chip informativo).
