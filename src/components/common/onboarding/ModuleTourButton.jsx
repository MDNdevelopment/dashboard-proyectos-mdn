import { useCallback, useEffect, useRef, useState } from 'react'
import { useModuleTour } from './useModuleTour'
import { useTourProgress } from './useTourProgress'

/**
 * Botón ⓘ junto al título de un módulo: abre el menú de recorridos guiados disponibles
 * para quien mira (`tours` ya viene filtrado por permisos) y arranca el que elija. La
 * primera vez que alguien entra al módulo (`autoOpen`) se abre solo el menú, sin forzar
 * ningún recorrido; cerrarlo cuenta como visto.
 */
export default function ModuleTourButton({
  moduleKey,
  userId,
  tours,
  onBeforeStep,
  // `ready`: la pantalla ya cargó. Hasta entonces el botón está en espera, porque un
  // recorrido iniciado antes no encuentra los elementos que debe señalar.
  ready = true,
  autoOpen = false,
}) {
  const progress = useTourProgress(moduleKey, userId)
  const { markDone, markMenuSeen } = progress
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const { start } = useModuleTour({
    onBeforeStep,
    onFinish: (tour) => markDone(tour.id),
  })

  const closeMenu = useCallback(() => {
    setOpen(false)
    markMenuSeen()
  }, [markMenuSeen])

  useEffect(() => {
    if (ready && autoOpen && !progress.menuSeen && tours.length > 0) setOpen(true)
  }, [ready, autoOpen, progress.menuSeen, tours.length])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && closeMenu()
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closeMenu()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open, closeMenu])

  if (tours.length === 0) return null
  // Hasta que la persona haya visto algún recorrido el botón se anuncia solo.
  const llamar = progress.done.length === 0

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-label="Guía del módulo"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!ready}
        title={ready ? 'Guía del módulo' : 'La guía estará lista cuando termine de cargar'}
        onClick={() => (open ? closeMenu() : setOpen(true))}
        className={`relative inline-flex items-center gap-1.5 h-8 pl-1.5 pr-3 rounded-full border text-[13px] font-semibold leading-none transition-colors ${
          open
            ? 'bg-[#FFB800] border-[#FFB800] text-[#111]'
            : llamar
              ? 'bg-[#FFB80026] border-[#FFB800] text-[#7a5b00] hover:bg-[#FFB80040]'
              : 'bg-white border-[#d8d4c6] text-[#777] hover:border-[#FFB800] hover:text-[#111]'
        } disabled:opacity-50 disabled:cursor-wait disabled:hover:border-[#d8d4c6]`}
      >
        {/* Mientras no haya visto ningún recorrido, un aro suave llama la atención. */}
        {llamar && !open && ready && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#FFB800] motion-safe:animate-ping opacity-60"
          />
        )}
        <span
          aria-hidden="true"
          className={`flex items-center justify-center w-5 h-5 rounded-full font-mono text-[12px] font-bold ${
            open || llamar ? 'bg-[#FFB800] text-[#111]' : 'bg-[#ece9de] text-[#777]'
          }`}
        >
          i
        </span>
        <span>{llamar ? '¿Necesitas ayuda?' : 'Guía'}</span>
      </button>

      {open && ready && (
        <div
          role="menu"
          aria-label="Recorridos guiados"
          className="absolute left-0 top-10 z-30 w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-[#e8e4d8] bg-white shadow-lg p-2"
        >
          <p className="px-2 pt-1 pb-2 text-[11.5px] font-mono uppercase tracking-wide text-[#999]">
            ¿Qué quieres aprender?
          </p>
          {tours.map((tour) => {
            const hecho = progress.done.includes(tour.id)
            return (
              <button
                key={tour.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu()
                  start(tour)
                }}
                className="w-full text-left rounded-lg px-2 py-2 hover:bg-[#faf9f5] flex items-start gap-2"
              >
                <span
                  className={`mt-0.5 w-4 text-[13px] font-bold ${hecho ? 'text-[#1f8a43]' : 'text-transparent'}`}
                  aria-label={hecho ? 'Ya lo viste' : undefined}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-[#111]">{tour.titulo}</span>
                  <span className="block text-[12.5px] text-[#777] leading-snug">
                    {tour.descripcion}
                  </span>
                  <span className="block text-[11px] font-mono text-[#aaa] mt-0.5">
                    {tour.steps.length} pasos
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
