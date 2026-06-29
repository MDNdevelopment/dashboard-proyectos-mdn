/**
 * Calcula el promedio de score de la empresa y del departamento del usuario,
 * excluyendo al propio usuario de los cálculos.
 *
 * @param {Array} sessions - Filas de evaluation_sessions con embed:
 *   { total_score, employee: { user_id, company_id, department_id } | null }
 * @param {string|number} myUserId - user_id del usuario logueado (se excluye)
 * @param {string|number} myDepartmentId - department_id del usuario logueado
 * @returns {{ companyAvg: number|null, deptAvg: number|null }}
 */
export function aggregateGroupAverages(sessions, myUserId, myDepartmentId) {
  if (!sessions || sessions.length === 0) {
    return { companyAvg: null, deptAvg: null }
  }

  const companyScores = []
  const deptScores = []

  for (const s of sessions) {
    const emp = s.employee
    if (!emp) continue
    // Excluir al propio usuario de los promedios de comparación
    if (emp.user_id === myUserId) continue
    if (s.total_score == null) continue

    companyScores.push(s.total_score)
    if (emp.department_id === myDepartmentId) {
      deptScores.push(s.total_score)
    }
  }

  const avg = arr =>
    arr.length > 0 ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null

  return {
    companyAvg: avg(companyScores),
    deptAvg: avg(deptScores),
  }
}
