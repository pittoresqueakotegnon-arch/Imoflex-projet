import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import RoleGuard from './components/RoleGuard';
import AdminLayout from './components/AdminLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster, toast } from 'sonner';
import { useEffect } from 'react';
import { useFcmToken } from './hooks/useFcmToken';

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
// Public
const Splash        = lazy(() => import('./pages/public/Splash'));
const Marketplace   = lazy(() => import('./pages/public/Marketplace'));
const Filtres       = lazy(() => import('./pages/public/Filtres'));
const Annonce       = lazy(() => import('./pages/public/Annonce'));
const Contact       = lazy(() => import('./pages/public/Contact'));
const Favoris       = lazy(() => import('./pages/public/Favoris'));
const MesDemandes   = lazy(() => import('./pages/public/MesDemandes'));

// Auth
const Login           = lazy(() => import('./pages/auth/Login'));
const Register        = lazy(() => import('./pages/auth/Register'));
const Onboarding      = lazy(() => import('./pages/auth/Onboarding'));
const ForgotPassword  = lazy(() => import('./pages/auth/ForgotPassword'));

// Locataire
const LocataireDashboard = lazy(() => import('./pages/locataire/Dashboard'));
const LogementDetail     = lazy(() => import('./pages/locataire/LogementDetail'));
const Rejoindre          = lazy(() => import('./pages/locataire/Rejoindre'));
const Payer              = lazy(() => import('./pages/locataire/Payer'));
const Historique         = lazy(() => import('./pages/locataire/Historique'));

// Propriétaire
const ProprietaireDashboard = lazy(() => import('./pages/proprietaire/Dashboard'));
const ProAnnonces           = lazy(() => import('./pages/proprietaire/Annonces'));
const Publier               = lazy(() => import('./pages/proprietaire/Publier'));
const Demandes              = lazy(() => import('./pages/proprietaire/Demandes'));
const Activer               = lazy(() => import('./pages/proprietaire/Activer'));
const MesLocataires         = lazy(() => import('./pages/proprietaire/MesLocataires'));
const Wallet                = lazy(() => import('./pages/proprietaire/Wallet'));
const Retrait               = lazy(() => import('./pages/proprietaire/Retrait'));
const FicheBail             = lazy(() => import('./pages/proprietaire/FicheBail'));

// Admin — recharts (700 KB) ne se charge QUE si l'admin accède à ces pages
const AdminDashboard    = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAnnonces     = lazy(() => import('./pages/admin/AdminAnnonces'));
const AdminUtilisateurs = lazy(() => import('./pages/admin/AdminUtilisateurs'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'));
const AdminConfig       = lazy(() => import('./pages/admin/AdminConfig'));
const AdminLogs         = lazy(() => import('./pages/admin/AdminLogs'));
const AdminLoyersRetard = lazy(() => import('./pages/admin/AdminLoyersRetard'));
const AdminDemandesSuppression = lazy(() => import('./pages/admin/AdminDemandesSuppression'));

// Common
const Profil            = lazy(() => import('./pages/common/Profil'));
const ProfilMobileMoney = lazy(() => import('./pages/common/ProfilMobileMoney'));
const ProfilMotDePasse  = lazy(() => import('./pages/common/ProfilMotDePasse'));
const Notifications     = lazy(() => import('./pages/common/Notifications'));

// ── Fallback de chargement ultra-léger ───────────────────────────────────────
function PageLoader() {
  return (
    <div
      className="flex items-center justify-center min-h-screen bg-[var(--imx-bg-app)]"
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }}
        />
        <p
          className="text-[12px] font-bold tracking-widest uppercase"
          style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}
        >
          Chargement…
        </p>
      </div>
    </div>
  );
}

