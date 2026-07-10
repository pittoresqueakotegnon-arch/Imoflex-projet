import React from 'react';
import { Navigate } from 'react-router-dom';
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

  // On attend que le profil soit chargé (pour avoir le rôle) si l'utilisateur est connecté
  if (loading || (user && !profile)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#120D2A]">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-[#4A3D7A] border-t-[#A855F7] rounded-full animate-spin"></div>
        </div>
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
