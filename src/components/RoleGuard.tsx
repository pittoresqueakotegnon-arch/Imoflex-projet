import React from 'react';
import { Navigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: string[];
  redirectTo?: string;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({
  children,
  allowedRoles,
  redirectTo = '/'
}) => {
  const { user, profile, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--imx-bg-app)]">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-[var(--imx-text-muted)] border-t-[#A855F7] rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  // Si on a un utilisateur mais que le profil n'a pas pu être chargé (erreur réseau ou trigger)
  if (user && !profile) {
    return (
      <div className="min-h-screen bg-[var(--imx-bg-app)] flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <AlertTriangle size={28} color="#EF4444" />
        </div>
        <h2 className="font-nunito font-black text-[18px] text-[var(--imx-text-primary)] mb-3">Impossible de charger votre profil</h2>
        <p className="text-[var(--imx-text-secondary)] text-xs text-center max-w-[280px] leading-[1.6] mb-8" style={{ fontFamily: 'Space Grotesk' }}>
          Une erreur est survenue lors du chargement de vos informations. Veuillez réessayer.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="w-full max-w-sm text-white font-bold rounded-2xl py-[18px]"
          style={{ background: 'var(--imx-accent-light)', fontFamily: 'Sora', fontSize: '15px' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(role || '')) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default RoleGuard;
