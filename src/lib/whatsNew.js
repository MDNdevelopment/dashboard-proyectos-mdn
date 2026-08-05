import { CHANGELOG } from '../data/changelog'

export const STORAGE_KEY = 'mdn_whatsnew_seen_version'

/**
 * Compara dos versiones semver `x.y.z` (acepta más o menos partes).
 * Devuelve -1 si a < b, 0 si son iguales, 1 si a > b.
 */
export function compareSemver(a, b) {
  const pa = String(a)
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const pb = String(b)
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

/**
 * Devuelve las entradas del CHANGELOG con versión mayor a `seenVersion`.
 * Con `seenVersion` null (usuario nuevo) devuelve [] — el llamador igual
 * debe marcar la versión actual como vista.
 */
export function getUnseenEntries(seenVersion) {
  if (seenVersion === null || seenVersion === undefined) return []
  return CHANGELOG.filter((entry) => compareSemver(entry.version, seenVersion) > 0)
}

export function readSeenVersion() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeSeenVersion(version) {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // localStorage no disponible (modo privado, etc.) — ignorar
  }
}
