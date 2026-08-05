/**
 * Tests para Fase 7 — Avatares (Cloudinary)
 *
 * Cubre:
 *  - Helper uploadToCloudinary: happy path + error paths (signed flow)
 *  - Componente AvatarUpload: render, apertura de modal, flujo upload, error, cancelar
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSupabaseMock } from './helpers/supabaseMock'

// ─── Datos de prueba ──────────────────────────────────────────────────────────
const CLOUD = 'mdnclientes'
const PRESET = 'test_signed_preset'
const API_KEY = 'test-api-key'
const SECURE_URL = 'https://res.cloudinary.com/mdnclientes/image/upload/v1/avatar.webp'

const MOCK_USER = {
  user_id: 'user-123',
  first_name: 'Ana',
  last_name: 'García',
  avatar_url: null,
}

// ─── Mocks globales ───────────────────────────────────────────────────────────
// El factory compartido no cubre `functions` (Edge Functions) — se añade aquí
// porque este archivo es el único que ejerce ese flujo (firma de Cloudinary).
vi.mock('../supabase', () => ({
  supabase: {
    ...createSupabaseMock({ auth: { getSession: vi.fn() } }),
    functions: { invoke: vi.fn() },
  },
}))

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

// Mockear las funciones de utilidad para aislar el componente de Canvas/Cloudinary
// Nota: vi.mock se hoista, no puede usar vars del scope externo — usar literales
vi.mock('../utils/uploadToCloudinary', () => ({
  cropToBlob: vi.fn().mockResolvedValue(new Blob(['fake-img'], { type: 'image/webp' })),
  uploadToCloudinary: vi
    .fn()
    .mockResolvedValue('https://res.cloudinary.com/mdnclientes/image/upload/v1/avatar.webp'),
}))

// react-image-crop: devuelve un área completada cuando se hace click
vi.mock('react-image-crop', () => ({
  default: ({ children, onComplete, onChange }) => {
    const crop = { x: 10, y: 10, width: 80, height: 80, unit: 'px' }
    return (
      <div
        data-testid="react-crop"
        onClick={() => {
          onChange(crop)
          onComplete(crop)
        }}
      >
        {children}
      </div>
    )
  },
}))

// ─── Importaciones del código bajo prueba ─────────────────────────────────────
import { uploadToCloudinary } from '../utils/uploadToCloudinary'
import { supabase } from '../supabase'
import AvatarUpload from '../components/empresa/AvatarUpload'

// ─── Helpers de test ──────────────────────────────────────────────────────────
/**
 * Devuelve un mock de FileReader que puede ser instanciado con `new`.
 * El test dispara el onload manualmente llamando readerMock.onload({target:{result}}).
 */
function makeReaderMock() {
  const mock = {
    readAsDataURL: vi.fn(),
    onload: null,
    result: 'data:image/jpeg;base64,fakedata',
  }
  return mock
}

/**
 * Selecciona un archivo en el input de AvatarUpload y dispara el onload del FileReader.
 * Devuelve el readerMock para que el test pueda controlarlo.
 */
async function selectFile(readerMock) {
  const input = screen.getByTestId('avatar-file-input')
  const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' })

  // jsdom no implementa canvas 2D — mockear getContext y toDataURL a nivel de prototipo
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }))
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,fakedata')

  // Mockear Image como constructor para que el paso de cuadrado (squaring) funcione en jsdom
  const imgMock = { naturalWidth: 100, naturalHeight: 100, onload: null, src: '' }
  vi.stubGlobal(
    'Image',
    vi.fn(function () {
      return imgMock
    }),
  )

  // Mockear FileReader como constructor (función regular, no arrow)
  vi.stubGlobal(
    'FileReader',
    vi.fn(function () {
      return readerMock
    }),
  )

  fireEvent.change(input, { target: { files: [file] } })

  // Disparar onload del FileReader simulando que terminó de leer
  act(() => {
    if (readerMock.onload) {
      readerMock.onload({ target: { result: 'data:image/jpeg;base64,fakedata' } })
    }
  })

  // Disparar onload del Image creado internamente para el paso de cuadrado (circular=true)
  act(() => {
    if (imgMock.onload) imgMock.onload()
  })

  await waitFor(() => expect(screen.getByText('Recortar foto')).toBeInTheDocument())

  // Simular que la imagen cargó (para que imgRef.current quede asignado)
  const img = screen.getByAltText('Preview para recortar')
  fireEvent.load(img)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Helper uploadToCloudinary (prueba directa, sin mockear el módulo)
