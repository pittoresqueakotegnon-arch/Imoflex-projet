import React from "react";
import { Navigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

interface WebRoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  redirectTo?: string;
}

export const WebRoleGuard: React.FC<WebRoleGuardProps> = ({
  children,
  allowedRoles,
  redirectTo = "/web",
}) => {
  const { user, profile, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--imx-bg-app)]">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--imx-accent)", borderTopColor: "transparent" }}
          />
          <p
            className="text-[12px] font-bold tracking-widest uppercase"
            style={{ color: "var(--imx-text-muted)", fontFamily: "Space Grotesk" }}
          >
            Chargement…
          </p>
        </div>
      </div>
    );
  }

  if (user && !profile) {
    return (
      <div className="min-h-screen bg-[var(--imx-bg-app)] flex flex-col items-center justify-center p-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          <AlertTriangle size={28} color="#EF4444" />
        </div>
        <h2
          className="font-bold text-[18px] mb-3 text-center"
          style={{ color: "var(--imx-text-primary)", fontFamily: "Sora" }}
        >
          Impossible de charger votre profil
        </h2>
        <p
          className="text-sm text-center max-w-[300px] leading-relaxed mb-8"
          style={{ color: "var(--imx-text-secondary)", fontFamily: "Space Grotesk" }}
        >
          Une erreur est survenue lors du chargement de vos informations. Veuillez reessayer.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-8 py-3 rounded-xl text-white font-semibold text-sm hover:opacity-90"
          style={{ background: "var(--imx-accent)", fontFamily: "Space Grotesk" }}
        >
          Reessayer
        </button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/web/login" replace />;
  }

  if (!allowedRoles.includes(role || "")) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default WebRoleGuard;
