import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import RoleGuard from './components/RoleGuard';
import AdminLayout from './components/AdminLayout';

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

// Common
const Profil        = lazy(() => import('./pages/common/Profil'));
const Notifications = lazy(() => import('./pages/common/Notifications'));

// ── Fallback de chargement ultra-léger ───────────────────────────────────────
function PageLoader() {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: '#0B0819' }}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#7B3FE4', borderTopColor: 'transparent' }}
        />
        <p
          className="text-[12px] font-bold tracking-widest uppercase"
          style={{ color: '#4A3D7A', fontFamily: 'Space Grotesk' }}
        >
          Chargement…
        </p>
      </div>
    </div>
  );
}

function MobileFrame({ children }: { children: React.ReactNode }) {
  return <div className="mobile-frame">{children}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
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
                <Route path="utilisateurs" element={<AdminUtilisateurs />} />
                <Route path="transactions" element={<AdminTransactions />} />
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

              {/* ── AUTH ───────────────────────────────────────────── */}
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
                    <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
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
    </BrowserRouter>
  );
}
