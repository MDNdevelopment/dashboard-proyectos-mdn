import { useState } from 'react'
import Stepper from '../common/Stepper'
import { Block } from './CapturaSection'
import { upsertLote, deleteLote, updatePieza } from './avPautasApi'
import {
  FORMAT_KEYS,
  FORMAT_LABELS,
  FORMAT_ICONS,
  piezasPorFormato,
  lotesMatrix,
  loteFor,
  planLoteChange,
  isLegacyPiezas,
  legacyEditorSummary,
  editorRemovable,
  editorLabel,
  canActOnEditorGroup,
  pautaErrorMessage,
} from '../../utils/audiovisual'

/**
 * Edición: matriz editor × formato con dos contadores por celda — asignadas (cuántas le
 * tocan) y listas (cuántas entregó). Cada celda es un lote (`av_pauta_piezas.es_lote`).
 * El cupo de un formato es `salieron − asignadas a todos`, con `salieron` derivado de la
 * captura. Un editor puede mover solo sus "listas"; quien puede editar la pauta mueve todo.
 * Pautas con filas del modelo viejo (`isLegacyPiezas`) se muestran en solo lectura.
 */
export default function EdicionSection({
  pauta,
  piezas,
  editorUsers,
  usersById,
  canEdit,
  userId,
  companyId,
  onPiezaChanged,
  onPiezaDeleted,
}) {
  const [error, setError] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const activeFormats = FORMAT_KEYS.filter((code) => (pauta.formats ?? []).includes(code))
  const breakdown = piezasPorFormato(pauta)
  const legacy = isLegacyPiezas(piezas)
  const { editorIds, byEditor } = lotesMatrix(piezas)

  const asignadasPorFormato = {}
  activeFormats.forEach((code) => {
    asignadasPorFormato[code] = (piezas ?? [])
      .filter((pz) => pz.es_lote && pz.formato === code)
      .reduce((s, pz) => s + (Number(pz.cantidad) || 0), 0)
  })
  const cupo = (code) => Math.max(0, (breakdown[code]?.salieron ?? 0) - asignadasPorFormato[code])

  async function change(editorId, code, key, delta) {
    setError(null)
    const lote = loteFor(piezas, editorId, code)
    const plan = planLoteChange({ lote, key, delta, max: cupo(code) })
    if (plan.action === 'noop') {
      if (key === 'cantidad' && delta > 0 && cupo(code) === 0) {
        setError(
          `No queda nada por repartir de ${FORMAT_LABELS[code]}: registra más capturas arriba.`,
        )
      }
      return
    }
    if (plan.action === 'delete') {
      const { error: err } = await deleteLote(lote.id)
      if (err) setError(pautaErrorMessage(err))
      else onPiezaDeleted(lote.id)
      return
    }
    const { data, error: err } =
      plan.action === 'insert'
        ? await upsertLote(companyId, pauta.id, editorId, code, plan.fields, null)
        : await updatePieza(lote.id, plan.fields)
    if (err) setError(pautaErrorMessage(err))
    else if (data) onPiezaChanged(data)
  }

  async function removeEditor(editorId) {
    setError(null)
    const lotes = Object.values(byEditor.get(editorId) ?? {})
    for (const lote of lotes) {
      const { error: err } = await deleteLote(lote.id)
      if (err) {
        setError(pautaErrorMessage(err))
        return
      }
      onPiezaDeleted(lote.id)
    }
  }

  const sinCaptura = activeFormats.every((code) => (breakdown[code]?.salieron ?? 0) === 0)

  if (legacy) {
    const rows = legacyEditorSummary(piezas, usersById)
    return (
      <Block title="Edición" hint="registro anterior, solo lectura">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-[10.5px] font-mono uppercase tracking-wide text-[#999] text-left">
              <th className="py-1 pr-2">Editor</th>
              <th className="py-1 pr-2">Formato</th>
              <th className="py-1 pr-2 text-right">Asignadas</th>
              <th className="py-1 text-right">Listas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.editorId}-${r.formato}`} className="border-t border-[#f2efe6]">
                <td className="py-1.5 pr-2">{r.name}</td>
                <td className="py-1.5 pr-2 text-[#777]">
                  {r.formato ? FORMAT_LABELS[r.formato] : 'Sin formato'}
                </td>
                <td className="py-1.5 pr-2 text-right font-mono">{r.unidades}</td>
                <td className="py-1.5 text-right font-mono">{r.listas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>
    )
  }

  const available = (editorUsers ?? []).filter(
    (u) => !u.deleted_at && !editorIds.includes(u.user_id),
  )
  const visibleEditors = editorIds.filter((id) => id !== null)
  const huerfanos = byEditor.get(null)

  return (
    <Block
      title="Edición"
      hint="quién edita cuántas piezas"
      right={
        canEdit &&
        activeFormats.length > 0 &&
        (pickerOpen ? (
          <select
            autoFocus
            className="input-base input-compact w-auto"
            aria-label="Agregar editor"
            defaultValue=""
            onBlur={() => setPickerOpen(false)}
            onChange={(e) => {
              const id = e.target.value
              setPickerOpen(false)
              if (!id) return
              const code = activeFormats.find((c) => cupo(c) > 0) ?? activeFormats[0]
              change(id, code, 'cantidad', 1)
            }}
          >
            <option value="" disabled>
              Elegir editor…
            </option>
            {available.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.first_name} {u.last_name}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-[11.5px] font-semibold text-[#2563eb] hover:underline"
          >
            + agregar editor
          </button>
        ))
      }
    >
      {error && (
        <div
          className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]"
          role="alert"
        >
          {error}
        </div>
      )}
      {activeFormats.length === 0 ? (
        <p className="text-[12.5px] text-[#999]">Esta pauta no tiene formatos marcados.</p>
      ) : (
        <>
          {sinCaptura && (
            <p className="text-[12px] text-[#b98900] mb-2">
              Registra primero la captura: el cupo de edición sale de lo que salió de cada formato.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" aria-label="Edición por editor y formato">
              <thead>
                <tr className="text-left align-bottom">
                  <th className="py-1 pr-3 text-[10.5px] font-mono uppercase tracking-wide text-[#999]">
                    Editor
                  </th>
                  {activeFormats.map((code) => (
                    <th key={code} className="py-1 px-2">
                      <div className="text-[12px] font-semibold text-[#111]">
                        {FORMAT_ICONS[code]} {FORMAT_LABELS[code]}
                      </div>
                      <div className="text-[10.5px] font-mono text-[#999] font-normal">
                        salieron {breakdown[code]?.salieron ?? 0} · asignadas{' '}
                        {asignadasPorFormato[code]} · faltan {cupo(code)}
                      </div>
                    </th>
                  ))}
                  {canEdit && <th className="py-1 w-8" />}
                </tr>
              </thead>
              <tbody>
                {visibleEditors.length === 0 && !huerfanos && (
                  <tr>
                    <td
                      colSpan={activeFormats.length + 2}
                      className="py-3 text-[12.5px] text-[#bbb] border-t border-[#f2efe6]"
                    >
                      Sin editores asignados.
                    </td>
                  </tr>
                )}
                {visibleEditors.map((editorId) => (
                  <EditorRow
                    key={editorId}
                    editorId={editorId}
                    name={editorLabel(editorId, usersById)}
                    lotes={byEditor.get(editorId) ?? {}}
                    activeFormats={activeFormats}
                    canEdit={canEdit}
                    canAct={canActOnEditorGroup({ canEditPiezas: canEdit, userId, editorId })}
                    cupo={cupo}
                    onChange={change}
                    onRemove={removeEditor}
                  />
                ))}
                {huerfanos && (
                  <EditorRow
                    editorId={null}
                    name="Sin editor"
                    lotes={huerfanos}
                    activeFormats={activeFormats}
                    canEdit={canEdit}
                    canAct={canEdit}
                    cupo={cupo}
                    onChange={change}
                    onRemove={removeEditor}
                  />
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Block>
  )
}

function EditorRow({
  editorId,
  name,
  lotes,
  activeFormats,
  canEdit,
  canAct,
  cupo,
  onChange,
  onRemove,
}) {
  const removable = editorRemovable(Object.values(lotes))
  return (
    <tr className="border-t border-[#f2efe6] align-top">
      <td className="py-2 pr-3 text-[13px] text-[#111] whitespace-nowrap">{name}</td>
      {activeFormats.map((code) => {
        const lote = lotes[code]
        const cantidad = Number(lote?.cantidad) || 0
        const listas = Number(lote?.listas) || 0
        return (
          <td key={code} className="py-2 px-2">
            <div className="flex items-center gap-3">
              <Counter
                label="asignadas"
                value={cantidad}
                editable={canEdit}
                max={cantidad + cupo(code)}
                onChange={(d) => onChange(editorId, code, 'cantidad', d)}
                aria={`asignadas de ${FORMAT_LABELS[code]} a ${name}`}
              />
              <Counter
                label="listas"
                value={listas}
                editable={canAct && cantidad > 0}
                max={cantidad}
                onChange={(d) => onChange(editorId, code, 'listas', d)}
                aria={`listas de ${FORMAT_LABELS[code]} de ${name}`}
              />
            </div>
          </td>
        )
      })}
      {canEdit && (
        <td className="py-2 text-right">
          {editorId !== null && (
            <button
              type="button"
              onClick={() => onRemove(editorId)}
              disabled={!removable}
              title={removable ? 'Quitar editor' : 'Tiene piezas entregadas; no se puede quitar'}
              aria-label={`Quitar a ${name}`}
              className="w-6 h-6 rounded-md text-[#c0392b] hover:bg-[#fdecec] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          )}
        </td>
      )}
    </tr>
  )
}

function Counter({ label, value, editable, max, onChange, aria }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] font-mono uppercase tracking-wide text-[#aaa]">{label}</span>
      {editable ? (
        <Stepper value={value} onChange={onChange} max={max} label={aria} />
      ) : (
        <span className="font-mono text-[13px] font-semibold text-[#333] px-1">{value}</span>
      )}
    </div>
  )
}
