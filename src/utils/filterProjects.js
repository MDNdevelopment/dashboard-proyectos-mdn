/**
 * Pure function to filter a list of normalized projects.
 * Extracted from Dashboard.jsx for testability.
 *
 * @param {Array}  projects     - Normalized project objects (with created_at field).
 * @param {Object} opts
 * @param {string} opts.search       - Free-text search (name, team, departments).
 * @param {string} opts.statusFilter - 'all' | status string ('En proceso', 'Pendiente', 'Completado').
 * @param {string} opts.deptFilter   - 'all' | department name.
 * @param {string} opts.dateFrom     - 'YYYY-MM-DD' lower bound (inclusive, start of day).
 * @param {string} opts.dateTo       - 'YYYY-MM-DD' upper bound (inclusive, end of day).
 */
export function filterProjects(
  projects,
  { search = '', statusFilter = 'all', deptFilter = 'all', dateFrom = '', dateTo = '' } = {},
) {
  return projects.filter(p => {
    // Status filter
    if (statusFilter && statusFilter !== 'all') {
      if (p.status !== statusFilter) return false
    }

    // Department filter
    if (deptFilter && deptFilter !== 'all') {
      const depts = p.departments ?? (p.department ? [p.department] : [])
      if (!depts.includes(deptFilter)) return false
    }

    // Text search: name, team, or any department
    if (search) {
      const sq = search.toLowerCase()
      const depts = p.departments ?? (p.department ? [p.department] : [])
      const matches =
        p.name?.toLowerCase().includes(sq) ||
        p.team?.toLowerCase().includes(sq) ||
        depts.some(d => d.toLowerCase().includes(sq))
      if (!matches) return false
    }

    // Date range: compare YYYY-MM-DD strings to avoid local-timezone issues.
    // created_at is a UTC ISO string; slice(0,10) extracts the UTC date portion.
    if (dateFrom || dateTo) {
      const projectDate = new Date(p.created_at).toISOString().slice(0, 10)
      if (dateFrom && projectDate < dateFrom) return false
      if (dateTo   && projectDate > dateTo)   return false
    }

    return true
  })
}
