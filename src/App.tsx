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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* --- ESPACE ADMIN (Desktop) --- */}
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

            {/* --- ESPACE PUBLIC / LOCATAIRE / PROPRIÉTAIRE (Mobile Frame) --- */}
            <Route
              path="*"
              element={
                <div className="mobile-frame">
                  <Routes>
                    {/* Splash */}
                    <Route path="/splash" element={<Splash />} />

                    {/* Public marketplace */}
                    <Route path="/" element={<Marketplace />} />
                    <Route path="/filtres" element={<Filtres />} />
                    <Route path="/annonce/:id" element={<Annonce />} />
                    <Route path="/favoris" element={<Favoris />} />
                    <Route path="/mes-demandes" element={<MesDemandes />} />
                    <Route
                      path="/contact/:listing_id"
                      element={
                        <RoleGuard allowedRoles={['locataire', 'proprietaire', 'admin']} redirectTo="/login">
                          <Contact />
                        </RoleGuard>
                      }
                    />

                    {/* Auth */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />

                    {/* Locataire */}
                    <Route
                      path="/dashboard"
                      element={
                        <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                          <LocataireDashboard />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/rejoindre"
                      element={
                        <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                          <Rejoindre />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/payer"
                      element={
                        <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                          <Payer />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/historique"
                      element={
                        <RoleGuard allowedRoles={['locataire']} redirectTo="/login">
                          <Historique />
                        </RoleGuard>
                      }
                    />

                    {/* Propriétaire */}
                    <Route
                      path="/pro/dashboard"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <ProprietaireDashboard />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/pro/annonces"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <ProAnnonces />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/pro/publier"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <Publier />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/pro/demandes"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <Demandes />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/pro/activer/:listing_id"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <Activer />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/pro/locataires"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <MesLocataires />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/pro/wallet"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <Wallet />
                        </RoleGuard>
                      }
                    />
                    <Route
                      path="/pro/retrait"
                      element={
                        <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
                          <Retrait />
                        </RoleGuard>
                      }
                    />

                    {/* Common */}
                    <Route path="/profil" element={<Profil />} />
                    <Route
                      path="/notifications"
                      element={
                        <RoleGuard allowedRoles={['locataire', 'proprietaire', 'admin']} redirectTo="/login">
                          <Notifications />
                        </RoleGuard>
                      }
                    />

                    {/* Fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </div>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
