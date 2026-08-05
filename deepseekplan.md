# Plan: Modal "Novedades" (What's New) por versión

## Context

Cuando se despliega una nueva versión del dashboard de MDN, los usuarios no se enteran de
qué cambió. Queremos que, al entrar, vean **una sola vez** un modal con la lista de cambios
de las versiones que aún no han visto. Una vez cerrado, no debe volver a aparecer para esa
versión. La "marca de visto" se guarda en `localStorage` del navegador (sin backend).

Decisiones de producto confirmadas:

- **Alcance:** mostrar **todas las versiones no vistas** desde la última que el usuario vio
  (agrupadas en un mismo modal), no solo la última.
- **Usuarios nuevos:** en el **primer login** NO se muestra el changelog; se marca la versión
  actual como vista silenciosamente. Solo verán modales de actualizaciones **futuras**.
- **Persistencia:** `localStorage` por navegador (patrón ya usado en el proyecto).

## Dónde encaja (hallazgos de exploración)

- **Punto de montaje:** `src/components/AppLayout.jsx`, junto a los modales globales
  existentes (`ProjectDetailModal`, `ProjectModal`) y `InstallBanner`, cerca de la línea 161.
  Se renderiza en todas las rutas autenticadas y solo tras login (está bajo `ProtectedRoute`).
- **Patrón de modal a imitar:** `src/components/ProjectModal.jsx`
  - Backdrop: `fixed inset-0 bg-black/25 backdrop-blur-[3px] flex items-center justify-center z-50 p-4`
  - Card: `bg-white rounded-2xl border border-[#e8e5db] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl`
  - Secciones flex: header (`px-6 py-5 border-b border-[#eeebe0]`), body scrollable
    (`overflow-y-auto flex-1 px-6 py-5`), footer (`px-6 py-4 border-t border-[#eeebe0]`).
  - Botón X arriba a la derecha (SVG inline) y listener de tecla **Escape** para cerrar.
  - Botón primario: `bg-[#0d0d0d] text-white rounded-xl font-bold`. Acento marca `#FFB800`.
- **Patrón localStorage a imitar:** `src/components/empresa/EmployeesView.jsx` (líneas ~257-272),
  lectura/escritura envueltas en `try/catch` (soporta modo privado).
- **Auth:** `useAuth()` de `src/context/AuthContext.jsx` expone `userProfile`. Se puede usar
  `userProfile.user_id` para hacer la clave de storage por-usuario dentro del mismo navegador.
- **Versión:** `package.json` tiene `"version": "1.0.0"`. No usaremos este campo como fuente:
  la fuente de verdad será el propio archivo de changelog (ver abajo), más fácil de mantener.

## Diseño

### 1. Datos del changelog — `src/data/changelog.js`

Archivo estático versionado en el repo (se despliega con la app). Array **ordenado de más
nuevo a más viejo**. Cada release el desarrollador agrega una entrada arriba:

```js
// src/data/changelog.js
// Novedades mostradas en el modal "Novedades". Agregar la versión nueva ARRIBA.
// `version` debe ser un semver comparable. `date` es solo informativo (string libre).
export const CHANGELOG = [
  {
    version: '1.1.0',
    date: '2026-08-05',
    title: 'Reportes por línea',
    changes: [
      'Nuevo desglose de métricas por línea de negocio.',
      'Se unificó el mes de referencia en el dashboard.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-01',
    title: 'Lanzamiento',
    changes: ['Primera versión del sistema.'],
  },
]

export const LATEST_VERSION = CHANGELOG[0]?.version ?? '0.0.0'
```

### 2. Lógica de comparación de versiones — `src/lib/whatsNew.js`

Módulo puro y testeable. Responsable de:

- `compareSemver(a, b)` — compara dos semver `x.y.z` (devuelve -1/0/1).
- `getUnseenEntries(seenVersion)` — dado el `seenVersion` guardado, devuelve las entradas del
  `CHANGELOG` con `version` **mayor** a `seenVersion`. Si `seenVersion` es `null`, devuelve `[]`
  (usuario nuevo: no mostrar) — pero el llamador igual debe marcar como visto (ver flujo).
- Claves de storage: `STORAGE_KEY = 'mdn_whatsnew_seen_version'`, con helpers
  `readSeenVersion()` / `writeSeenVersion(v)` envueltos en `try/catch`.

**Por qué un módulo aparte:** la comparación de versiones y la decisión "qué mostrar" es
lógica pura fácil de romper; aislarla permite tests unitarios sin renderizar React, en línea
con `QA_BLINDAJE` del repo.

### 3. Componente — `src/components/WhatsNewModal.jsx`

- Recibe `entries` (array de versiones no vistas) y `onClose`.
- Si `entries.length === 0`, retorna `null`.
- Renderiza el backdrop + card imitando `ProjectModal`:
  - Header: título "Novedades" + subtítulo tipo "Esto es lo nuevo desde tu última visita".
  - Body: por cada entrada, versión + fecha + título y una lista `<ul>` de `changes`.
  - Footer: botón primario "Entendido" que llama `onClose`.
