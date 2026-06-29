/**
 * Pure function to filter a list of normalized projects.
 * Extracted from Dashboard.jsx for testability.
 *
 * @param {Array}  projects     - Normalized project objects (with created_at field).
 * @param {Object} opts
 * @param {string} opts.search       - Free-text search (name, team, departments).
 * @param {string} opts.activeFilter - 'all' | status string | 'dept:<name>'.
 * @param {string} opts.dateFrom     - 'YYYY-MM-DD' lower bound (inclusive, start of day).
 * @param {string} opts.dateTo       - 'YYYY-MM-DD' upper bound (inclusive, end of day).
 */
export function filterProjects(
  projects,
  { search = '', activeFilter = 'all', dateFrom = '', dateTo = '' } = {},
) {
  return projects.filter(p => {
    // Status or department filter
    if (activeFilter && activeFilter !== 'all') {
      if (activeFilter.startsWith('dept:')) {
        const dept = activeFilter.slice(5)
        const depts = p.departments ?? (p.department ? [p.department] : [])
        if (!depts.includes(dept)) return false
      } else {
        if (p.status !== activeFilter) return false
      }
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
