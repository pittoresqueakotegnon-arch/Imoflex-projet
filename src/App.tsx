import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import RoleGuard from './components/RoleGuard';

// Public pages
import Splash from './pages/public/Splash';
import Marketplace from './pages/public/Marketplace';
import Filtres from './pages/public/Filtres';
import Annonce from './pages/public/Annonce';
import Contact from './pages/public/Contact';
import Favoris from './pages/public/Favoris';
import MesDemandes from './pages/public/MesDemandes';

// Auth pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';

// Locataire pages
import LocataireDashboard from './pages/locataire/Dashboard';
import Rejoindre from './pages/locataire/Rejoindre';
import Payer from './pages/locataire/Payer';
import Historique from './pages/locataire/Historique';

// Propriétaire pages
import ProprietaireDashboard from './pages/proprietaire/Dashboard';
import ProAnnonces from './pages/proprietaire/Annonces';
import Publier from './pages/proprietaire/Publier';
import Demandes from './pages/proprietaire/Demandes';
import Activer from './pages/proprietaire/Activer';
import MesLocataires from './pages/proprietaire/MesLocataires';
import Wallet from './pages/proprietaire/Wallet';
import Retrait from './pages/proprietaire/Retrait';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAnnonces from './pages/admin/AdminAnnonces';
import AdminUtilisateurs from './pages/admin/AdminUtilisateurs';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminConfig from './pages/admin/AdminConfig';
import AdminLogs from './pages/admin/AdminLogs';

// Common pages
import Profil from './pages/common/Profil';
import Notifications from './pages/common/Notifications';

import AdminLayout from './components/AdminLayout';

/**
 * Toutes les routes "mobile" (marketplace, locataire, propriétaire, auth)
 * sont enveloppées dans le même wrapper .mobile-frame pour conserver
 * le design responsive. On utilise un Layout dédié pour ne pas dupliquer.
 */
function MobileFrame({ children }: { children: React.ReactNode }) {
  return <div className="mobile-frame">{children}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
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
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