// ═══════════════════════════════════════════════════════════════════════════════
describe('uploadToCloudinary (helper real)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', CLOUD)
    vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', PRESET)
    vi.stubEnv('VITE_CLOUDINARY_API_KEY', API_KEY)

    // El Edge Function "express" devuelve firma y timestamp
    supabase.functions.invoke.mockResolvedValue({
      data: { signature: 'sig123', timestamp: 1700000000 },
      error: null,
    })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('hace POST a la URL de Cloudinary correcta y devuelve secure_url', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ secure_url: SECURE_URL }),
      }),
    )

    // Importar la función real (el vi.mock afecta solo a los módulos que lo usan como dep)
    const { uploadToCloudinary: realUpload } =
      await import('../utils/uploadToCloudinary?real').catch(
        () => import('../utils/uploadToCloudinary'),
      )

    const blob = new Blob(['img'], { type: 'image/webp' })
    const result = await realUpload(blob, 'user-123')

    expect(result).toBe(SECURE_URL)
    expect(fetch).toHaveBeenCalledWith(
      `https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`,
      expect.objectContaining({ method: 'POST' }),
    )
    const [, callOpts] = fetch.mock.calls[0]
    expect(callOpts.body.get('upload_preset')).toBe(PRESET)
    expect(callOpts.body.get('signature')).toBe('sig123')
    expect(callOpts.body.get('timestamp')).toBe('1700000000')
    expect(callOpts.body.get('public_id')).toBe('user-123')
    expect(callOpts.body.get('api_key')).toBe(API_KEY)

    // Verifica que se pidió firma al Edge Function con los datos correctos
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'express',
      expect.objectContaining({ body: expect.objectContaining({ uploadPreset: PRESET }) }),
    )
  })

  it('lanza un error cuando la respuesta no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    )

    const { uploadToCloudinary: realUpload } =
      await import('../utils/uploadToCloudinary?real').catch(
        () => import('../utils/uploadToCloudinary'),
      )

    const blob = new Blob(['img'], { type: 'image/webp' })
    await expect(realUpload(blob, 'user-123')).rejects.toThrow(
      'Error al subir la imagen a Cloudinary',
    )
  })

  it('lanza un error cuando el Edge Function falla al obtener la firma', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error('edge function error'),
    })

    const { uploadToCloudinary: realUpload } =
      await import('../utils/uploadToCloudinary?real').catch(
        () => import('../utils/uploadToCloudinary'),
      )

    const blob = new Blob(['img'], { type: 'image/webp' })
    await expect(realUpload(blob, 'user-123')).rejects.toThrow(
      'Error al obtener la firma de Cloudinary',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Componente AvatarUpload
// ═══════════════════════════════════════════════════════════════════════════════
describe('AvatarUpload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('muestra las iniciales del usuario cuando no hay avatar_url', () => {
    render(<AvatarUpload user={MOCK_USER} onUploaded={vi.fn()} size={72} label="Cambiar foto" />)
    expect(screen.getByText('AG')).toBeInTheDocument()
  })

  it('muestra el label por defecto', () => {
    render(<AvatarUpload user={MOCK_USER} onUploaded={vi.fn()} size={72} label="Cambiar foto" />)
    expect(screen.getByText('Cambiar foto')).toBeInTheDocument()
  })

  it('no muestra el label cuando label está vacío', () => {
    render(<AvatarUpload user={MOCK_USER} onUploaded={vi.fn()} size={72} label="" />)
    expect(screen.queryByText('Cambiar foto')).not.toBeInTheDocument()
  })

  it('oculta el trigger visual cuando size=0 (modo trigger externo)', () => {
    render(
      <AvatarUpload
        user={MOCK_USER}
        onUploaded={vi.fn()}
        size={0}
        label=""
        triggerRef={{ current: null }}
      />,
    )
    // El file input sigue presente aunque el trigger visual esté oculto
    expect(screen.getByTestId('avatar-file-input')).toBeInTheDocument()
  })

  it('muestra el modal de recorte al seleccionar un archivo', async () => {
    render(<AvatarUpload user={MOCK_USER} onUploaded={vi.fn()} size={72} label="Cambiar foto" />)
    const readerMock = makeReaderMock()
    await selectFile(readerMock)
    expect(screen.getByText('Recortar foto')).toBeInTheDocument()
    expect(screen.getByAltText('Preview para recortar')).toBeInTheDocument()
  })

  it('habilita el botón "Subir foto" tras completar el recorte', async () => {
    render(<AvatarUpload user={MOCK_USER} onUploaded={vi.fn()} size={72} label="Cambiar foto" />)
    const readerMock = makeReaderMock()
    await selectFile(readerMock)

    // Simular que el usuario hace el crop
    fireEvent.click(screen.getByTestId('react-crop'))

    const uploadBtn = await screen.findByText('Subir foto')
    expect(uploadBtn).not.toBeDisabled()
  })

  it('llama a onUploaded con secure_url tras completar crop y subir', async () => {
    const onUploaded = vi.fn()
    render(<AvatarUpload user={MOCK_USER} onUploaded={onUploaded} size={72} label="Cambiar foto" />)

    const readerMock = makeReaderMock()
    await selectFile(readerMock)

    fireEvent.click(screen.getByTestId('react-crop'))
    const uploadBtn = await screen.findByText('Subir foto')
    await userEvent.click(uploadBtn)

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(SECURE_URL)
    })
    // El modal debe cerrarse tras el éxito
    expect(screen.queryByText('Recortar foto')).not.toBeInTheDocument()
  })

  it('muestra error cuando uploadToCloudinary falla', async () => {
    const { uploadToCloudinary: mockUpload } = await import('../utils/uploadToCloudinary')
    mockUpload.mockRejectedValueOnce(new Error('Error al subir la imagen a Cloudinary'))

    const onUploaded = vi.fn()
    render(<AvatarUpload user={MOCK_USER} onUploaded={onUploaded} size={72} label="Cambiar foto" />)

    const readerMock = makeReaderMock()
    await selectFile(readerMock)

    fireEvent.click(screen.getByTestId('react-crop'))
    const uploadBtn = await screen.findByText('Subir foto')
    await userEvent.click(uploadBtn)

    await waitFor(() => {
      expect(screen.getByText('Error al subir la imagen a Cloudinary')).toBeInTheDocument()
    })
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('cierra el modal al pulsar Cancelar', async () => {
    render(<AvatarUpload user={MOCK_USER} onUploaded={vi.fn()} size={72} label="Cambiar foto" />)
    const readerMock = makeReaderMock()
    await selectFile(readerMock)

    // Hay dos botones Cancelar (X y footer). Usamos el del footer.
    const cancelBtns = screen.getAllByText('Cancelar')
    fireEvent.click(cancelBtns[cancelBtns.length - 1])

    await waitFor(() => {
      expect(screen.queryByText('Recortar foto')).not.toBeInTheDocument()
    })
  })
})