function MobileFrame({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  
  // Enregistrement du token FCM Capacitor (no-op si non natif ou non connecté)
  useFcmToken(user?.id);

  // 🛡️ Gardien de route anti-admin :
  // Si un admin tente d'afficher l'interface client/marketplace (qui utilise MobileFrame),
  // on le redirige de force vers l'interface d'administration.
  if (user && profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return <div className="mobile-frame">{children}</div>;
}

export default function App() {
  useEffect(() => {
    const handleOffline = () => {
      toast.error('Vous êtes hors ligne', {
        id: 'network-status',
        description: 'Vérifiez votre connexion internet.',
        duration: Infinity,
      });
    };

    const handleOnline = () => {
      toast.dismiss('network-status');
      toast.success('Connexion rétablie', {
        id: 'network-status',
        description: 'Vous êtes de nouveau en ligne.',
        duration: 3000,
      });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>

              {/* ── ESPACE ADMIN (Desktop layout) ──────────────────── */}
              <Route
                path="/admin"
                element={
                  <RoleGuard allowedRoles={['admin']} redirectTo="/">
                    <AdminLayout />
                  </RoleGuard>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="annonces" element={<AdminAnnonces />} />
                <Route path="suppressions" element={<AdminDemandesSuppression />} />
                <Route path="utilisateurs" element={<AdminUtilisateurs />} />
                <Route path="transactions" element={<AdminTransactions />} />
                <Route path="loyers-retard" element={<AdminLoyersRetard />} />
                <Route path="config" element={<AdminConfig />} />
                <Route path="logs" element={<AdminLogs />} />
              </Route>

              {/* ── SPLASH ─────────────────────────────────────────── */}
              <Route path="/splash" element={<MobileFrame><Splash /></MobileFrame>} />

              {/* ── PUBLIC ─────────────────────────────────────────── */}
              <Route path="/" element={<MobileFrame><Marketplace /></MobileFrame>} />
              <Route path="/filtres" element={<MobileFrame><Filtres /></MobileFrame>} />
              <Route path="/annonce/:id" element={<MobileFrame><Annonce /></MobileFrame>} />
              <Route path="/favoris" element={<MobileFrame><Favoris /></MobileFrame>} />
              <Route path="/mes-demandes" element={<MobileFrame><MesDemandes /></MobileFrame>} />
              <Route
                path="/contact/:listing_id"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['locataire', 'proprietaire', 'admin']} redirectTo="/login">
                      <Contact />
                    </RoleGuard>
                  </MobileFrame>
                }
              />

              {/* ── ONBOARDING ───────────────────────────────────── */}
              <Route path="/onboarding" element={<MobileFrame><Onboarding /></MobileFrame>} />

              {/* ── AUTH ─────────────────────────────────────────── */}
              <Route path="/login" element={<MobileFrame><Login /></MobileFrame>} />
              <Route path="/register" element={<MobileFrame><Register /></MobileFrame>} />
              <Route path="/forgot-password" element={<MobileFrame><ForgotPassword /></MobileFrame>} />

              {/* ── LOCATAIRE ──────────────────────────────────────── */}
              <Route
                path="/dashboard"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                      <LocataireDashboard />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/logement/:leaseId"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                      <LogementDetail />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/rejoindre"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                      <Rejoindre />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/payer/:leaseId"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                      <Payer />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/historique"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                      <Historique />
                    </RoleGuard>
                  </MobileFrame>
                }
              />

              {/* ── PROPRIÉTAIRE ───────────────────────────────────── */}
              <Route
                path="/pro/dashboard"
                element={
                  <MobileFrame>
                    {/* Locataires ET Propriétaires peuvent accéder ici :
                        le composant lui-même gère l'affichage selon le rôle */}
                    <RoleGuard allowedRoles={['locataire', 'proprietaire']} redirectTo="/login">
                      <ProprietaireDashboard />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/annonces"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <ProAnnonces />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/publier"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <Publier />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/demandes"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <Demandes />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/activer/:listing_id"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <Activer />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/locataires"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <MesLocataires />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/wallet"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <Wallet />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/retrait"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <Retrait />
                    </RoleGuard>
                  </MobileFrame>
                }
              />
              <Route
                path="/pro/bail/:id"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                      <FicheBail />
                    </RoleGuard>
                  </MobileFrame>
                }
              />

              {/* ── COMMUN ─────────────────────────────────────────── */}
              <Route path="/profil" element={<MobileFrame><Profil /></MobileFrame>} />
              <Route path="/profil/mobile-money" element={<MobileFrame><ProfilMobileMoney /></MobileFrame>} />
              <Route path="/profil/mot-de-passe" element={<MobileFrame><ProfilMotDePasse /></MobileFrame>} />
              <Route
                path="/notifications"
                element={
                  <MobileFrame>
                    <RoleGuard allowedRoles={['locataire', 'proprietaire', 'admin']} redirectTo="/login">
                      <Notifications />
                    </RoleGuard>
                  </MobileFrame>
                }
              />

              {/* ── 404 FALLBACK ───────────────────────────────────── */}
              <Route path="*" element={<Navigate to="/" replace />} />

            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
        </ThemeProvider>
      <Toaster position="top-center" richColors closeButton />
    </BrowserRouter>
    </ErrorBoundary>
  );
}
