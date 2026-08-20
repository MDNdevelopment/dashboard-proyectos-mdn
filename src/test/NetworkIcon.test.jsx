import { render } from '@testing-library/react'
import NetworkIcon from '../components/common/NetworkIcon'

const KNOWN_NETWORKS = [
  'Instagram',
  'Facebook',
  'TikTok',
  'X',
  'YouTube',
  'YouTube Shorts',
  'LinkedIn',
  'Mailchimp',
]

describe('NetworkIcon', () => {
  it.each(KNOWN_NETWORKS)('renderiza un ícono (no texto de iniciales) para %s', (network) => {
    const { container, queryByText } = render(<NetworkIcon network={network} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    // No debe mostrar abreviaturas de texto tipo "IG"/"FB"/"TT" en vez del ícono.
    expect(queryByText(network.slice(0, 2).toUpperCase())).not.toBeInTheDocument()
  })

  it('usa un ícono genérico para una red desconocida ("Otro" o sin catalogar)', () => {
    const { container } = render(<NetworkIcon network="Otro" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('respeta el tamaño pasado por props', () => {
    const { container } = render(<NetworkIcon network="Instagram" size={30} />)
    const badge = container.firstChild
    expect(badge).toHaveStyle({ width: '30px', height: '30px' })
  })

  it('YouTube y YouTube Shorts se distinguen visualmente (glifo distinto)', () => {
    const yt = render(<NetworkIcon network="YouTube" />).container.querySelector('svg').outerHTML
    const ytShorts = render(<NetworkIcon network="YouTube Shorts" />).container.querySelector(
      'svg',
    ).outerHTML
    expect(yt).not.toBe(ytShorts)
  })
})
