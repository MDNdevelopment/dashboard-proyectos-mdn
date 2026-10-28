import { describe, it, expect } from 'vitest'
import {
  allocationShares,
  validateAllocations,
  allocatedMonthly,
  costsByTarget,
} from '../utils/subscriptions'
import {
  syncSubscriptionCosts,
  subscriptionRowsForLine,
  withSubscriptionRowsFrom,
} from '../utils/syncSubscriptionCosts'

const L = (id, share_pct = null) => ({ line_id: id, department_id: null, share_pct })
const D = (id, share_pct = null) => ({ line_id: null, department_id: id, share_pct })
const sub = (over = {}) => ({
  id: 's1',
  status: 'activa',
  currency: 'USD',
  frequency: 'mensual',
  amount: 10,
  ...over,
})

describe('allocationShares / allocatedMonthly', () => {
  it('sin % reparte en partes iguales', () => {
    expect(allocationShares([L('a'), D(1)]).map((a) => a.pct)).toEqual([0.5, 0.5])
  })

  it('con % usa el de cada una', () => {
    const r = allocatedMonthly(sub({ amount: 100 }), [L('a', 70), L('b', 30)])
    expect(r.map((x) => x.monthly)).toEqual([70, 30])
  })

  it('anual de $120 entre 2 líneas = $5 + $5 al mes', () => {
    const r = allocatedMonthly(sub({ frequency: 'anual', amount: 120 }), [L('a'), L('b')])
    expect(r.map((x) => x.monthly)).toEqual([5, 5])
  })

  it('los centavos cuadran: $10 entre 3 = 3.33 + 3.33 + 3.34', () => {
    const r = allocatedMonthly(sub(), [L('a'), L('b'), L('c')])
    expect(r.map((x) => x.monthly)).toEqual([3.33, 3.33, 3.34])
  })

  it('sin asignaciones no devuelve nada', () => {
    expect(allocatedMonthly(sub(), [])).toEqual([])
  })
})

describe('validateAllocations', () => {
  it('válida sin % o con % que suman 100', () => {
    expect(validateAllocations([L('a'), D(1)])).toEqual([])
    expect(validateAllocations([L('a', 60), L('b', 40)])).toEqual([])
  })

  it('rechaza % que no suman 100, parciales y duplicados', () => {
    expect(validateAllocations([L('a', 60), L('b', 30)])).toHaveLength(1)
    expect(validateAllocations([L('a', 60), L('b')])).toHaveLength(1)
    expect(validateAllocations([L('a'), L('a')])).toHaveLength(1)
  })
})

describe('costsByTarget', () => {
  it('suma por línea/departamento solo activas en USD y separa las sin asignar', () => {
    const subs = [
      sub({ id: 's1', amount: 10 }),
      sub({ id: 's2', amount: 20 }),
      sub({ id: 's3', amount: 99, status: 'pausada' }),
      sub({ id: 's4', amount: 99, currency: 'Bs' }),
    ]
    const allocs = [
      { subscription_id: 's1', ...L('a') },
      { subscription_id: 's1', ...D(7) },
      { subscription_id: 's2', ...L('a') },
      { subscription_id: 's3', ...L('a') },
      { subscription_id: 's4', ...L('a') },
    ]
    expect(costsByTarget(subs, allocs)).toEqual({
      lines: { a: 25 },
      departments: { 7: 5 },
      unassigned: 0,
    })
    expect(costsByTarget([sub()], []).unassigned).toBe(10)
  })
})

describe('syncSubscriptionCosts', () => {
  const costRows = [
    {
      line_id: 'a',
      subscription_id: 's1',
      name: 'CapCut',
      frequency: 'mensual',
      amount: 10,
      allocations: [L('a'), L('b')],
    },
    {
      line_id: 'z',
      subscription_id: 's2',
      name: 'Otra',
      frequency: 'mensual',
      amount: 8,
      allocations: [L('z')],
    },
  ]
  const data = {
    finanzas: {
      ingresos: [{ id: 'i' }],
      sueldos: [{ id: 'x' }],
      otrosGastos: [],
      gastosOperativos: [
        { id: 'm1', descripcion: 'manual', monto: 3 },
        { id: 'sub-viejo', fuente: 'suscripcion', descripcion: 'viejo', monto: 99 },
      ],
    },
  }

  it('genera solo las filas de la línea, con su parte', () => {
    expect(subscriptionRowsForLine('a', costRows)).toEqual([
      {
        id: 'sub-s1',
        fuente: 'suscripcion',
        suscripcionId: 's1',
        descripcion: 'CapCut (suscripción)',
        monto: 5,
        clienteId: null,
      },
    ])
  })

  it('reemplaza las filas de suscripción, conserva las manuales y no muta', () => {
    const before = structuredClone(data)
    const out = syncSubscriptionCosts(data, 'a', costRows)
    expect(out.finanzas.gastosOperativos.map((i) => i.id)).toEqual(['m1', 'sub-s1'])
    expect(out.finanzas.ingresos).toEqual(data.finanzas.ingresos)
    expect(data).toEqual(before)
  })

  it('si la suscripción ya no está asignada, su fila desaparece', () => {
    const out = syncSubscriptionCosts(data, 'a', [])
    expect(out.finanzas.gastosOperativos.map((i) => i.id)).toEqual(['m1'])
  })

  it('withSubscriptionRowsFrom toma solo las filas de suscripción del efectivo', () => {
    const effective = syncSubscriptionCosts(data, 'a', costRows)
    effective.finanzas.sueldos = [{ id: 'reconciliado' }]
    const out = withSubscriptionRowsFrom(data, effective)
    expect(out.finanzas.sueldos).toEqual([{ id: 'x' }])
    expect(out.finanzas.gastosOperativos.map((i) => i.id)).toEqual(['m1', 'sub-s1'])
  })
})
