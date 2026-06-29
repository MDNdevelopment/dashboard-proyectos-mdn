import '@testing-library/jest-dom'

// jsdom no implementa window.matchMedia (usado por InstallBanner para detectar
// modo standalone de PWA). Este stub permite que los tests monten componentes
// que llaman matchMedia sin lanzar TypeError.
window.matchMedia = window.matchMedia || function () {
  return {
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }
}
