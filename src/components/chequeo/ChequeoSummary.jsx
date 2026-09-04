import KpiCard from '../tareas/KpiCard'

/**
 * Fila de KPIs del módulo Chequeo: cuántas cuentas están al día en el período activo
 * (`summary`, ver `computeChequeoSummary` en utils/chequeo.js). Se muestra arriba de la
 * grilla, tanto para una línea concreta como para el total de "Todas" — el detalle por
 * línea individual vive en el encabezado de sección dentro de ChequeoGrid.
 *
 * `periodoLabel` es puramente informativo ("Semana S2" / "Fecha más reciente · Julio") para
 * dejar explícito qué período miden estos números, porque cambian con el selector de semana.
 */
export default function ChequeoSummary({ summary, periodoLabel }) {
  const { totalCuentas, sinRedes, actualizadas, parciales, sinRegistrar, porVencer } = summary
  const pctActualizadas = totalCuentas ? Math.round((actualizadas / totalCuentas) * 100) : 0

  return (
    <div className="mb-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Cuentas"
          value={totalCuentas}
          sub={sinRedes > 0 ? `${sinRedes} sin redes` : periodoLabel}
        />
        <KpiCard
          label="Actualizadas"
          value={actualizadas}
          sub={totalCuentas ? `${pctActualizadas}% del total` : undefined}
          color="#1f8a43"
        />
        <KpiCard
          label="Por vencer"
          value={porVencer}
          sub="7-12 días"
          color={porVencer ? '#e08a1e' : undefined}
        />
      </div>

      {totalCuentas > 0 && (
        <div className="bg-white rounded-xl border border-[#e0ddd4] p-4 mt-3">
          <p className="text-[13px] font-mono font-bold tracking-[0.12em] uppercase text-[#888] mb-3">
            Estado de cuentas · {periodoLabel}
          </p>
          <div className="flex rounded-full overflow-hidden h-2">
            {actualizadas > 0 && (
              <div
                style={{ width: `${(actualizadas / totalCuentas) * 100}%`, background: '#1f8a43' }}
                title={`Actualizadas: ${actualizadas}`}
              />
            )}
            {parciales > 0 && (
              <div
                style={{ width: `${(parciales / totalCuentas) * 100}%`, background: '#e08a1e' }}
                title={`Parciales: ${parciales}`}
              />
            )}
            {sinRegistrar > 0 && (
              <div
                style={{ width: `${(sinRegistrar / totalCuentas) * 100}%`, background: '#d8d4c8' }}
                title={`Sin registrar: ${sinRegistrar}`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
