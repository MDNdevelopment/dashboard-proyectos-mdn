import FeedbackListView from '../components/feedback/FeedbackListView'

/**
 * Panel de administración del buzón anónimo. Solo accesible para admins
 * (ver <RequireAdmin> en main.jsx). Ver ARQUITECTURA.md → módulo "Buzón anónimo".
 */
export default function FeedbackPage() {
  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-[26px] font-bold text-[#111] leading-tight">Buzón anónimo</h1>
          <p className="text-[15px] text-[#888] mt-0.5">
            Sugerencias y errores reportados por el equipo, sin autor
          </p>
        </div>

        <FeedbackListView />
      </div>
    </main>
  )
}
