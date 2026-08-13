# Cómo conectar Claude con la base de datos de MDN

Esta guía te permite hacer preguntas a Claude sobre cualquier dato del dashboard (proyectos,
tareas, métricas, evaluaciones, etc.) sin exportar nada manualmente. Funciona igual en
**computadora e iPhone/iPad** — no hay nada que instalar.

---

## Lo que necesitas

- Una cuenta de Claude con plan **de pago** (Pro, Max, Team o Enterprise). Con el plan gratis no se
  pueden agregar conectores personalizados.
- La contraseña de acceso que te da el administrador (se pide al autorizar, no va en la URL).

---

## Paso 1 — Agregar el conector en Claude

**En computadora (Claude Desktop o claude.ai):**

1. Ve a **Settings → Connectors**.
2. Haz clic en **Add custom connector**.
3. Pega esta URL (es pública, no lleva ningún token):
   ```
   https://mdngestion.netlify.app/mcp
   ```
4. Guarda. Claude abre una pantalla pidiendo una contraseña — ingresa la que te dio el
   administrador y autoriza el acceso.

**En iPhone (app de Claude):**

1. Abre la app → **Settings → Connectors**.
2. **Add custom connector** → pega la misma URL.
3. Ingresa la contraseña cuando se pida y autoriza.

No hace falta reiniciar nada ni instalar Node — el conector queda disponible de inmediato en un
chat nuevo.

---

## Paso 2 — Verificar que funciona

En un chat nuevo, escribe por ejemplo:

> "¿Cuántas tareas hay por línea de negocio?"

Claude debería consultar la base de datos y responderte con datos reales y actuales.

---

## Preguntas de ejemplo que puedes hacerle a Claude

- ¿Qué proyectos están pendientes?
- ¿Cuáles proyectos tiene asignados Redes?
- Lista las tablas disponibles en la base de datos
- ¿Cuántos proyectos están completados este mes?
- Dame un resumen de las evaluaciones del último período

---

## Importante sobre la contraseña

No la compartas por canales públicos ni la publiques en ningún lado. Solo permite **leer** datos —
nunca modificar ni borrar nada — pero cualquiera que la tenga puede consultar toda la base de
datos.

---

## ¿Algo no funciona?

Avísale al administrador e indica qué paso falló.
