# Asistente IA "MAPPI" (chat flotante)

## Resumen
Chat flotante en todas las pantallas para que un admin pregunte en lenguaje natural cómo va la empresa: score/ranking de línea, tareas, reuniones, pautas AV, directorio de personal, clientes/cuentas (equipo, datos comerciales, ads), tickets, leads, CNP, Chequeo de publicación y desempeño agregado. Incluye el recuadro "Recomendaciones" del Home (carga AV, ver abajo).

## Rutas y archivos
- `POST /api/ai-chat` → `/.netlify/functions/ai-chat`, header `Authorization: Bearer <session.access_token>`.
- `netlify/functions/ai-chat.js`: handler; loop de function calling contra OpenRouter (modelo `openrouter/free`); inyecta la fecha de hoy en el system prompt en cada request; setea `dataset.callerUserId = caller.user_id` (para `consultar_reuniones({persona: "yo"})`); clasifica `outcome` y lo registra con `logChatInteraction` sin bloquear si el log falla.
- `netlify/functions/_lib/aiChatTools.js` (puro): declaraciones de las 17 tools + `executeTool`. Las tools por entidad reutilizan helpers viejos (siguen exportados) y `src/utils/metricsScore.js`, `metricsFinance.js`, `aggregateMetricsDashboard.js`, `src/components/tareas/constants.js`.
- `netlify/functions/_lib/aiChatData.js`: carga el dataset una vez por request, filtrado por `company_id`.
- `netlify/functions/_lib/aiChatLog.js`: `logChatInteraction` → insert en `mappi_chat_logs` (service-role, nunca lanza).
- `_lib/requireAdmin.js`: gate backend `requireAdmin`.
- Front: `src/components/ai/AiChatWidget.jsx` (FAB + gate admin), `AiChatPanel.jsx`, `AiChatMessage.jsx`, `AiAvatar.jsx`, `TypingDots.jsx`; `src/hooks/useAiChat.js`; `src/lib/aiChatHistory.js`.
- Estado del chat en contexto: `src/context/AiChatContext.jsx` (`AiChatProvider`/`useAiChatContext`), montado en `AppLayout.jsx` por encima de `AiChatWidget` y del `<Outlet />`.
- Panel de huecos: **Empresa → MAPPI** (`src/components/empresa/MappiLogsView.jsx`).

## Datos
- Dataset (`aiChatData.js`): `metric_lines`, `metric_reports`, `tasks` (con `client_id`), `users` (**sin** `monthly_salary`), `meetings`, `av_pautas`, `positions`, `departments`, `metric_clients`, `metric_line_members`, `paid_campaigns`, `support_tickets`, `leads` (sin `company_id`: tabla completa), `vacations`, `cnp_requests`, `publication_checks`, `av_pauta_piezas`, `task_comments`, `employee_evaluation_summary` (vista sin `company_id`: se filtra en memoria contra `users` ya scopeado).
- Nunca se cargan: `users.monthly_salary`, `metric_client_private`.
- `mappi_chat_logs`: una fila por request con `outcome`: `respondida`, `sin_cobertura` (llamó `no_puedo_responder`), `error` (alguna tool devolvió `{error}`), `timeout` (agotó `MAX_TOOL_ITERATIONS`/`TOTAL_TIME_BUDGET_MS`). `MappiLogsView` lista `outcome != 'respondida'` agrupadas por frecuencia.
- Historial: solo estado React (sin localStorage), se pierde al recargar; cap 20 mensajes. `mappi_chat_logs` es aparte (medir huecos, no reconstruir chats).

## Tools (17, formato OpenAI vía OpenRouter, sobre dataset en memoria; nunca SQL)
- Métricas: `listar_lineas`, `score_de_linea`, `ranking_lineas`, `evolucion_linea`, `finanzas`, `comparar_meses`.
- Por entidad con filtros:
  - `consultar_tareas` (linea/persona/cliente/estado/criticidad/desde/hasta/detalle → panorama, listado crítico o plano).
  - `consultar_reuniones` (`persona: "yo"` = listado del usuario actual; sin persona = agregado).
  - `consultar_pautas` (agenda de un día, agregado de período, o `agrupar_por: "dia"/"persona"/"cliente"`; "dia" cubre "días de carga alta").
  - `consultar_personal` (nombre, cargo, departamento, línea, vacaciones, ingreso).
  - `consultar_clientes` (ficha, cartera de una línea, o inversión ads con `incluir_ads`).
