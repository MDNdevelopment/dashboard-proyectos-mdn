import { describe, it, expect } from 'vitest'
import { filterProjects } from '../utils/filterProjects'

const BASE = [
  { id: '1', name: 'Campaña Verano',  team: 'Redes',  status: 'En proceso', departments: ['Redes', 'Diseño'],   created_at: '2026-01-15T10:00:00Z' },
  { id: '2', name: 'Rediseño Web',    team: 'Diseño', status: 'Pendiente',  departments: ['Diseño'],             created_at: '2026-02-20T10:00:00Z' },
  { id: '3', name: 'Video Promo',     team: 'AV',     status: 'Completado', departments: ['Audiovisual'],        created_at: '2026-03-05T10:00:00Z' },
  { id: '4', name: 'Estrategia Q2',   team: 'Redes',  status: 'En proceso', departments: ['Redes'],              created_at: '2026-04-10T10:00:00Z' },
]

describe('filterProjects — search', () => {
  it('matches by project name (case-insensitive)', () => {
    const r = filterProjects(BASE, { search: 'verano' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('1')
  })

  it('matches by team name', () => {
    const r = filterProjects(BASE, { search: 'redes' })
    expect(r.map(p => p.id)).toEqual(expect.arrayContaining(['1', '4']))
  })

  it('matches by department', () => {
    const r = filterProjects(BASE, { search: 'audiovisual' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('3')
  })

  it('returns empty array when nothing matches', () => {
    expect(filterProjects(BASE, { search: 'zzznomatch' })).toHaveLength(0)
  })
})

describe('filterProjects — statusFilter', () => {
  it('filters by status', () => {
    const r = filterProjects(BASE, { statusFilter: 'Pendiente' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('2')
  })

  it('"all" returns every project', () => {
    expect(filterProjects(BASE, { statusFilter: 'all' })).toHaveLength(4)
  })

  it('default (no statusFilter) returns every project', () => {
    expect(filterProjects(BASE, {})).toHaveLength(4)
  })
})

describe('filterProjects — deptFilter', () => {
  it('filters by department name', () => {
    const r = filterProjects(BASE, { deptFilter: 'Diseño' })
    expect(r.map(p => p.id)).toEqual(expect.arrayContaining(['1', '2']))
    expect(r).toHaveLength(2)
  })

  it('"all" returns every project', () => {
    expect(filterProjects(BASE, { deptFilter: 'all' })).toHaveLength(4)
  })

  it('works with legacy p.department (single string)', () => {
    const legacyProject = { id: '5', name: 'Legacy', team: 'T', status: 'Pendiente', department: 'Tecnología', departments: undefined, created_at: '2026-01-01T00:00:00Z' }
    const r = filterProjects([...BASE, legacyProject], { deptFilter: 'Tecnología' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('5')
  })
})

describe('filterProjects — date range', () => {
  it('excludes projects before dateFrom', () => {
    const r = filterProjects(BASE, { dateFrom: '2026-02-01' })
    expect(r.map(p => p.id)).toEqual(expect.arrayContaining(['2', '3', '4']))
    expect(r.find(p => p.id === '1')).toBeUndefined()
  })

  it('includes projects on dateFrom (start of day)', () => {
    const r = filterProjects(BASE, { dateFrom: '2026-01-15' })
    expect(r.find(p => p.id === '1')).toBeDefined()
  })

  it('excludes projects after dateTo', () => {
    const r = filterProjects(BASE, { dateTo: '2026-02-28' })
    expect(r.map(p => p.id)).toEqual(expect.arrayContaining(['1', '2']))
    expect(r.find(p => p.id === '3')).toBeUndefined()
  })

  it('includes projects on dateTo (same UTC date)', () => {
    // created_at is 2026-03-05T10:00:00Z → UTC date is 2026-03-05, equal to dateTo
    const r = filterProjects(BASE, { dateTo: '2026-03-05' })
    expect(r.find(p => p.id === '3')).toBeDefined()
  })

  it('applies both dateFrom and dateTo together', () => {
    const r = filterProjects(BASE, { dateFrom: '2026-02-01', dateTo: '2026-03-31' })
    expect(r.map(p => p.id).sort()).toEqual(['2', '3'])
  })

  it('empty dateFrom / dateTo does not filter', () => {
    expect(filterProjects(BASE, { dateFrom: '', dateTo: '' })).toHaveLength(4)
  })
})

describe('filterProjects — combined filters', () => {
  it('combines search and statusFilter', () => {
    const r = filterProjects(BASE, { search: 'redes', statusFilter: 'En proceso' })
    expect(r.map(p => p.id)).toEqual(expect.arrayContaining(['1', '4']))
  })

  it('combines statusFilter and deptFilter (AND logic)', () => {
    // id:1 is En proceso + Diseño, id:2 is Pendiente + Diseño
    const r = filterProjects(BASE, { statusFilter: 'En proceso', deptFilter: 'Diseño' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('1')
  })

  it('combines deptFilter and date range', () => {
    const r = filterProjects(BASE, { deptFilter: 'Redes', dateFrom: '2026-04-01' })
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('4')
  })

  it('returns empty when nothing matches combined filters', () => {
    const r = filterProjects(BASE, { search: 'verano', statusFilter: 'Completado' })
    expect(r).toHaveLength(0)
  })
})
