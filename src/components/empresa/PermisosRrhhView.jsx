import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { loadCompanyEmployees } from '../metricas/metricsApi'
import { activeEmployees } from '../../lib/employees'
import { fetchPermissionsByMonth, deletePermission } from '../../lib/employeePermissions'
import { aggregatePermissionsByMonth, PERMISSION_TYPES } from '../../utils/employeePermissions'
import { MONTHS } from '../metricas/constants'
import PermissionFormDialog from './PermissionFormDialog'
import ConfirmDeleteDialog from '../common/ConfirmDeleteDialog'
import { isoToDdmmyyyy } from '../../utils/formatDate'

const CURRENT = new Date()
const CURRENT_YEAR = CURRENT.getFullYear()
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]

/** Columnas de la tabla en el orden de PERMISSION_TYPES (permiso, ausencia, reposo,
 * llegada_tarde, salida_temprana) — agregar un tipo nuevo ahí lo agrega aquí sin tocar
 * este componente. */
const TYPE_KEYS = Object.keys(PERMISSION_TYPES)

/**
 * Pestaña "Permisos" (Empresa → RRHH): reporte mensual de permisos, ausencias, reposos
 * médicos, llegadas tarde y salidas temprano por colaborador. Ver la solo requiere la
 * capacidad 'empresa.permisos' (nivel ≥ 3 por default); registrar/editar/eliminar
 * requiere 'empresa.permisos.manage' (nivel 4, o Sofía Lauretta por user_id — ver
 * ARQUITECTURA.md §2.6).
 */
export default function PermisosRrhhView({ companyId }) {
  const { can } = useAuth()
  const canManage = can('empresa.permisos.manage')

  const [employees, setEmployees] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT.getMonth() + 1)
  const [dialogEmployee, setDialogEmployee] = useState(null) // null cerrado | employee para historial
  const [showCreate, setShowCreate] = useState(false)
  const [deleteRow, setDeleteRow] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: emps, error: empError } = await loadCompanyEmployees(companyId)
      if (empError) throw empError
      const active = activeEmployees(emps ?? [])
      setEmployees(active)
      const userIds = active.map((e) => e.user_id)
      const rows = await fetchPermissionsByMonth(userIds, year, month)
      setRecords(rows)
    } catch (err) {
      setError(err.message ?? 'No se pudieron cargar los permisos.')
    } finally {
      setLoading(false)
    }
  }, [companyId, year, month])

  useEffect(() => {
    load()
  }, [load])

  // Realtime: cualquier cambio en employee_permissions refresca el mes visible.
  useEffect(() => {
    const channel = supabase
      .channel('empresa-permisos-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employee_permissions' },
        () => {
          load()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  const { rows, totals } = aggregatePermissionsByMonth(records, employees, year, month)

  async function handleDelete() {
    if (!deleteRow) return
    setDeleting(true)
    try {
      await deletePermission(deleteRow.id)
      setDeleteRow(null)
      await load()
    } catch (err) {
      setError(err.message ?? 'No se pudo eliminar el registro.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#e0ddd4] p-5">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-bold text-[#111]">Permisos</h2>
              <p className="text-[13.5px] text-[#888] mt-0.5">
                Permisos, ausencias, reposos médicos, llegadas tarde y salidas temprano del equipo,
                por mes.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <select
                aria-label="Mes"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="input-base w-auto"
              >
                {MONTHS.map((label, idx) => (
                  <option key={label} value={idx + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Año"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="input-base w-auto"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="px-3 py-1.5 rounded-lg text-[14px] font-bold bg-[#111] text-white hover:bg-[#222] transition-colors whitespace-nowrap flex-shrink-0"
                >
                  + Registrar novedad
                </button>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-[14px] text-red-600 mb-3">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-5 h-5 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-[14px] text-[#bbb] text-center py-10">No hay empleados activos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-[#ece9df] text-left text-[12px] font-mono font-bold uppercase tracking-[0.08em] text-[#aaa]">
                  <th className="py-2 pr-3 whitespace-nowrap">Empleado</th>
                  {TYPE_KEYS.map((key) => (
                    <th key={key} className="py-2 px-3 text-center whitespace-nowrap">
                      {PERMISSION_TYPES[key].plural}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-center whitespace-nowrap">Días</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.userId}
                    className="border-b border-[#f5f3eb] last:border-0 hover:bg-[#faf9f5] cursor-pointer"
                    onClick={() => setDialogEmployee(employees.find((e) => e.user_id === r.userId))}
                  >
                    <td className="py-2 pr-3 font-semibold text-[#111]">{r.name}</td>
                    {TYPE_KEYS.map((key) => (
                      <td key={key} className="py-2 px-3 text-center">
                        {r[key]}
                      </td>
                    ))}
                    <td className="py-2 pl-3 text-center">{r.dias}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#e0ddd4] font-bold text-[#111]">
                  <td className="py-2 pr-3">TOTAL</td>
                  {TYPE_KEYS.map((key) => (
                    <td key={key} className="py-2 px-3 text-center">
                      {totals[key]}
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-center">{totals.dias}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Historial de un empleado, al hacer clic en su fila */}
      {dialogEmployee && (
        <PermissionFormDialog
          employees={employees}
          companyId={companyId}
          fixedEmployee={dialogEmployee}
          canManage={canManage}
          onRequestDelete={setDeleteRow}
          onClose={() => setDialogEmployee(null)}
          onChange={load}
        />
      )}

      {/* Registrar novedad nueva, con selector de empleado */}
      {showCreate && (
        <PermissionFormDialog
          employees={employees}
          companyId={companyId}
          canManage={canManage}
          onRequestDelete={setDeleteRow}
          onClose={() => setShowCreate(false)}
          onChange={load}
        />
      )}

      {deleteRow && (
        <ConfirmDeleteDialog
          itemName={isoToDdmmyyyy(deleteRow.start_date)}
          itemLabel="registro"
          fieldLabel="Fecha de inicio"
          message={
            <>
              Esta acción <strong>no se puede deshacer</strong>. Vas a eliminar el registro de{' '}
              <strong>{PERMISSION_TYPES[deleteRow.type]?.label ?? deleteRow.type}</strong> del{' '}
              <strong>{isoToDdmmyyyy(deleteRow.start_date)}</strong> al{' '}
              <strong>{isoToDdmmyyyy(deleteRow.end_date)}</strong>. Para confirmar, escribe la fecha
              de inicio ({isoToDdmmyyyy(deleteRow.start_date)}) a continuación.
            </>
          }
          onConfirm={handleDelete}
          onCancel={() => setDeleteRow(null)}
          confirming={deleting}
        />
      )}
    </div>
  )
}