- `consultar_tickets`, `consultar_leads`, `consultar_cnp`, `consultar_chequeo`.
- `desempeno_agregado`: promedio por departamento/línea/cargo, **nunca** individual; rechaza grupos < 3.
- `no_puedo_responder`: el modelo debe llamarla cuando ninguna tool cubre la pregunta (queda registrado como `sin_cobertura`).

## Permisos y seguridad
- Gate doble: `AiChatWidget` no se monta si `userProfile.admin !== true`; backend repite con `requireAdmin`.
- Cliente `service-role` en `aiChatData.js`/`aiChatLog.js` (bypassa RLS): cada `select`/`insert` filtra/setea `company_id` a mano.
- `OPENROUTER_API_KEY` solo en backend.
- RLS `mappi_chat_logs`: lectura solo admins de la misma empresa; sin policy de insert para `authenticated` (solo escribe service-role).

## Reglas de negocio
- `finanzas` devuelve solo ingresos/egresos/diferencia tal cual en `metric_reports`; `incluir_ads` solo montos de `paid_campaigns` tal cual. `SYSTEM_INSTRUCTION` prohíbe extrapolar (rentabilidad, proyecciones, sueldos).
- Datos sensibles excluidos en código, no solo en prompt.

## Recomendaciones (carga AV en el Home)
- Recuadro "Recomendaciones" (avatar MAPPI + burbuja blanca, debajo del panel de bienvenida, solo `userProfile.admin === true`).
- Señala personas de Audiovisual (`users.department_id = 2`, activas) con **≥3 pautas en un mismo día** en ventana **hoy ±3 días**. Pasado: solo `av_pautas.status = 'realizada'`; futuro: `'realizada'` o `'programada'`. Cuenta solo `av_pautas.recurso_ids` (quién graba); se descartan ids `ext:<uuid>` de `external_resources`.
- No es alerta de mal desempeño: es para que César hable con la persona.
- Detección determinística: `netlify/functions/_lib/avWorkloadSnapshot.js` (`buildAvWorkloadSnapshot`, pura) agrupa `(persona, fecha)` → `sobrecargas`. El conteo NUNCA lo hace el modelo. Cada pauta de `sobrecargas[].pautas` lleva `estado` (`'realizada'`/`'programada'`); `SYSTEM_INSTRUCTION` exige pasado solo para `realizada`.
- Función `netlify/functions/av-workload-insight.js`: `POST /api/av-workload-insight` → `/.netlify/functions/av-workload-insight`, gate `requireAdmin` (no el allowlist de `ceo-analysis.js`). Caché diaria como `ceo-analysis.js`: tabla `av_workload_insight`, TTL 24h, `body.refresh` fuerza regeneración. Usa OpenRouter `openrouter/free` (no Gemini). Carga `av_pautas` recortado por SQL (`.gte`/`.lte` sobre `pauta_date`) y `users` de la empresa.
- Atajo sin IA: si `sobrecargas` vacío (lo usual), no llama a OpenRouter; cachea mensaje fijo "todo tranquilo".
- Fechas: el modelo debe escribir `dd/mm/aaaa`; `netlify/functions/_lib/dateFormat.js` (`normalizeDatesToDDMMYYYY`) normaliza `YYYY-MM-DD` y `dd-mm-aaaa` tras parsear el JSON (`resumen`/`detalle`/`sugerencia`) y también en el `reply` de `ai-chat.js`.
- UI: `src/components/home/RecomendacionesCard.jsx` (fetch autenticado, patrón de `CeoAnalysisCard.jsx`). Botón **"Preguntarle a MAPPI sobre esto"** → `openWithContext(buildChatSeed(insight))` (`src/lib/avWorkloadSeed.js`): abre el chat con el hallazgo sembrado como mensaje `assistant`, sin enviarlo al backend.
- `useAiChat.js` expone `seed(text)`: reemplaza el historial por un único `assistant` truncado a `MAX_MESSAGE_LENGTH`.

## Gotchas
- `openrouter/free` alucina nombres/cifras y no respeta formatos: por eso conteos y fechas se resuelven en código.
- `trimHistory` (`src/lib/aiChatHistory.js`) NO descarta un `assistant` inicial si el array cabe sin recorte (mensaje sembrado); solo lo descarta si el recorte por `MAX_MESSAGES` deja un huérfano real.
- `leads` y `employee_evaluation_summary` no tienen `company_id`: ojo al scoping.

## Conexiones
- Home (`RecomendacionesCard`), Empresa (`MappiLogsView`), métricas (`metricsScore`/`metricsFinance`), tareas, reuniones, pautas AV, CNP, Chequeo, tickets, leads.
