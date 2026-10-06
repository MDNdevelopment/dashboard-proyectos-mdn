/**
 * Botones de acción del detalle según estado y permisos (`pautaPermissions`). Solo dispara
 * `onAction(nombre)`; el padre decide qué diálogo abrir o qué campo escribir.
 */
export default function PautaAcciones({ pauta, perms, onAction }) {
  const deleted = Boolean(pauta.deleted_at)
  const actions = []
  if (deleted) {
    if (perms.canRestore) actions.push(['restaurar', 'Restaurar', 'primary'])
    if (perms.canRestore) actions.push(['eliminar', 'Eliminar definitivamente', 'danger'])
  } else {
    if (perms.canApprove) actions.push(['agendar', 'Aprobar y agendar', 'primary'])
    if (perms.canReagendar) actions.push(['reagendar', 'Reagendar', 'primary'])
    if (perms.canMarkRealizada) actions.push(['realizada', 'Marcar realizada', 'success'])
    if (perms.canApprove) actions.push(['declinar', 'Declinar', 'ghost'])
    if (perms.canReopen) actions.push(['solicitada', 'Volver a solicitada', 'ghost'])
    if (perms.canEditBrief) actions.push(['editar', 'Editar', 'ghost'])
    if (perms.canDelete) actions.push(['borrar', 'Borrar', 'danger'])
  }
  if (actions.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2" aria-label="Acciones">
      {actions.map(([key, label, kind]) => (
        <button
          key={key}
          type="button"
          onClick={() => onAction(key)}
          className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${STYLE[kind]}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const STYLE = {
  primary: 'bg-[#FFB800] text-[#111] hover:brightness-95',
  success: 'bg-[#1f8a43] text-white hover:brightness-95',
  ghost: 'bg-white border border-[#e0ddd4] text-[#555] hover:border-[#111] hover:text-[#111]',
  danger: 'text-[#c0392b] hover:bg-[#fdecec]',
}
