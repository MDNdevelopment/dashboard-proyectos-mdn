import { useCallback, useEffect, useState } from 'react'
import { LATEST_VERSION } from '../data/changelog'
import { getUnseenEntries, readSeenVersion, writeSeenVersion } from '../lib/whatsNew'

/**
 * Orquesta el modal "Novedades".
 * - Primer login en este navegador: NO muestra el modal y marca la versión actual
 *   como vista silenciosamente.
 * - Usuario con una versión guardada anterior: muestra todas las versiones no vistas.
 * - Al cerrar (dismiss): marca LATEST_VERSION como visto.
 */
export function useWhatsNew() {
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const seen = readSeenVersion()
    if (seen === null) {
      writeSeenVersion(LATEST_VERSION)
      setEntries([])
    } else {
      setEntries(getUnseenEntries(seen))
    }
  }, [])

  const dismiss = useCallback(() => {
    writeSeenVersion(LATEST_VERSION)
    setEntries([])
  }, [])

  return { entries, dismiss }
}
