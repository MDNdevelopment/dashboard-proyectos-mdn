import { Avatar } from '../tareas/UserPickerSingle'
import EventTypeIcon from './EventTypeIcon'

/**
 * Dos tarjetas fijas ("De vacaciones ahora" / "En período de prueba"), siempre visibles
 * arriba del calendario mensual en Empresa → Empleados. A diferencia del calendario (que
 * pinta el mes navegado), estos datos son de "hoy" y no dependen de qué mes esté abierto —
 * reemplazan a la vieja "estela" de vacaciones que repetía el nombre del empleado día a día
 * en la grilla (quitada por sobrecargar la vista).
 *
 * Puramente presentacional: no hace fetch, no tiene `onClick` (es un resumen, no navegación).
 * `EmployeesView.jsx` arma `onVacationItems`/`probationItems` a partir de sus propios estados.
 * `showVacations` (default true) oculta la tarjeta de vacaciones para quien no tenga la
 * capacidad `empresa.vacaciones.manage` — la lectura de la tabla `vacations` está restringida
 * por RLS a RRHH/nivel 4/admin, así que para el resto `onVacationItems` siempre llega vacío.
 */
export default function TeamStatusCards({ onVacationItems, probationItems, showVacations = true }) {
  return (
    <div className={`grid grid-cols-1 ${showVacations ? 'sm:grid-cols-2' : ''} gap-3 mb-4`}>
      {showVacations && (
        <TeamStatusCard
          iconType="vacation_start"
          title="De vacaciones ahora"
          items={onVacationItems}
          emptyText="Nadie está de vacaciones hoy."
        />
      )}
      <TeamStatusCard
        iconType="probation_end"
        title="En período de prueba"
        items={probationItems}
        emptyText="Nadie está en período de prueba."
      />
    </div>
  )
}

function TeamStatusCard({ iconType, title, items, emptyText }) {
  return (
    <div className="bg-white border border-[#e0ddd4] rounded-2xl p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <EventTypeIcon type={iconType} size={13} className="text-[#666]" />
        <h3 className="text-[14px] font-bold text-[#111]">{title}</h3>
        <span className="text-[12px] text-[#999]">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-[#bbb]">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <div
                className={item.dashed ? 'rounded-full border border-dashed border-[#d8d5cb]' : ''}
              >
                <Avatar user={item.user} size={28} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-[#111] truncate">
                    {item.name}
                  </span>
                  {item.badge && (
                    <span
                      className={`text-[9px] font-mono font-bold tracking-wide uppercase px-1 py-0.5 rounded flex-shrink-0 ${item.badge.cls}`}
                    >
                      {item.badge.text}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#888] truncate">{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
