import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import EmployeeEvalList from "../components/evaluaciones/EmployeeEvalList";
import EmployeeProfileView from "../components/evaluaciones/EmployeeProfileView";
import SummaryView from "../components/evaluaciones/SummaryView";
import MiPerfilView from "../components/evaluaciones/MiPerfilView";
import MiPerfilV2View from "../components/evaluaciones/MiPerfilV2View";

const ALL_TABS = [
  { key: "empleados",  label: "Empleados",    path: "/evaluaciones" },
  { key: "resumen",    label: "Resumen",       path: "/evaluaciones/resumen" },
  { key: "perfil",     label: "Mi Perfil",     path: "/evaluaciones/perfil" },
  { key: "perfil-v2",  label: "Mi Perfil v2",  path: "/evaluaciones/perfil-v2" },
];

function pathToKey(pathname) {
  if (pathname.startsWith("/evaluaciones/resumen"))   return "resumen";
  // perfil-v2 debe verificarse ANTES que perfil para evitar falso match
  if (pathname.startsWith("/evaluaciones/perfil-v2")) return "perfil-v2";
  if (pathname.startsWith("/evaluaciones/perfil"))    return "perfil";
  return "empleados";
}

export default function EvaluacionesPage() {
  const { userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { id: employeeId } = useParams();

  const canEval = userProfile?.access_level >= 2 || userProfile?.admin === true;
  const activeKey = pathToKey(location.pathname);
  const isProfileView = location.pathname.startsWith("/evaluaciones/empleado/");
  // Nota: isPerfilView captura tanto /perfil como /perfil-v2 (startsWith).
  // Esto está bien: el redirect de no-managers lleva a /evaluaciones/perfil,
  // que coincide con ambas rutas y permite acceder a v2 sin ser expulsado.
  const isPerfilView  = location.pathname.startsWith("/evaluaciones/perfil");
  const isPerfilV2View = location.pathname.startsWith("/evaluaciones/perfil-v2");

  // Si el usuario no puede evaluar, sólo puede ver su propio perfil
  useEffect(() => {
    if (!canEval && userProfile != null && !isPerfilView) {
      navigate("/evaluaciones/perfil", { replace: true });
    }
  }, [canEval, navigate, userProfile, isPerfilView]);

  if (!userProfile) {
    return (
      <main className="flex-1 overflow-y-auto main-bg h-screen">
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto main-bg h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-bold text-[#111] leading-tight">
              Evaluaciones
            </h1>
            <p className="text-[15px] text-[#888] mt-0.5">
              Desempeño · Historial · Resumen
            </p>
          </div>
        </div>

        {/* Tab switcher — visible solo para managers/admins; oculto en perfil de empleado ajeno */}
        {canEval && !isProfileView && (
          <div className="flex bg-white border border-[#e0ddd4] rounded-xl p-1 w-fit mb-6">
            {ALL_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => navigate(tab.path)}
                className={`px-4 py-1.5 rounded-lg text-[14.5px] font-semibold transition-all ${
                  activeKey === tab.key
                    ? "bg-[#111] text-white"
                    : "text-[#666] hover:text-[#111] hover:bg-[#f5f3eb]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Contenido */}
        {isProfileView ? (
          <EmployeeProfileView employeeId={employeeId} />
        ) : isPerfilV2View ? (
          <MiPerfilV2View
            userId={userProfile.user_id}
            companyId={userProfile.company_id}
            departmentId={userProfile.department_id}
            userProfile={userProfile}
            canEval={canEval}
          />
        ) : isPerfilView ? (
          <MiPerfilView
            userId={userProfile.user_id}
            companyId={userProfile.company_id}
            departmentId={userProfile.department_id}
            userProfile={userProfile}
          />
        ) : activeKey === "empleados" ? (
          <EmployeeEvalList
            companyId={userProfile.company_id}
            currentUserId={userProfile.user_id}
          />
        ) : (
          <SummaryView companyId={userProfile.company_id} />
        )}
      </div>
    </main>
  );
}
