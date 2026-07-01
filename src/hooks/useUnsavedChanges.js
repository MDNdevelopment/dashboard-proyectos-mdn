import { useCallback, useEffect, useMemo } from 'react'

const DISCARD_MSG = 'Tienes cambios sin guardar. ¿Descartar y cerrar?'

/**
 * Detecta cambios sin guardar en un formulario modal y protege el cierre.
 *
 * @param {object} params
 * @param {any}      params.value    — estado actual del formulario
 * @param {any}      params.baseline — valor inicial (snapshot del primer render)
 * @param {Function} params.onClose  — callback original de cierre del modal
 *
 * @returns {{ dirty: boolean, requestClose: Function }}
 *   dirty        — true cuando el formulario difiere del baseline
 *   requestClose — úsalo en lugar de onClose en X, Cancelar, backdrop y Escape;
 *                  pide confirmación nativa si hay cambios
 */
export function useUnsavedChanges({ value, baseline, onClose }) {
  const dirty = useMemo(
    () => JSON.stringify(value) !== JSON.stringify(baseline),
    [value, baseline],
  )

  // Alerta nativa del navegador al recargar o cerrar la pestaña
  useEffect(() => {
    if (!dirty) return
    const h = e => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // Cierre protegido: pide confirmación solo si hay cambios
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm(DISCARD_MSG)) return
    onClose()
  }, [dirty, onClose])

  return { dirty, requestClose }
}
