import StatusPill from '../../common/StatusPill'
import {
  FORMATO_META,
  FORMATOS,
  NO_STATUS,
  SHEET_STATUSES,
  STATUS_META,
} from '../../../utils/temporada'

/**
 * Un campo de la celda cliente × slot: una píldora editable (si hay permiso) con el formato o
 * el estado de esa columna. `field` es `formato`, `diseno_status` o `audiovisual_status`; la
 * columna en blanco se muestra como «Sin estado» / «Sin formato».
 */
export default function TemporadaCell({ field, row, canManage, onChange }) {
  const isFormato = field === 'formato'
  return (
    <StatusPill
      size="sm"
      value={row?.[field] ?? NO_STATUS}
      meta={isFormato ? FORMATO_META : STATUS_META}
      options={isFormato ? FORMATOS : SHEET_STATUSES}
      editable={canManage}
      onChange={(next) => onChange(field, next || null)}
    />
  )
}
