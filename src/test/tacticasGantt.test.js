import {
  ganttWindow,
  ganttDayPct,
  ganttBar,
  ganttTone,
  ganttRows,
  tacticDuration,
  durationLabel,
} from '../utils/tacticas'

const TODAY = '2026-11-19'

const camp = (over = {}) => ({
  id: 'c1',
  name: 'Plan',
  client_id: 'b1',
  status: 'En Curso',
  start_date: '2026-11-01',
  end_date: '2026-12-31',
  created_at: '2026-11-01T10:00:00Z',
  checklist: [],
  ...over,
})

describe('ganttWindow', () => {
  it('va de un mes antes a tres meses después del actual', () => {
    const win = ganttWindow(TODAY)
    expect(win.start).toBe('2026-10-01')
    expect(win.end).toBe('2027-02-28')
    // 31 + 30 + 31 + 31 + 28
    expect(win.totalDays).toBe(151)
    expect(win.months.map((m) => m.label)).toEqual([
      'Octubre',
      'Noviembre',
      'Diciembre',
      'Enero',
      'Febrero',
    ])
  })

  it('los meses ocupan todo el ancho, sin huecos', () => {
    const { months } = ganttWindow(TODAY)
    expect(months[0].leftPct).toBe(0)
    const total = months.reduce((a, m) => a + m.widthPct, 0)
    expect(total).toBeCloseTo(100, 6)
    for (let i = 1; i < months.length; i++) {
      expect(months[i].leftPct).toBeCloseTo(months[i - 1].leftPct + months[i - 1].widthPct, 6)
    }
  })

  it('el desplazamiento corre la ventana de a un mes y cruza el año', () => {
    expect(ganttWindow(TODAY, 2).start).toBe('2026-12-01')
    expect(ganttWindow(TODAY, 2).end).toBe('2027-04-30')
    expect(ganttWindow(TODAY, -11).start).toBe('2025-11-01')
  })

  it('respeta los años bisiestos', () => {
    expect(ganttWindow('2027-12-10').end).toBe('2028-03-31')
    expect(ganttWindow('2027-11-10').end).toBe('2028-02-29')
  })
})

describe('ganttDayPct', () => {
  const win = ganttWindow(TODAY)

  it('ubica un día dentro de la ventana', () => {
    expect(ganttDayPct('2026-10-01', win)).toBe(0)
    // 19-nov es el día 49 desde el 1-oct.
    expect(ganttDayPct(TODAY, win)).toBeCloseTo((49 / 151) * 100, 6)
  })

  it('devuelve null fuera de la ventana o sin fecha', () => {
    expect(ganttDayPct('2026-09-30', win)).toBeNull()
    expect(ganttDayPct('2027-03-01', win)).toBeNull()
    expect(ganttDayPct(null, win)).toBeNull()
  })
})

describe('ganttBar', () => {
  const win = ganttWindow(TODAY)

  it('posiciona una táctica entera dentro de la ventana (días inclusive)', () => {
    const bar = ganttBar(camp({ start_date: '2026-11-01', end_date: '2026-11-30' }), win)
    expect(bar.leftPct).toBeCloseTo((31 / 151) * 100, 6)
    expect(bar.widthPct).toBeCloseTo((30 / 151) * 100, 6)
    expect(bar.cutStart).toBe(false)
    expect(bar.cutEnd).toBe(false)
  })

  it('una táctica de un solo día ocupa un día de ancho', () => {
    const bar = ganttBar(camp({ start_date: TODAY, end_date: TODAY }), win)
    expect(bar.widthPct).toBeCloseTo((1 / 151) * 100, 6)
  })

  it('recorta lo que se sale por los bordes y lo marca', () => {
    const bar = ganttBar(camp({ start_date: '2026-09-01', end_date: '2027-06-30' }), win)
    expect(bar.leftPct).toBe(0)
    expect(bar.widthPct).toBeCloseTo(100, 6)
    expect(bar.cutStart).toBe(true)
    expect(bar.cutEnd).toBe(true)
  })

  it('devuelve null si no se cruza con la ventana o le faltan fechas', () => {
    expect(ganttBar(camp({ start_date: '2026-05-01', end_date: '2026-09-30' }), win)).toBeNull()
    expect(ganttBar(camp({ start_date: '2027-03-01', end_date: '2027-03-31' }), win)).toBeNull()
    expect(ganttBar(camp({ start_date: null }), win)).toBeNull()
    expect(ganttBar(camp({ start_date: '2026-12-10', end_date: '2026-12-01' }), win)).toBeNull()
  })
})

