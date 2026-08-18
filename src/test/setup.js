import '@testing-library/jest-dom'

// Node 22+ define su propio global `localStorage`/`sessionStorage` (experimental Web
// Storage API) como un getter/setter en `globalThis` que, sin el flag
// `--localstorage-file`, siempre devuelve `undefined` — y en el entorno jsdom de Vitest
// `window === globalThis`, así que también tapa la implementación real de jsdom. Se
// redefine con un polyfill simple en memoria para que `localStorage.clear()`/`setItem`/
// etc. funcionen en los tests igual que en un navegador real.
function createMemoryStorage() {
  let store = new Map()
  return {
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value))
    },
    removeItem: (key) => {
      store.delete(String(key))
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}
for (const prop of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, prop, {
    value: createMemoryStorage(),
    writable: true,
    configurable: true,
  })
}

// jsdom no implementa window.matchMedia (usado por InstallBanner para detectar
// modo standalone de PWA). Este stub permite que los tests monten componentes
// que llaman matchMedia sin lanzar TypeError.
window.matchMedia =
  window.matchMedia ||
  function () {
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
