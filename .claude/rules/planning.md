# Regla: Razonamiento del plan

Cada vez que presentes un plan antes de escribir código, incluye al final una sección
`## Razonamiento del plan` que, SOLO para las decisiones no triviales (elección de
patrón, arquitectura, estructura de datos, flujo de estado, o cualquier enfoque que no
sea obvio), responda de forma breve:

- **Por qué este enfoque y no otro:** la alternativa principal que descartaste y el
  motivo concreto.
- **Cuál sería la forma ingenua/directa** de hacerlo y por qué NO la elegiste (qué
  problema causa: rendimiento, mantenibilidad, bugs, escalabilidad…).
- **Qué problema resuelve el patrón que propones** (en una frase, sin jerga
  innecesaria).

## Reglas para esta sección

- No expliques el boilerplate, la configuración estándar ni el código commodity. Solo
  lo que el desarrollador tendría que entender para poder mantener y defender la app.
- Si dudas entre dos enfoques válidos, explica ambos con sus trade-offs y deja que el
  desarrollador elija en lugar de decidir por él.
- Sé conciso: 2-4 frases por decisión como máximo. El objetivo es que se entienda el
  "por qué", no escribir un ensayo.
- Si todas las decisiones del plan son obvias o commodity (instalar un paquete, añadir
  un campo a un formulario existente, etc.), omite la sección por completo en lugar de
  rellenarla con texto vacío.
