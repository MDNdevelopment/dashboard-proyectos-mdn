/**
 * Agrega sesiones de evaluación por persona, uniendo el rol de empleado
 * (evaluado) y el de manager (evaluador) en una sola entrada por user_id.
 *
 * @param {Array} sessions - Filas de evaluation_sessions con los embeds:
 *   {
 *     total_score: number,
 *     employee: { user_id, first_name, last_name, email,
 *                 position: { position_name } | null } | null,
 *     manager:  { user_id, first_name, last_name, email,
 *                 position: { position_name } | null } | null,
 *   }
 * @returns {Array} Array plano ordenado por avg_score desc (nulos al final):
 *   { user_id, first_name, last_name, email, position_name,
 *     received_count, made_count, avg_score }
 */
export function aggregateEvaluationSummary(sessions) {
  if (!sessions || sessions.length === 0) return [];

  const map = new Map();

  // Crea o recupera la entrada para un usuario; ignora si user es nulo
  function ensure(user) {
    if (!user) return null;
    const id = user.user_id;
    if (!map.has(id)) {
      map.set(id, {
        user_id: id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        position_name: user.position?.position_name ?? null,
        scores: [],
        made_count: 0,
      });
    }
    return map.get(id);
  }

  for (const s of sessions) {
    // Lado empleado: acumula score recibido
    const emp = ensure(s.employee);
    if (emp) emp.scores.push(s.total_score ?? 0);

    // Lado manager: contabiliza evaluación hecha
    const mgr = ensure(s.manager);
    if (mgr) mgr.made_count += 1;
  }

  return [...map.values()]
    .map(({ scores, ...rest }) => ({
      ...rest,
      received_count: scores.length,
      avg_score:
        scores.length > 0
          ? scores.reduce((sum, v) => sum + v, 0) / scores.length
          : null,
    }))
    .sort((a, b) => (b.avg_score ?? -Infinity) - (a.avg_score ?? -Infinity));
}
