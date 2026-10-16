import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Cada tab de EmpresaPage necesita su <Route> explícita en main.jsx; sin ella el comodín
// `path="*"` redirige a "/" aunque el usuario tenga la capability (pasó con Suscripciones).
describe('rutas de Empresa', () => {
  const root = resolve(__dirname, '..')
  const page = readFileSync(resolve(root, 'pages/EmpresaPage.jsx'), 'utf8')
  const main = readFileSync(resolve(root, 'main.jsx'), 'utf8')
  const paths = [...page.matchAll(/path: '(\/empresa[^']*)'/g)].map((m) => m[1])

  it('detecta las tabs de EmpresaPage', () => {
    expect(paths).toContain('/empresa/suscripciones')
  })

  it.each(paths)('%s está registrada en main.jsx', (path) => {
    expect(main).toContain(`path="${path}"`)
  })
})
