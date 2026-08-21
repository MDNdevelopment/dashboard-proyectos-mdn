import { generateAgendaText } from '../../utils/audiovisual'
import WhatsAppTextPanel from './WhatsAppTextPanel'

/** Genera el texto de agenda semanal de pautas programadas, listo para copiar a WhatsApp. */
export default function WhatsAppAgendaModal({ pautas, lines, usersById, onClose }) {
  const text = generateAgendaText(pautas, lines, usersById)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 backdrop-blur-sm bg-black/30"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white rounded-2xl border border-[#e0ddd4] shadow-xl w-full max-w-[460px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#ece9df]">
          <h3 className="text-[15px] font-bold text-[#111]">Agenda para WhatsApp</h3>
          <button
            onClick={onClose}
            className="text-[#999] hover:text-[#111] text-[20px] leading-none"
          >
            &times;
          </button>
        </div>
        <div className="px-4 py-3">
          <p className="text-[12px] text-[#999] mb-2">
            Generado del alcance actual. Revisa y copia al grupo.
          </p>
          <WhatsAppTextPanel text={text} height={320} />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#ece9df]">
          <button
            onClick={onClose}
            className="text-[13px] font-semibold text-[#555] px-3 py-1.5 hover:text-[#111]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
