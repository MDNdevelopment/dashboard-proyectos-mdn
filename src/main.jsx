import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import AppLayout from './components/AppLayout.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
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
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/tickets/notificaciones" element={<NotificationPreferencesPage />} />
            <Route path="/tickets/analytics" element={<TicketAnalyticsPage />} />
            <Route path="/ads" element={<AdsPage />} />
            <Route path="/tareas" element={<TareasPage />} />
            <Route path="/empresa" element={<EmpresaPage />} />
            <Route path="/empresa/departamentos" element={<EmpresaPage />} />
            <Route path="/empresa/empleados" element={<EmpresaPage />} />
            <Route path="/empresa/preguntas" element={<EmpresaPage />} />
            <Route path="/empresa/clientes" element={<EmpresaPage />} />
            <Route path="/empresa/lineas" element={<EmpresaPage />} />
            <Route path="/evaluaciones" element={<EvaluacionesPage />} />
            <Route path="/evaluaciones/resumen" element={<EvaluacionesPage />} />
            <Route path="/evaluaciones/perfil" element={<EvaluacionesPage />} />
            <Route path="/evaluaciones/empleado/:id" element={<EvaluacionesPage />} />
            <Route path="/evaluaciones/perfil-v2" element={<EvaluacionesPage />} />
            <Route path="/metricas" element={<MetricasPage />} />
            <Route path="/metricas/linea/:lineId" element={<MetricasPage />} />
            <Route path="/*" element={<App />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
