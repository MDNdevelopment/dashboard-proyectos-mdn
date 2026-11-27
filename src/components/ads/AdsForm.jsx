import { useState, useRef } from 'react'
import { supabase } from '../../supabase'
import { useAuth } from '../../context/AuthContext'
import { STATUSES } from './constants'
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges'
import { useScopedClients } from '../../hooks/useScopedClients'
import DateInput from '../common/DateInput'
import CampaignChecklist from './CampaignChecklist'
import { carryOverItem, isWebUrl, normalizeDriveUrl, parseDriveId } from '../../utils/tacticas'
import { updateHandoff } from './tacticas/tacticasApi'

/**
 * Formulario de táctica (crear/editar).
 * `prefill` ({ client_id, client }) precarga la marca al crear desde "Por hacer" o la ficha.
 * `insumos` ([{ handoff, source, content }]): insumos pendientes; al crear para una marca con
 * insumo se ofrece arrastrar sus acciones pendientes. `onInsumosUsed(ids)` avisa cuáles se usaron.
 * `jefaOf(clientId)` → `{ id, name } | null`: la táctica no tiene un responsable que se elija;
 * al crearla se asigna a la jefa del team de la marca. Al editar se conserva la que tenía.
 * Las fechas son opcionales ("Sin fecha"), pero si se pone una hay que poner las dos.
 */
