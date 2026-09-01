export const STORAGE_KEY = 'mdn_report_close_reminder_seen'

/** Última fecha ('YYYY-MM-DD') en que el usuario cerró el modal de recordatorio. */
export function readSeenDate() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeSeenDate(dateStr) {
  try {
    localStorage.setItem(STORAGE_KEY, dateStr)
  } catch {
    // localStorage no disponible (modo privado, etc.) — ignorar
  }
}