- Escape + click en backdrop cierran (llaman `onClose`).
- Accesible: `role="dialog"`, `aria-modal`, foco inicial en el botón.

### 4. Orquestación — hook `useWhatsNew()` montado en `AppLayout.jsx`

Encapsular el estado en un hook `src/hooks/useWhatsNew.js` (mantiene `AppLayout` limpio):

```
al montar (usuario ya logueado):
  seen = readSeenVersion()
  if (seen === null) {
     // primer login en este navegador → NO mostrar, marcar como visto
     writeSeenVersion(LATEST_VERSION)
     entries = []
  } else {
     entries = getUnseenEntries(seen)   // versiones > seen
  }
  setEntries(entries)

onClose():
  writeSeenVersion(LATEST_VERSION)   // marca todo lo actual como visto
  setEntries([])
```

En `AppLayout.jsx` (cerca de la línea 161, junto a `<InstallBanner />`):

```jsx
const { entries, dismiss } = useWhatsNew()
...
<WhatsNewModal entries={entries} onClose={dismiss} />
```

**Nota sobre clave por-usuario:** recomendado usar **clave global por navegador** (más simple;
el caso "varios usuarios en un mismo navegador" es raro en esta app). Mantener el `user_id`
(`mdn_whatsnew_seen_version:<user_id>`) como mejora opcional documentada.

## Archivos a crear/modificar

| Acción    | Archivo                                                                |
| --------- | ---------------------------------------------------------------------- |
| Crear     | `src/data/changelog.js` — lista de versiones y cambios                 |
| Crear     | `src/lib/whatsNew.js` — comparación semver + lectura/escritura storage |
| Crear     | `src/hooks/useWhatsNew.js` — orquesta estado del modal                 |
| Crear     | `src/components/WhatsNewModal.jsx` — UI del modal                      |
| Modificar | `src/components/AppLayout.jsx` — montar el modal (~línea 161)          |
| Crear     | `src/test/whatsNew.test.js` — tests de la lógica pura                  |
| Crear     | `src/test/WhatsNewModal.test.jsx` — tests de render/cierre             |

## Tests (obligatorio antes de dar por completo)

`src/test/whatsNew.test.js` (lógica pura — sin React):

- `compareSemver`: '1.1.0' > '1.0.0', igual, y menor.
- `getUnseenEntries`: con `seen='1.0.0'` y CHANGELOG con '1.1.0' → devuelve solo '1.1.0'.
- `getUnseenEntries` con `seen` = versión más nueva → devuelve `[]`.
- `readSeenVersion`/`writeSeenVersion`: round-trip y que un `localStorage` que lanza excepción
  (mock que hace throw) no rompe (try/catch).

`src/test/WhatsNewModal.test.jsx` (React Testing Library):

- Con `entries=[]` no renderiza nada.
- Con entradas, muestra los títulos y los items de `changes`.
- Click en "Entendido" / Escape llama `onClose`.
- Integración del hook: primer login (localStorage vacío) → no muestra modal y escribe
  `LATEST_VERSION`; segunda "visita" con versión vieja guardada → muestra las no vistas.

Estrategia de ejecución (según CLAUDE.md): durante la iteración correr solo
`npx vitest run src/test/whatsNew.test.js src/test/WhatsNewModal.test.jsx`; al final una única
corrida de `npm test`.

## Verificación end-to-end (manual)

1. `npm run dev`, login.
2. Con `localStorage` limpio → NO aparece el modal (usuario nuevo); en DevTools verificar que
   se escribió `mdn_whatsnew_seen_version = <LATEST_VERSION>`.
3. En DevTools, poner `localStorage.mdn_whatsnew_seen_version = '1.0.0'` y recargar → aparece el
   modal con las novedades de '1.1.0'. Cerrar → recargar → ya no aparece.
4. Agregar una entrada '1.2.0' a `changelog.js`, recargar → vuelve a aparecer con solo '1.2.0'.

## Mantenimiento (cómo se usa a futuro)

Para anunciar una nueva versión: **agregar una entrada arriba en `src/data/changelog.js`** con
`version`, `date`, `title` y `changes`, y desplegar. No hace falta tocar nada más; el modal
aparecerá una vez a cada usuario que tenga guardada una versión anterior.

## Razonamiento del plan

- **Lista de features en archivo estático (`changelog.js`) vs. base de datos:** la forma
  ingenua sería una tabla en Supabase para editar novedades sin deploy. Se descartó porque el
  changelog cambia exactamente cuando se despliega código nuevo, así que versionarlo junto al
  código es más simple, no requiere migración ni RLS, y evita un estado que puede desincronizarse
  con la versión realmente desplegada.
- **Guardar "última versión vista" vs. un flag booleano por versión:** guardar un único string
  con la última versión vista (y mostrar todo lo mayor a ella) cubre gratis el caso "usuario
  atrasado varias versiones" con una sola clave, en vez de acumular N flags `seen_1.1.0`,
  `seen_1.2.0`… que habría que limpiar.
- **Lógica de versiones en módulo puro aparte del componente:** permite testear la comparación
  semver y la selección de entradas sin montar React, alineado con la práctica de tests del repo.
