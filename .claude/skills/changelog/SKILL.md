---
name: changelog
description: Cómo registrar un fix o feature en el changelog de Novedades de MAPPI (src/data/changelog.js) y cómo publicar una versión. Usar al terminar cualquier fix o feature, al integrar resultados de agentes, o cuando el usuario pida "haz un release" / "publica la versión".
---

# Changelog de Novedades

Al iniciar sesión, el dashboard muestra **una sola vez** el modal "Novedades" con las versiones que
el usuario no ha visto (persistencia en `localStorage`, clave `mdn_whatsnew_seen_version`).
Código: `src/lib/whatsNew.js` (lógica), `src/hooks/useWhatsNew.js`, `src/components/WhatsNewModal.jsx`,
datos en `src/data/changelog.js`.

## Redacción

Lenguaje **sencillo para usuarios finales**, en español, sin jerga técnica:
"Corregido el filtro de fechas en Reportes", no "fix del state del date range picker".
Fixes empiezan con "Corregido: …". Explica qué cambia para quien usa la plataforma.

## Al terminar un fix o feature (regla determinística)

1. Lee `CHANGELOG[0]`.
2. **Sin `date`** (en desarrollo) → agrega la descripción a `CHANGELOG[0].changes` y detente.
   No crees entradas, no cambies `version` ni `date`, no reordenes.
3. **Con `date`** (caso raro) → crea UNA entrada nueva arriba: `version` = siguiente semver
   (feature → minor, fix → patch), sin `date`, `title` corto, `changes: [descripción]`.

**Nunca:** una entrada por cambio, editar una entrada publicada, ni abrir versión nueva si
`CHANGELOG[0]` ya está en desarrollo.

## Trabajo en paralelo (agentes en worktrees)

Los agentes `implementador` lanzados por `/cambios` o `/tareas-mappi` **no editan** este archivo
(dos ramas tocando `CHANGELOG[0].changes` siempre chocan). Devuelven el texto en el campo
`changelog` de su JSON. El orquestador, tras mergear/rebasear, agrega todos los ítems de una vez
en un commit propio (`chore: changelog`) en cada rama o en la rama de integración.

## Publicación (release)

Solo cuando el usuario lo pida explícitamente ("haz un release", "publica la versión"):

1. Asignar `date` (hoy) a la entrada en desarrollo; ajustar `title` si hace falta.
2. Crear arriba una entrada nueva **sin `date`** con el siguiente semver.
3. Desplegar.

Ante cualquier duda, NO publicar: preguntar.
