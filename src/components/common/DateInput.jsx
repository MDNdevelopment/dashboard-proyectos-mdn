import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  format,
  parseISO,
  setMonth,
  setYear,
  getYear,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { isoToDdmmyyyy, parseDdmmyyyy } from '../../utils/formatDate'

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const MONTHS_PER_YEAR = 12
const YEARS_PER_PAGE = 12

/**
 * Selector de fecha con formato venezolano DD/MM/YYYY, independiente del
 * idioma/región del navegador del usuario.
 *
 * Por qué existe: <input type="date"> nativo muestra el formato según el
 * locale del SO/navegador (p. ej. MM/DD/YYYY en configuración US), y eso no
 * se puede forzar por HTML/CSS/JS. Un empleado con navegador en inglés que
 * escribe "11/01" pensando en 11 de enero termina guardando 1 de noviembre.
 * Este componente fija DD/MM/YYYY siempre, tanto al escribir como al elegir
 * del calendario, y sigue guardando/recibiendo ISO YYYY-MM-DD como el resto
 * del sistema espera.
 *
 * Props:
 *   value       — fecha ISO "YYYY-MM-DD" o '' (controlado)
 *   onChange    — (isoString | '') => void
 *   disabled    — bool
 *   min, max    — fechas ISO opcionales, límites seleccionables
 *   required    — bool, pasado al input de texto subyacente para validación HTML
 *   placeholder — string, default "dd/mm/aaaa"
 *   clearable   — bool, default true — muestra botón para vaciar
 *   id          — string, para <label htmlFor>
 *   className   — clases adicionales (se agregan a input-base)
 */