describe('ganttTone', () => {
  it('usa el color de la pill de días para las vigentes', () => {
    expect(ganttTone(camp({ end_date: '2026-11-21' }), TODAY)).toBe('red')
    expect(ganttTone(camp({ end_date: '2026-11-29' }), TODAY)).toBe('yellow')
    expect(ganttTone(camp({ end_date: '2026-12-31' }), TODAY)).toBe('green')
  })

  it('distingue las programadas y las que ya no están en marcha', () => {
    expect(ganttTone(camp({ start_date: '2026-12-01' }), TODAY)).toBe('programada')
    expect(ganttTone(camp({ status: 'Finalizado' }), TODAY)).toBe('done')
    expect(ganttTone(camp({ end_date: '2026-11-10' }), TODAY)).toBe('done')
  })
})

describe('ganttRows', () => {
  const win = ganttWindow(TODAY)
  const brands = [
    { id: 'b1', name: 'Zeta' },
    { id: 'b2', name: 'Alfa' },
    { id: 'b3', name: 'Beta' },
    { id: 'b4', name: 'Capitas' },
  ]

  it('primero las marcas cuya vigente vence antes; al final las sin vigente, por nombre', () => {
    const campaigns = [
      camp({ id: 'z', client_id: 'b1', end_date: '2026-12-31' }),
      camp({ id: 'c', client_id: 'b4', end_date: '2026-11-25' }),
      camp({ id: 'a', client_id: 'b2', status: 'Finalizado', end_date: '2026-11-10' }),
    ]
    const rows = ganttRows(brands, campaigns, win, TODAY)
    expect(rows.map((r) => r.brand.name)).toEqual(['Capitas', 'Zeta', 'Alfa', 'Beta'])
    expect(rows[0].nextEnd).toBe('2026-11-25')
    expect(rows[2].nextEnd).toBeNull()
  })

  it('cada fila trae solo las tácticas que caen en la ventana, en orden de inicio', () => {
    const campaigns = [
      camp({ id: 'nueva', client_id: 'b1', start_date: '2026-12-01', end_date: '2027-01-31' }),
      camp({ id: 'vieja', client_id: 'b1', start_date: '2026-03-01', end_date: '2026-04-30' }),
      camp({ id: 'actual', client_id: 'b1', start_date: '2026-11-01', end_date: '2026-11-30' }),
    ]
    const [row] = ganttRows([brands[0]], campaigns, win, TODAY)
    expect(row.bars.map((b) => b.campaign.id)).toEqual(['actual', 'nueva'])
    expect(row.bars[1].tone).toBe('programada')
  })

  it('ignora las tácticas sin marca', () => {
    const rows = ganttRows([brands[0]], [camp({ client_id: null })], win, TODAY)
    expect(rows[0].bars).toHaveLength(0)
  })
})

describe('tacticDuration / durationLabel', () => {
  it('cuenta los días de inicio y fin (del 1 al 21 son 21 días)', () => {
    expect(tacticDuration(camp({ start_date: '2026-11-01', end_date: '2026-11-21' }))).toBe(21)
    expect(durationLabel(camp({ start_date: '2026-11-01', end_date: '2026-11-21' }))).toBe(
      '21 días',
    )
  })

  it('una táctica de un día dice "1 día"', () => {
    expect(durationLabel(camp({ start_date: TODAY, end_date: TODAY }))).toBe('1 día')
  })

  it('cruza meses y años', () => {
    expect(tacticDuration(camp({ start_date: '2026-12-15', end_date: '2027-01-14' }))).toBe(31)
  })

  it('sin fechas o con el fin antes del inicio no hay duración', () => {
    expect(tacticDuration(camp({ end_date: null }))).toBeNull()
    expect(durationLabel(camp({ start_date: '2026-11-10', end_date: '2026-11-01' }))).toBeNull()
    expect(durationLabel(null)).toBeNull()
  })
})
