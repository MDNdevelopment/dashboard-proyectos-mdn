// Parser mínimo para el texto que devuelve el chat IA: solo soporta **negrita**
// (lo único que el modelo usa en la práctica). No se agrega una librería de markdown
// completa para esto — es una función pura que parte el texto en segmentos.

/**
 * @param {string} text
 * @returns {Array<{ bold: boolean, text: string }>}
 */
export function parseMarkdownLite(text) {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*)/g)
  return parts
    .filter((p) => p !== '')
    .map((part) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return { bold: true, text: part.slice(2, -2) }
      }
      return { bold: false, text: part }
    })
}