export default function DateInput({
  value = '',
  onChange,
  disabled = false,
  min,
  max,
  required = false,
  placeholder = 'dd/mm/aaaa',
  clearable = true,
  id,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => isoToDdmmyyyy(value))
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const [viewMonth, setViewMonth] = useState(() => (value ? parseISO(value) : new Date()))
  // Nivel de navegación del calendario: 'days' (default) -> 'months' -> 'years'.
  // Permite saltar de año en pocos clics en vez de recorrer mes a mes (p. ej.
  // para poner una fecha de nacimiento de hace 25 años).
  const [pickerView, setPickerView] = useState('days')
  // Página de la rejilla de años que se está mostrando (inicio de un bloque de
  // YEARS_PER_PAGE años). Se recalcula al entrar a la vista de años.
  const [yearsPageStart, setYearsPageStart] = useState(
    () => Math.floor(getYear(new Date()) / YEARS_PER_PAGE) * YEARS_PER_PAGE,
  )
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  // Mantener el texto sincronizado si `value` cambia desde afuera (p. ej. al
  // cargar el formulario o resetearlo), salvo mientras el usuario está
  // escribiendo (el popover abierto implica edición activa).
  useEffect(() => {
    if (!open) setText(isoToDdmmyyyy(value))
  }, [value, open])

  function withinRange(iso) {
    if (min && iso < min) return false
    if (max && iso > max) return false
    return true
  }

  function openPicker() {
    if (disabled || open) return
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const popH = 320
    const top = window.innerHeight - r.bottom < popH + 8 ? r.top - popH - 4 : r.bottom + 4
    setPos({ top, left: r.left, width: Math.max(r.width, 260) })
    const initial = value ? parseISO(value) : new Date()
    setViewMonth(initial)
    setPickerView('days')
    setYearsPageStart(Math.floor(getYear(initial) / YEARS_PER_PAGE) * YEARS_PER_PAGE)
    setOpen(true)
  }

  function closePicker() {
    setOpen(false)
    setText(isoToDdmmyyyy(value))
  }

  useEffect(() => {
    if (!open) return
    const fn = (e) => {
      if (!popoverRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        closePicker()
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  function handleTextChange(e) {
    const raw = e.target.value
    setText(raw)
    if (raw === '') {
      onChange('')
      return
    }
    const iso = parseDdmmyyyy(raw)
    if (iso && withinRange(iso)) onChange(iso)
  }

  function selectDay(day) {
    const iso = format(day, 'yyyy-MM-dd')
    if (!withinRange(iso)) return
    onChange(iso)
    setText(isoToDdmmyyyy(iso))
    setOpen(false)
  }

  function selectMonth(monthIndex) {
    setViewMonth((m) => setMonth(m, monthIndex))
    setPickerView('days')
  }

  function selectYear(year) {
    setViewMonth((m) => setYear(m, year))
    setPickerView('months')
  }

  function clear(e) {
    e.stopPropagation()
    onChange('')
    setText('')
  }

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 })
    const arr = []
    let d = start
    while (d <= end) {
      arr.push(d)
      d = addDays(d, 1)
    }
    return arr
  }, [viewMonth])

  // Un mes/año está deshabilitado solo si NINGÚN día dentro de él cae en
  // [min, max] — igual criterio que "fuera de mes" en la vista de días, pero
  // a nivel de mes/año completo.
  function monthDisabled(year, monthIndex) {
    const first = format(new Date(year, monthIndex, 1), 'yyyy-MM-dd')
    const last = format(endOfMonth(new Date(year, monthIndex, 1)), 'yyyy-MM-dd')
    if (min && last < min) return true
    if (max && first > max) return true
    return false
  }

  function yearDisabled(year) {
    const first = `${year}-01-01`
    const last = `${year}-12-31`
    if (min && last < min) return true
    if (max && first > max) return true
    return false
  }

  const selectedDate = value ? parseISO(value) : null
  const today = new Date()

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={triggerRef}
          id={id}
          type="text"
          inputMode="numeric"
          className={`input-base pr-9 ${className}`}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={handleTextChange}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closePicker()
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            openPicker()
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#999] hover:text-[#555] transition-colors disabled:opacity-40"
          aria-label="Abrir calendario"
          tabIndex={-1}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" />
            <path d="M1.5 6h13M4.5 1v3M11.5 1v3" strokeLinecap="round" />
          </svg>
        </button>
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-[#ccc] hover:text-[#555] transition-colors"
            aria-label="Limpiar fecha"
            tabIndex={-1}
          >
            <svg
              width="11"
              height="11"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 9999,
            }}
            className="bg-white border border-[#e8e5db] rounded-xl shadow-lg p-3"
          >
            {pickerView === 'days' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => subMonths(m, 1))}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                    aria-label="Mes anterior"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M6 1L2 4l4 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerView('months')}
                    className="text-[13px] font-semibold text-[#111] capitalize rounded-md px-2 py-0.5 hover:bg-[#f5f3eb] transition-colors"
                  >
                    {format(viewMonth, 'MMMM yyyy', { locale: es })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => addMonths(m, 1))}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                    aria-label="Mes siguiente"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M2 1l4 3-4 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {WEEKDAY_LABELS.map((w) => (
                    <span
                      key={w}
                      className="text-[10.5px] font-mono text-[#aaa] text-center uppercase"
                    >
                      {w}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {days.map((day) => {
                    const iso = format(day, 'yyyy-MM-dd')
                    const outOfMonth = !isSameMonth(day, viewMonth)
                    const isSelected = selectedDate && isSameDay(day, selectedDate)
                    const isToday = isSameDay(day, today)
                    const disabledDay = !withinRange(iso)
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={disabledDay}
                        onClick={() => selectDay(day)}
                        className={[
                          'text-[12.5px] rounded-md py-1.5 transition-colors',
                          disabledDay
                            ? 'text-[#ddd] cursor-not-allowed'
                            : outOfMonth
                              ? 'text-[#ccc] hover:bg-[#f5f3eb]'
                              : 'text-[#333] hover:bg-[#f5f3eb]',
                          isSelected ? '!bg-[#111] !text-white font-semibold' : '',
                          isToday && !isSelected ? 'font-bold text-[#FAB51A]' : '',
                        ].join(' ')}
                      >
                        {day.getDate()}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {pickerView === 'months' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => subMonths(m, 12))}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                    aria-label="Año anterior"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M6 1L2 4l4 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setYearsPageStart(
                        Math.floor(getYear(viewMonth) / YEARS_PER_PAGE) * YEARS_PER_PAGE,
                      )
                      setPickerView('years')
                    }}
                    className="text-[13px] font-semibold text-[#111] rounded-md px-2 py-0.5 hover:bg-[#f5f3eb] transition-colors"
                  >
                    {getYear(viewMonth)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => addMonths(m, 12))}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                    aria-label="Año siguiente"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M2 1l4 3-4 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: MONTHS_PER_YEAR }, (_, m) => {
                    const label = format(new Date(2000, m, 1), 'MMM', { locale: es })
                    const year = getYear(viewMonth)
                    const isSelected = m === viewMonth.getMonth()
                    const disabledMonth = monthDisabled(year, m)
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={disabledMonth}
                        onClick={() => selectMonth(m)}
                        className={[
                          'text-[12.5px] rounded-md py-2 capitalize transition-colors',
                          disabledMonth
                            ? 'text-[#ddd] cursor-not-allowed'
                            : 'text-[#333] hover:bg-[#f5f3eb]',
                          isSelected ? '!bg-[#111] !text-white font-semibold' : '',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {pickerView === 'years' && (
              <>
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setYearsPageStart((y) => y - YEARS_PER_PAGE)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                    aria-label="Años anteriores"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M6 1L2 4l4 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <p className="text-[13px] font-semibold text-[#111]">
                    {yearsPageStart}–{yearsPageStart + YEARS_PER_PAGE - 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => setYearsPageStart((y) => y + YEARS_PER_PAGE)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-[#888] hover:bg-[#f5f3eb] transition-colors"
                    aria-label="Años siguientes"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M2 1l4 3-4 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearsPageStart + i).map(
                    (year) => {
                      const isSelected = year === getYear(viewMonth)
                      const disabledYear = yearDisabled(year)
                      return (
                        <button
                          key={year}
                          type="button"
                          disabled={disabledYear}
                          onClick={() => selectYear(year)}
                          className={[
                            'text-[12.5px] rounded-md py-2 transition-colors',
                            disabledYear
                              ? 'text-[#ddd] cursor-not-allowed'
                              : 'text-[#333] hover:bg-[#f5f3eb]',
                            isSelected ? '!bg-[#111] !text-white font-semibold' : '',
                          ].join(' ')}
                        >
                          {year}
                        </button>
                      )
                    },
                  )}
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
