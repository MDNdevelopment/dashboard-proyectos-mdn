import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AppLayout from './components/AppLayout.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import RequireModule from './components/RequireModule.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx'
import ResetPasswordPage from './pages/ResetPasswordPage.jsx'
import TicketsPage from './pages/TicketsPage.jsx'
import NotificationPreferencesPage from './pages/NotificationPreferencesPage.jsx'
import TicketAnalyticsPage from './pages/TicketAnalyticsPage.jsx'
import AdsPage from './pages/AdsPage.jsx'
import TareasPage from './pages/TareasPage.jsx'
import EmpresaPage from './pages/EmpresaPage.jsx'
import EvaluacionesPage from './pages/EvaluacionesPage.jsx'
import MetricasPage from './pages/MetricasPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>

            {/* Soporte Técnico */}
            <Route path="/tickets" element={<RequireModule moduleKey="tickets"><TicketsPage /></RequireModule>} />
            <Route path="/tickets/notificaciones" element={<RequireModule moduleKey="tickets"><NotificationPreferencesPage /></RequireModule>} />
            <Route path="/tickets/analytics" element={<RequireModule moduleKey="tickets"><TicketAnalyticsPage /></RequireModule>} />

            {/* Campañas */}
            <Route path="/ads" element={<RequireModule moduleKey="ads"><AdsPage /></RequireModule>} />

            {/* Tareas QC / Cierre */}
            <Route path="/tareas" element={<RequireModule moduleKey="tareas"><TareasPage /></RequireModule>} />

            {/* Empresa */}
            <Route path="/empresa" element={<RequireModule moduleKey="empresa"><EmpresaPage /></RequireModule>} />
            <Route path="/empresa/departamentos" element={<RequireModule moduleKey="empresa"><EmpresaPage /></RequireModule>} />
            <Route path="/empresa/empleados" element={<RequireModule moduleKey="empresa"><EmpresaPage /></RequireModule>} />
            <Route path="/empresa/preguntas" element={<RequireModule moduleKey="empresa"><EmpresaPage /></RequireModule>} />
            <Route path="/empresa/clientes" element={<RequireModule moduleKey="empresa"><EmpresaPage /></RequireModule>} />
            <Route path="/empresa/lineas" element={<RequireModule moduleKey="empresa"><EmpresaPage /></RequireModule>} />
            <Route path="/empresa/permisos" element={<RequireModule moduleKey="empresa"><EmpresaPage /></RequireModule>} />

            {/* Evaluaciones */}
            <Route path="/evaluaciones" element={<RequireModule moduleKey="evaluaciones"><EvaluacionesPage /></RequireModule>} />
            <Route path="/evaluaciones/resumen" element={<RequireModule moduleKey="evaluaciones"><EvaluacionesPage /></RequireModule>} />
            <Route path="/evaluaciones/perfil" element={<RequireModule moduleKey="evaluaciones"><EvaluacionesPage /></RequireModule>} />
            <Route path="/evaluaciones/empleado/:id" element={<RequireModule moduleKey="evaluaciones"><EvaluacionesPage /></RequireModule>} />
            <Route path="/evaluaciones/perfil-v2" element={<RequireModule moduleKey="evaluaciones"><EvaluacionesPage /></RequireModule>} />

            {/* Reportes */}
            <Route path="/reportes" element={<RequireModule moduleKey="reportes"><MetricasPage /></RequireModule>} />
            <Route path="/reportes/linea/:lineId" element={<RequireModule moduleKey="reportes"><MetricasPage /></RequireModule>} />

            {/* Proyectos — catch-all */}
            <Route path="/*" element={<App />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
