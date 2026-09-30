import { describe, it, expect, afterEach, vi } from 'vitest'
import { setViewOnly } from '../lib/viewAs'
import { blockedByViewOnly, wrapSupabaseClient, VIEW_ONLY_MESSAGE } from '../lib/viewOnlyClient'

/** Cliente mínimo con la forma que usa la app: from() encadenable + rpc(). */
function makeFakeClient() {
  const calls = { from: [], rpc: [], insert: 0, update: 0, upsert: 0, delete: 0 }
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data: { ok: true }, error: null })),
    insert: vi.fn(() => {
      calls.insert += 1
      return Promise.resolve({ data: [{ id: 1 }], error: null })
    }),
    update: vi.fn(() => {
      calls.update += 1
      return Promise.resolve({ data: [], error: null })
    }),
    upsert: vi.fn(() => {
      calls.upsert += 1
      return Promise.resolve({ data: [], error: null })
    }),
    delete: vi.fn(() => {
      calls.delete += 1
      return Promise.resolve({ data: [], error: null })
    }),
    then: (onOk) => Promise.resolve({ data: [{ id: 1 }], error: null }).then(onOk),
  }
  const client = {
    from: vi.fn((table) => {
      calls.from.push(table)
      return builder
    }),
    rpc: vi.fn((fn) => {
      calls.rpc.push(fn)
      return Promise.resolve({ data: 'real', error: null })
    }),
  }
  return { client: wrapSupabaseClient(client), calls, builder }
}

afterEach(() => setViewOnly(false))

describe('fuera del modo "Ver como"', () => {
  it('las escrituras pasan al cliente real', async () => {
    const { client, calls } = makeFakeClient()
    const res = await client.from('tasks').insert({ name: 'x' })
    expect(calls.insert).toBe(1)
    expect(res.error).toBeNull()
  })

  it('los RPC pasan al cliente real', async () => {
    const { client, calls } = makeFakeClient()
    const res = await client.rpc('move_client_line_reports', {})
    expect(calls.rpc).toEqual(['move_client_line_reports'])
    expect(res.data).toBe('real')
  })
})

describe('en modo "Ver como"', () => {
  it('bloquea insert/update/upsert/delete sin llegar a la red', async () => {
    const { client, calls } = makeFakeClient()
    setViewOnly(true)

    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      const res = await client.from('tasks')[method]({ name: 'x' })
      expect(res.error?.code).toBe('VIEW_ONLY')
      expect(res.data).toBeNull()
      expect(res.status).toBe(403)
    }

    expect(calls.insert + calls.update + calls.upsert + calls.delete).toBe(0)
  })

  it('bloquea también la cadena completa .insert().select().single()', async () => {
    const { client } = makeFakeClient()
    setViewOnly(true)
    const res = await client.from('tasks').insert({ name: 'x' }).select('id').single()
    expect(res.error?.code).toBe('VIEW_ONLY')
    expect(res.error?.message).toBe(VIEW_ONLY_MESSAGE)
  })

  it('deja pasar las lecturas', async () => {
    const { client, builder } = makeFakeClient()
    setViewOnly(true)
    const res = await client.from('users').select('user_id').eq('user_id', 'u1').single()
    expect(builder.select).toHaveBeenCalled()
    expect(res.data).toEqual({ ok: true })
    expect(res.error).toBeNull()
  })

  it('bloquea los RPC de escritura pero deja pasar los de lectura', async () => {
    const { client, calls } = makeFakeClient()
    setViewOnly(true)

    const blocked = await client.rpc('move_client_line_reports', {})
    expect(blocked.error?.code).toBe('VIEW_ONLY')

    const allowed = await client.rpc('users_on_vacation_today', {})
    expect(allowed.data).toBe('real')
    expect(calls.rpc).toEqual(['users_on_vacation_today'])
  })

  it('no contamina el builder de otras consultas al salir del modo', async () => {
    const { client, calls } = makeFakeClient()
    setViewOnly(true)
    await client.from('tasks').insert({ name: 'x' })
    setViewOnly(false)
    await client.from('tasks').insert({ name: 'y' })
    expect(calls.insert).toBe(1)
  })
})

describe('blockedByViewOnly', () => {
  it('devuelve null fuera del modo y el mensaje dentro', () => {
    expect(blockedByViewOnly()).toBeNull()
    setViewOnly(true)
    expect(blockedByViewOnly()).toBe(VIEW_ONLY_MESSAGE)
  })
})