export default function AdsForm({
  campaign,
  prefill = null,
  insumos = [],
  onInsumosUsed,
  onClose,
  onCreated,
  onUpdated,
  jefaOf = () => null,
}) {
  const { userProfile } = useAuth()
  const isEdit = campaign != null

  const [fields, setFields] = useState({
    start_date: campaign?.start_date ?? '',
    end_date: campaign?.end_date ?? '',
    name: campaign?.name ?? '',
    client: campaign?.client ?? prefill?.client ?? '',
    client_id: campaign?.client_id ?? prefill?.client_id ?? '',
    assignee: campaign?.assignee ?? '',
    objective: campaign?.objective ?? '',
    drive_url: campaign?.drive_url ?? '',
    drive_folder_url: campaign?.drive_folder_url ?? '',
    presentation_url: campaign?.presentation_url ?? '',
    status: campaign?.status ?? 'Pendiente',
    notes: campaign?.notes ?? '',
    checklist: campaign?.checklist ?? [],
  })
  const initialFields = useRef(fields)
  const { requestClose } = useUnsavedChanges({
    value: fields,
    baseline: initialFields.current,
    onClose,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const { clients, loading: loadingClients } = useScopedClients(
    userProfile?.company_id,
    userProfile,
    campaign?.client_id,
  )

  const jefa = fields.client_id ? jefaOf(fields.client_id) : null

  function set(key, val) {
    setFields((prev) => ({ ...prev, [key]: val }))
  }

  function handleClientChange(e) {
    const id = e.target.value
    const c = clients.find((x) => x.id === id)
    setFields((prev) => ({
      ...prev,
      client_id: id,
      client: c?.name ?? '',
      // Lo arrastrado venía del insumo de la marca anterior: no aplica a la nueva.
      checklist: prev.checklist.filter((it) => !it.carried_from),
    }))
  }

  // Insumos de la marca elegida con algo pendiente. Solo al crear: editar no arrastra.
  const carryInsumos = isEdit
    ? []
    : insumos.filter(
        (i) => i.handoff.client_id === fields.client_id && i.content.pending.length > 0,
      )

  function isCarried(item, sourceId) {
    return fields.checklist.some((it) => it.id === item.id && it.carried_from === sourceId)
  }

  function toggleCarry(item, sourceId) {
    setFields((prev) => ({
      ...prev,
      checklist: prev.checklist.some((it) => it.id === item.id && it.carried_from === sourceId)
        ? prev.checklist.filter((it) => !(it.id === item.id && it.carried_from === sourceId))
        : [...prev.checklist, carryOverItem(item, sourceId)],
    }))
  }

  function carryAll(insumo) {
    setFields((prev) => {
      const missing = insumo.content.pending.filter(
        (item) =>
          !prev.checklist.some((it) => it.id === item.id && it.carried_from === insumo.source.id),
      )
      return {
        ...prev,
        checklist: [...prev.checklist, ...missing.map((i) => carryOverItem(i, insumo.source.id))],
      }
    })
  }

  // Los links de Drive son opcionales, pero si vienen tienen que ser de Drive/Docs reconocibles.
  const driveUrl = normalizeDriveUrl(fields.drive_url)
  const driveInvalid = driveUrl !== null && parseDriveId(driveUrl) === null
  const folderUrl = normalizeDriveUrl(fields.drive_folder_url)
  const folderInvalid = folderUrl !== null && parseDriveId(folderUrl) === null
  // La táctica presentación puede estar en Netlify u otra página: basta con que sea un link web.
  const presentationUrl = normalizeDriveUrl(fields.presentation_url)
  const presentationInvalid = presentationUrl !== null && !isWebUrl(presentationUrl)

  // Sin fecha está permitido (se agrega después), pero una sola fecha no.
  const halfDated = !fields.start_date !== !fields.end_date
  const datesReversed =
    !!fields.start_date && !!fields.end_date && fields.end_date < fields.start_date
  const datesInvalid = halfDated || datesReversed

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fields.name.trim() || !fields.client_id) return
    if (driveInvalid || folderInvalid || presentationInvalid || datesInvalid) return
    setSubmitting(true)
    setError(null)

    const payload = {
      ...fields,
      start_date: fields.start_date || null,
      end_date: fields.end_date || null,
      objective: fields.objective.trim() || null,
      drive_url: driveUrl,
      drive_folder_url: folderUrl,
      presentation_url: presentationUrl,
    }
    // Al crear, la táctica es de la jefa del team de la marca (no hay responsable que elegir).
    if (!isEdit) payload.assignee = jefa?.id ?? ''

    if (isEdit) {
      const { data, error: err } = await supabase
        .from('campaigns')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', campaign.id)
        .select()
        .single()
      setSubmitting(false)
      if (err) {
        setError('Error al actualizar la táctica.')
        return
      }
      onUpdated(data)
      onClose()
    } else {
      const { data, error: err } = await supabase
        .from('campaigns')
        .insert({ ...payload, created_by: userProfile.user_id })
        .select()
        .single()
      setSubmitting(false)
      if (err) {
        setError('Error al crear la táctica.')
        return
      }
      // Los insumos de los que se arrastró algo pasan a "usado". Si esto falla la táctica ya está
      // creada: no se bloquea nada, el insumo simplemente sigue pendiente y se puede descartar.
      const used = carryInsumos.filter(({ source }) =>
        fields.checklist.some((it) => it.carried_from === source.id),
      )
      if (used.length > 0) {
        const results = await Promise.all(
          used.map(({ handoff }) =>
            updateHandoff(handoff.id, { status: 'usado', consumed_by_campaign_id: data.id }),
          ),
        )
        const usedIds = used.filter((_, i) => !results[i].error).map(({ handoff }) => handoff.id)
        if (usedIds.length > 0) onInsumosUsed?.(usedIds)
      }
      onCreated(data)
      onClose()
      if (!payload.assignee) return
      supabase.functions
        .invoke('notify-campaign-assignee', {
          body: {
            assignee_id: payload.assignee,
            campaign_name: fields.name,
            created_by_name: `${userProfile.first_name} ${userProfile.last_name}`,
          },
        })
        .catch(console.error)
    }
  }

  const labelClass =
    'block text-[13px] font-mono font-bold tracking-widest uppercase text-[#888] mb-1.5'

  // ¿La táctica heredada tenía un cliente escrito a mano sin client_id?
  const legacyClientName = isEdit && !campaign.client_id && campaign.client ? campaign.client : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 px-6 pt-6 pb-5 border-b border-[#ece9df] flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-[#111]">
            {isEdit ? 'Editar táctica' : 'Nueva táctica'}
          </h2>
          <button
            onClick={requestClose}
            className="text-[#999] hover:text-[#111] transition-colors p-1"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 2l12 12M14 2L2 14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form
          id="ads-campaign-form"
          onSubmit={handleSubmit}
          className="px-6 py-5 overflow-y-auto flex-1"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fecha inicio */}
            <div>
              <label className={labelClass}>Fecha inicio</label>
              <DateInput
                className="w-full"
                value={fields.start_date}
                onChange={(v) => set('start_date', v)}
              />
            </div>

            {/* Fecha fin */}
            <div>
              <label className={labelClass}>Fecha fin</label>
              <DateInput
                className="w-full"
                value={fields.end_date}
                onChange={(v) => set('end_date', v)}
              />
            </div>
            <p
              className={`col-span-1 sm:col-span-2 -mt-2 text-[12.5px] ${
                datesInvalid ? 'text-red-600' : 'text-[#999]'
              }`}
            >
              {halfDated
                ? 'Pon las dos fechas, o ninguna si todavía no las sabes.'
                : datesReversed
                  ? 'La fecha fin no puede ser anterior al inicio.'
                  : 'Si todavía no tiene fechas, déjalas vacías: queda como «Sin fecha» y se agregan después.'}
            </p>

            {/* Táctica — full width */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Táctica</label>
              <input
                type="text"
                className="input-base w-full"
                placeholder="Nombre de la táctica"
                value={fields.name}
                onChange={(e) => set('name', e.target.value)}
                required
              />
            </div>

            {/* Cliente — desplegable desde metric_clients */}
            <div>
              <label className={labelClass}>Cliente / Marca</label>
              {loadingClients ? (
                <div className="input-base w-full text-[#bbb] text-[14.5px]">
                  Cargando clientes…
                </div>
              ) : clients.length === 0 ? (
                <div className="input-base w-full text-[#bbb] text-[14.5px]">
                  No hay clientes.{' '}
                  <span className="text-[#888]">Créalos en Empresa → Clientes</span>
                </div>
              ) : (
                <>
                  <select
                    className="input-base w-full"
                    value={fields.client_id}
                    onChange={handleClientChange}
                    required
                  >
                    <option value="">— Seleccionar cliente —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {/* Hint: táctica heredada con nombre pero sin client_id */}
                  {legacyClientName && !fields.client_id && (
                    <p className="mt-1 text-[12.5px] text-[#F0871F]">
                      Cliente previo: <span className="font-semibold">{legacyClientName}</span> —
                      elige uno de la lista para actualizar el vínculo.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Jefa del team: sale de la línea de la marca, no se elige */}
            <div>
              <p className={labelClass}>Jefa del team</p>
              <div className="input-base w-full text-[14.5px] bg-[#faf9f5] text-[#555]">
                {!fields.client_id ? (
                  <span className="text-[#bbb]">Elige la marca</span>
                ) : (
                  (jefa?.name ?? <span className="text-[#bbb]">La marca no tiene team</span>)
                )}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className={labelClass}>Estado</label>
              <select
                className="input-base w-full"
                value={fields.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Objetivo general — full width */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass} htmlFor="tactica-objetivo">
                Objetivo general
              </label>
              <textarea
                id="tactica-objetivo"
                className="input-base w-full resize-none"
                rows={2}
                placeholder="Qué busca lograr esta táctica"
                value={fields.objective}
                onChange={(e) => set('objective', e.target.value)}
              />
            </div>

            {/* Link al documento de la táctica en Drive — full width */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass} htmlFor="tactica-drive">
                Documento de la táctica (Drive)
              </label>
              <input
                id="tactica-drive"
                type="url"
                className="input-base w-full"
                placeholder="https://drive.google.com/…"
                value={fields.drive_url}
                onChange={(e) => set('drive_url', e.target.value)}
              />
              {driveInvalid ? (
                <p className="mt-1 text-[12.5px] text-red-600">
                  Ese link no parece ser de Google Drive. Pega el del documento de la táctica.
                </p>
              ) : (
                <p className="mt-1 text-[12.5px] text-[#999]">
                  El deck, PDF o carpeta de la táctica. El detalle vive en el Drive.
                </p>
              )}
            </div>

            {/* Táctica presentación: la táctica publicada como página web (Netlify u otra) */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass} htmlFor="tactica-presentacion">
                Táctica presentación (link)
              </label>
              <input
                id="tactica-presentacion"
                type="url"
                className="input-base w-full"
                placeholder="https://….netlify.app"
                value={fields.presentation_url}
                onChange={(e) => set('presentation_url', e.target.value)}
              />
              {presentationInvalid ? (
                <p className="mt-1 text-[12.5px] text-red-600">
                  Ese link no es válido. Pega la dirección completa, con https://.
                </p>
              ) : (
                <p className="mt-1 text-[12.5px] text-[#999]">
                  Si la táctica se presentó como página web (por ejemplo en Netlify).
                </p>
              )}
            </div>

            {/* Link a la carpeta de la marca en TÁCTICAS MDN — full width */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass} htmlFor="tactica-carpeta">
                Carpeta de la marca (Drive)
              </label>
              <input
                id="tactica-carpeta"
                type="url"
                className="input-base w-full"
                placeholder="https://drive.google.com/drive/folders/…"
                value={fields.drive_folder_url}
                onChange={(e) => set('drive_folder_url', e.target.value)}
              />
              {folderInvalid ? (
                <p className="mt-1 text-[12.5px] text-red-600">
                  Ese link no parece ser de Google Drive. Pega el de la carpeta de la marca.
                </p>
              ) : (
                <p className="mt-1 text-[12.5px] text-[#999]">
                  La carpeta de la marca en TÁCTICAS MDN, con su brief y todas sus tácticas.
                </p>
              )}
            </div>

            {/* Notas — full width */}
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Notas</label>
              <textarea
                className="input-base w-full resize-none"
                rows={3}
                placeholder="Observaciones adicionales"
                value={fields.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>

            {/* Pendientes de la táctica anterior de esta marca — full width */}
            {carryInsumos.length > 0 && (
              <div className="col-span-1 sm:col-span-2 rounded-xl border border-[#bcd7f5] bg-[#eef6ff] p-3.5 space-y-3">
                <p className={labelClass}>Pendientes de la táctica anterior</p>
                {carryInsumos.map((insumo) => (
                  <fieldset key={insumo.handoff.id} className="space-y-1.5">
                    <legend className="text-[13.5px] font-semibold text-[#111] mb-1">
                      De «{insumo.source.name}»
                    </legend>
                    {insumo.content.pending.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 text-[14px] text-[#333]"
                      >
                        <input
                          type="checkbox"
                          checked={isCarried(item, insumo.source.id)}
                          onChange={() => toggleCarry(item, insumo.source.id)}
                          className="h-4 w-4 rounded border-[#e0ddd4] accent-[#FFB800] flex-shrink-0"
                        />
                        {item.title || '—'}
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() => carryAll(insumo)}
                      className="text-[13px] font-semibold text-[#1565c0] hover:underline"
                    >
                      Arrastrar todas
                    </button>
                  </fieldset>
                ))}
              </div>
            )}

            {/* Checklist de acciones — full width */}
            <div className="col-span-1 sm:col-span-2">
              <CampaignChecklist value={fields.checklist} onChange={(v) => set('checklist', v)} />
            </div>
          </div>

          {error && <p className="text-[14px] text-red-600 mt-3">{error}</p>}
        </form>

        <div className="flex-shrink-0 flex gap-3 px-6 py-4 border-t border-[#ece9df]">
          <button
            type="button"
            onClick={requestClose}
            className="flex-1 py-2.5 rounded-xl border border-[#e0ddd4] text-[15px] font-semibold text-[#555] hover:bg-[#f5f3eb] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="ads-campaign-form"
            disabled={
              submitting ||
              !fields.name.trim() ||
              !fields.client_id ||
              datesInvalid ||
              driveInvalid ||
              folderInvalid ||
              presentationInvalid
            }
            className="flex-1 py-2.5 rounded-xl bg-[#111] text-white text-[15px] font-bold hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {submitting
              ? isEdit
                ? 'Guardando...'
                : 'Creando...'
              : isEdit
                ? 'Guardar cambios'
                : 'Crear táctica'}
          </button>
        </div>
      </div>
    </div>
  )
}
