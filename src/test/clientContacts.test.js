import { describe, it, expect } from 'vitest'

// ── Helpers que replican la lógica del payload en ClientModal ────────────────
// (Testeamos la lógica de coerción de datos directamente, sin montar el componente)

function buildClientPayload(form) {
  const name = form.name.trim()
  const payment_day = form.payment_day !== '' ? parseInt(form.payment_day, 10) : null
  const monthly_fee = form.monthly_fee !== '' ? Number(form.monthly_fee) : null
  return {
    name,
    logo_url:         form.logo_url || null,
    line_id:          form.line_id || null,
    website:          form.website?.trim() || null,
    payment_day,
    monthly_fee,
    social_links:     form.social_links.filter(s => s.link.trim()),
    contacts:         form.contacts.filter(c => c.name.trim()),
    anniversary_date: form.anniversary_date || null,
    mdn_since:        form.mdn_since || null,
  }
}

describe('clientContacts — payload de contacts', () => {
  it('filtra contactos sin nombre', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '',
      social_links: [],
      contacts: [
        { name: 'María López', birth_day: '15', birth_month: '5', role: 'Gerente' },
        { name: '',            birth_day: '1',  birth_month: '1', role: 'Director' },
        { name: 'Carlos Ruiz', birth_day: '',   birth_month: '', role: '' },
      ],
      anniversary_date: '', mdn_since: '',
    }
    const payload = buildClientPayload(form)
    expect(payload.contacts).toHaveLength(2)
    expect(payload.contacts[0].name).toBe('María López')
    expect(payload.contacts[1].name).toBe('Carlos Ruiz')
  })

  it('conserva birth_day, birth_month y role en los contactos incluidos', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '',
      social_links: [],
      contacts: [{ name: 'Pedro', birth_day: '20', birth_month: '3', role: 'Analista' }],
      anniversary_date: '', mdn_since: '',
    }
    const payload = buildClientPayload(form)
    expect(payload.contacts[0]).toEqual({ name: 'Pedro', birth_day: '20', birth_month: '3', role: 'Analista' })
  })

  it('devuelve contacts vacío cuando no hay ninguno con nombre', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '',
      social_links: [], contacts: [], anniversary_date: '', mdn_since: '',
    }
    const payload = buildClientPayload(form)
    expect(payload.contacts).toEqual([])
  })
})

describe('clientContacts — fechas de aniversario y MDN', () => {
  it('convierte strings vacíos a null en anniversary_date y mdn_since', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '',
      social_links: [], contacts: [], anniversary_date: '', mdn_since: '',
    }
    const payload = buildClientPayload(form)
    expect(payload.anniversary_date).toBeNull()
    expect(payload.mdn_since).toBeNull()
  })

  it('conserva las fechas cuando se ingresan', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '',
      social_links: [], contacts: [],
      anniversary_date: '2010-03-15',
      mdn_since: '2022-07-01',
    }
    const payload = buildClientPayload(form)
    expect(payload.anniversary_date).toBe('2010-03-15')
    expect(payload.mdn_since).toBe('2022-07-01')
  })
})

describe('clientContacts — mensualidad (monthly_fee)', () => {
  it('convierte string vacío a null cuando no se ingresa mensualidad', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '',
      social_links: [], contacts: [], anniversary_date: '', mdn_since: '',
    }
    const payload = buildClientPayload(form)
    expect(payload.monthly_fee).toBeNull()
  })

  it('convierte string numérico a Number cuando se ingresa mensualidad', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '1500.50',
      social_links: [], contacts: [], anniversary_date: '', mdn_since: '',
    }
    const payload = buildClientPayload(form)
    expect(payload.monthly_fee).toBe(1500.5)
  })

  it('convierte "0" a 0 (no a null)', () => {
    const form = {
      name: 'Empresa X', logo_url: '', line_id: '', website: '', payment_day: '', monthly_fee: '0',
      social_links: [], contacts: [], anniversary_date: '', mdn_since: '',
    }
    const payload = buildClientPayload(form)
    expect(payload.monthly_fee).toBe(0)
  })
})

describe('clientContacts — payload completo', () => {
  it('incluye todos los campos del cliente en el payload', () => {
    const form = {
      name: '  Marca Uno  ', logo_url: 'https://img.com/logo.png',
      line_id: 'line-abc', website: 'https://marcauno.com',
      payment_day: '15', monthly_fee: '800',
      social_links: [{ red: 'Instagram', link: 'https://ig.com/marca' }],
      contacts: [{ name: 'Ana', birth_day: '10', birth_month: '6', role: 'CEO' }],
      anniversary_date: '2005-01-01', mdn_since: '2020-06-01',
    }
    const payload = buildClientPayload(form)
    expect(payload.name).toBe('Marca Uno')
    expect(payload.payment_day).toBe(15)
    expect(payload.monthly_fee).toBe(800)
    expect(payload.logo_url).toBe('https://img.com/logo.png')
    expect(payload.social_links).toHaveLength(1)
    expect(payload.contacts).toHaveLength(1)
    expect(payload.contacts[0].birth_day).toBe('10')
    expect(payload.contacts[0].birth_month).toBe('6')
    expect(payload.anniversary_date).toBe('2005-01-01')
    expect(payload.mdn_since).toBe('2020-06-01')
  })
})
