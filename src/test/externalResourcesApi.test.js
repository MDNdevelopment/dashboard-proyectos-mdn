import { vi } from 'vitest'
import { createSupabaseMock, makeQuery } from './helpers/supabaseMock'

let insertSpy
let updateSpy

vi.mock('../supabase', () => ({
  supabase: createSupabaseMock({
    tables: {
      external_resources: () => {
        const q = makeQuery([])
        insertSpy = vi.fn(() => q)
        updateSpy = vi.fn(() => q)
        q.insert = insertSpy
        q.update = updateSpy
        return q
      },
    },
  }),
}))

const {
  createExternalResource,
  updateExternalResource,
  deleteExternalResource,
  restoreExternalResource,
} = await import('../components/pautas/externalResourcesApi')

describe('externalResourcesApi sanitize', () => {
  it('createExternalResource solo persiste full_name y roles filtrados a los permitidos', async () => {
    await createExternalResource('co-1', {
      full_name: '  Alan Puentes  ',
      roles: ['grabacion', 'ads', 'no-existe'],
      email: 'no-deberia-persistirse@test.com',
    })
    expect(insertSpy).toHaveBeenCalledWith({
      full_name: 'Alan Puentes',
      roles: ['grabacion', 'ads'],
      company_id: 'co-1',
    })
  })

  it('updateExternalResource solo actualiza los campos permitidos presentes', async () => {
    await updateExternalResource('r1', { roles: ['edicion'] })
    expect(updateSpy).toHaveBeenCalledWith({ roles: ['edicion'] })
  })

  it('deleteExternalResource hace soft delete (set deleted_at), no borra físico', async () => {
    await deleteExternalResource('r1')
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
  })

  it('restoreExternalResource limpia deleted_at', async () => {
    await restoreExternalResource('r1')
    expect(updateSpy).toHaveBeenCalledWith({ deleted_at: null })
  })
})
