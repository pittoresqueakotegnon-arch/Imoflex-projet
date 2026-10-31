import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './contexts/ThemeContext';
import RoleGuard from './components/RoleGuard';
import WebRoleGuard from './components/WebRoleGuard';
import AdminLayout from './components/AdminLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingSlides } from './components/OnboardingSlides';
import { AppRatingModal } from './components/AppRatingModal';
import { NetworkBanner } from './components/NetworkBanner';
import { Toaster } from 'sonner';
import { useEffect } from 'react';
import { useFcmToken } from './hooks/useFcmToken';
import { useAndroidBackButton } from './hooks/useAndroidBackButton';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { lazyWithRetry } from './lib/lazyWithRetry';

// â”€â”€ Lazy-loaded pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public
const Splash                  = lazy(() => import('./pages/public/Splash'));
const Marketplace             = lazy(() => import('./pages/public/Marketplace'));
const Filtres                 = lazy(() => import('./pages/public/Filtres'));
const Annonce                 = lazy(() => import('./pages/public/Annonce'));
const Contact                 = lazy(() => import('./pages/public/Contact'));
const Favoris                 = lazy(() => import('./pages/public/Favoris'));
const MesDemandes             = lazy(() => import('./pages/public/MesDemandes'));
const CGU                     = lazy(() => import('./pages/public/CGU'));
const PolitiqueConfidentialite = lazy(() => import('./pages/public/PolitiqueConfidentialite'));
const Aide                    = lazy(() => import('./pages/public/Aide'));
const VerifierDocument        = lazy(() => import('./pages/public/VerifierDocument'));

// Auth
const Login           = lazy(() => import('./pages/auth/Login'));
const Register        = lazy(() => import('./pages/auth/Register'));
const Onboarding      = lazy(() => import('./pages/auth/Onboarding'));
const ForgotPassword  = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword   = lazy(() => import('./pages/auth/ResetPassword'));

// Locataire
const LocataireDashboard = lazy(() => import('./pages/locataire/Dashboard'));
const LogementDetail     = lazy(() => import('./pages/locataire/LogementDetail'));
const Rejoindre          = lazy(() => import('./pages/locataire/Rejoindre'));
const Payer              = lazy(() => import('./pages/locataire/Payer'));
const Historique         = lazy(() => import('./pages/locataire/Historique'));
const Recu               = lazy(() => import('./pages/locataire/Recu'));

// PropriÃ©taire
const ProprietaireDashboard = lazy(() => import('./pages/proprietaire/Dashboard'));
const ProAnnonces           = lazy(() => import('./pages/proprietaire/Annonces'));
const Publier               = lazy(() => import('./pages/proprietaire/Publier'));
const Demandes              = lazy(() => import('./pages/proprietaire/Demandes'));
const Activer               = lazy(() => import('./pages/proprietaire/Activer'));
const MesLocataires         = lazy(() => import('./pages/proprietaire/MesLocataires'));
const Wallet                = lazy(() => import('./pages/proprietaire/Wallet'));
const Retrait               = lazy(() => import('./pages/proprietaire/Retrait'));
const FicheBail             = lazy(() => import('./pages/proprietaire/FicheBail'));
const VerificationProprietaire = lazy(() => import('./pages/proprietaire/VerificationProprietaire'));

// Agence immobiliÃ¨re
const AgenceDashboard   = lazy(() => import('./pages/agence/Dashboard'));
const AgenceAnnonces    = lazy(() => import('./pages/agence/Annonces'));
const AgencePublier     = lazy(() => import('./pages/agence/Publier'));
const AgenceDemandes    = lazy(() => import('./pages/agence/Demandes'));
const AgenceProfilAgence = lazy(() => import('./pages/agence/ProfilAgence'));

// Admin routes: recharts is loaded only when an admin opens these pages.
const AdminDashboard    = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAnnonces     = lazy(() => import('./pages/admin/AdminAnnonces'));
const AdminUtilisateurs = lazy(() => import('./pages/admin/AdminUtilisateurs'));
const AdminTransactions = lazy(() => import('./pages/admin/AdminTransactions'));
const AdminSupport      = lazy(() => import('./pages/admin/AdminSupport'));
const AdminConfig       = lazy(() => import('./pages/admin/AdminConfig'));
const AdminLogs         = lazy(() => import('./pages/admin/AdminLogs'));
const AdminLoyersRetard = lazy(() => import('./pages/admin/AdminLoyersRetard'));
const AdminDemandesSuppression = lazy(() => import('./pages/admin/AdminDemandesSuppression'));
const AdminOwnerVerifications = lazy(() => import('./pages/admin/AdminOwnerVerifications'));

// Common
const Profil            = lazy(() => import('./pages/common/Profil'));
const ProfilMobileMoney = lazy(() => import('./pages/common/ProfilMobileMoney'));
const ProfilMotDePasse  = lazy(() => import('./pages/common/ProfilMotDePasse'));
const ProfilCodeRetrait = lazy(() => import('./pages/common/ProfilCodeRetrait'));
const Notifications     = lazy(() => import('./pages/common/Notifications'));

// Version Web (Desktop / Tablette / Navigateur)
const WebLayout                = lazyWithRetry(() => import('./layouts/WebLayout'));
const PublicLayout             = lazyWithRetry(() => import('./layouts/PublicLayout'));
const WebHome                  = lazyWithRetry(() => import('./pages/web/WebHome'));
const WebListings              = lazyWithRetry(() => import('./pages/web/WebListings'));
const WebListing               = lazyWithRetry(() => import('./pages/web/WebListing'));
const WebLogin                 = lazyWithRetry(() => import('./pages/web/WebLogin'));
const WebRegister              = lazyWithRetry(() => import('./pages/web/WebRegister'));
const WebForgotPassword        = lazyWithRetry(() => import('./pages/web/WebForgotPassword'));
const WebResetPassword         = lazyWithRetry(() => import('./pages/web/WebResetPassword'));
const WebAide                  = lazyWithRetry(() => import('./pages/web/WebAide'));
const WebCGU                   = lazyWithRetry(() => import('./pages/web/WebCGU'));
const WebPolitique             = lazyWithRetry(() => import('./pages/web/WebPolitique'));
const WebContact               = lazyWithRetry(() => import('./pages/web/WebContact'));
const WebFavoris               = lazyWithRetry(() => import('./pages/web/WebFavoris'));
const WebProfil                = lazyWithRetry(() => import('./pages/web/WebProfil'));
const WebNotifications         = lazyWithRetry(() => import('./pages/web/WebNotifications'));
const WebNotFound              = lazyWithRetry(() => import('./pages/web/WebNotFound'));

// Locataire Web
const WebLocataireDashboard    = lazyWithRetry(() => import('./pages/web/locataire/WebLocataireDashboard'));
const WebLocatairePaiements    = lazyWithRetry(() => import('./pages/web/locataire/WebLocatairePaiements'));
const WebLocataireDocuments    = lazyWithRetry(() => import('./pages/web/locataire/WebLocataireDocuments'));
const WebLocataireDemandes     = lazyWithRetry(() => import('./pages/web/locataire/WebLocataireDemandes'));
const WebRecu                  = lazyWithRetry(() => import('./pages/web/locataire/WebRecu'));

// PropriÃ©taire Web
const WebProprietaireDashboard = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietaireDashboard'));
const WebProprietaireAnnonces  = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietaireAnnonces'));
const WebProprietaireMandats  = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietaireMandats'));
const WebProprietairePublier   = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietairePublier'));
const WebProprietaireDemandes  = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietaireDemandes'));
const WebProprietaireLocataires = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietaireLocataires'));
const WebProprietaireWallet    = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietaireWallet'));
const WebProprietaireVerification = lazyWithRetry(() => import('./pages/web/proprietaire/WebProprietaireVerification'));

// Agence Web
const WebAgenceDashboard       = lazyWithRetry(() => import('./pages/web/agence/WebAgenceDashboard'));
const WebAgenceAnnonces        = lazyWithRetry(() => import('./pages/web/agence/WebAgenceAnnonces'));
const WebAgencePublier         = lazyWithRetry(() => import('./pages/web/agence/WebAgencePublier'));
const WebAgenceDemandes        = lazyWithRetry(() => import('./pages/web/agence/WebAgenceDemandes'));
const WebAgenceProfil          = lazyWithRetry(() => import('./pages/web/agence/WebAgenceProfil'));

// â”€â”€ Fallback de chargement ultra-lÃ©ger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          Chargementâ€¦
        </p>
      </div>
    </div>
  );
}

function MobileFrame({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  
  // Enregistrement du token FCM Capacitor (no-op si non natif ou non connectÃ©)
  useFcmToken(user?.id);

  // ðŸ›¡ï¸ Gardien de route anti-admin :
  // Si un admin tente d'afficher l'interface client/marketplace (qui utilise MobileFrame),
  // on le redirige de force vers l'interface d'administration.
  if (user && profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="mobile-frame">
      {children}
      <OnboardingSlides />
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────
 * 📱 MobileAppRouter — Routeur dédié à l'application mobile Android (Capacitor)
 * Navigation autonome dans le MobileFrame, Splash en racine `/`,
 * aucun composant Web desktop/PublicLayout n'est chargé.
 * ─────────────────────────────────────────────────────────────
 */
function MobileAppRouter() {
  return (
    <Routes>
      {/* ── POINT D'ENTRÉE ANDROID NATIF : SPLASH ── */}
      <Route path="/" element={<MobileFrame><Splash /></MobileFrame>} />
      <Route path="/splash" element={<MobileFrame><Splash /></MobileFrame>} />

      {/* ── PUBLIC MOBILE ── */}
      <Route path="/marketplace" element={<MobileFrame><Marketplace /></MobileFrame>} />
      <Route path="/filtres" element={<MobileFrame><Filtres /></MobileFrame>} />
      <Route path="/annonce/:id" element={<MobileFrame><Annonce /></MobileFrame>} />
      <Route path="/favoris" element={<MobileFrame><Favoris /></MobileFrame>} />
      <Route path="/mes-demandes" element={<MobileFrame><MesDemandes /></MobileFrame>} />
      <Route path="/cgu" element={<MobileFrame><CGU /></MobileFrame>} />
      <Route path="/politique-confidentialite" element={<MobileFrame><PolitiqueConfidentialite /></MobileFrame>} />
      <Route path="/aide" element={<MobileFrame><Aide /></MobileFrame>} />
      <Route path="/verifier-document" element={<VerifierDocument />} />
      <Route
        path="/contact/:listing_id"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['locataire', 'proprietaire', 'agence', 'admin']} redirectTo="/login">
              <Contact />
            </RoleGuard>
          </MobileFrame>
        }
      />

      {/* ── ONBOARDING MOBILE ── */}
      <Route path="/onboarding" element={<MobileFrame><Onboarding /></MobileFrame>} />

      {/* ── AUTH MOBILE ── */}
      <Route path="/login" element={<MobileFrame><Login /></MobileFrame>} />
      <Route path="/register" element={<MobileFrame><Register /></MobileFrame>} />
      <Route path="/forgot-password" element={<MobileFrame><ForgotPassword /></MobileFrame>} />
      <Route path="/reset-password" element={<MobileFrame><ResetPassword /></MobileFrame>} />

      {/* ── LOCATAIRE MOBILE ── */}
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
      <Route
        path="/recu/:paymentId"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['locataire', 'proprietaire', 'agence']} redirectTo="/login">
              <Recu />
            </RoleGuard>
          </MobileFrame>
        }
      />

      {/* ── PROPRIÉTAIRE MOBILE ── */}
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
        path="/pro/publier/:listingEditId"
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
      <Route
        path="/pro/verification"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['proprietaire']} redirectTo="/login">
              <VerificationProprietaire />
            </RoleGuard>
          </MobileFrame>
        }
      />

      {/* ── AGENCE IMMOBILIÈRE MOBILE ── */}
      <Route
        path="/agence/dashboard"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['agence', 'proprietaire']} redirectTo="/login">
              <AgenceDashboard />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/agence/annonces"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['agence', 'proprietaire']} redirectTo="/login">
              <AgenceAnnonces />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/agence/publier"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['agence', 'proprietaire']} redirectTo="/login">
              <AgencePublier />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/agence/publier/:listingEditId"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['agence', 'proprietaire']} redirectTo="/login">
              <AgencePublier />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/agence/demandes"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['agence', 'proprietaire']} redirectTo="/login">
              <AgenceDemandes />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/agence/profil-agence"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['agence', 'proprietaire']} redirectTo="/login">
              <AgenceProfilAgence />
            </RoleGuard>
          </MobileFrame>
        }
      />

      {/* ── PROFIL & PARAMÈTRES MOBILE ── */}
      <Route
        path="/profil"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['locataire', 'proprietaire', 'agence', 'admin']} redirectTo="/login">
              <Profil />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/profil/mobile-money"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['locataire', 'proprietaire', 'agence', 'admin']} redirectTo="/login">
              <ProfilMobileMoney />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/profil/mot-de-passe"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['locataire', 'proprietaire', 'agence', 'admin']} redirectTo="/login">
              <ProfilMotDePasse />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/profil/code-retrait"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['proprietaire', 'admin']} redirectTo="/login">
              <ProfilCodeRetrait />
            </RoleGuard>
          </MobileFrame>
        }
      />
      <Route
        path="/notifications"
        element={
          <MobileFrame>
            <RoleGuard allowedRoles={['locataire', 'proprietaire', 'agence', 'admin']} redirectTo="/login">
              <Notifications />
            </RoleGuard>
          </MobileFrame>
        }
      />

      {/* ── REPLI MOBILE (Toujours sur marketplace mobile, jamais 404 Web) ── */}
      <Route path="*" element={<Navigate to="/marketplace" replace />} />
    </Routes>
  );
}

/**
 * ─────────────────────────────────────────────────────────────
 * 🌐 WebAppRouter — Routeur dédié à la plateforme Web (Navigateur / Vercel)
 * Navigation autonome WebLayout / PublicLayout, racine `/` charge WebHome,
 * interfaces adaptées aux ordinateurs et grands écrans.
 * ─────────────────────────────────────────────────────────────
 */
function WebAppRouter() {
  return (
    <Routes>
      {/* ── ACCUEIL WEB ET ANNONCES PUBLIQUES ── */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<WebHome />} />
        <Route path="/annonces" element={<WebListings />} />
      </Route>

      {/* ── ESPACE ADMIN (Desktop layout) ── */}
      <Route
        path="/admin"
        element={
          <RoleGuard allowedRoles={['admin']} redirectTo="/web/login">
            <AdminLayout />
          </RoleGuard>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="annonces" element={<AdminAnnonces />} />
        <Route path="suppressions" element={<AdminDemandesSuppression />} />
        <Route path="utilisateurs" element={<AdminUtilisateurs />} />
        <Route path="transactions" element={<AdminTransactions />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="loyers-retard" element={<AdminLoyersRetard />} />
        <Route path="config" element={<AdminConfig />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="verifications" element={<AdminOwnerVerifications />} />
      </Route>

      {/* ── VERSION WEB OFFICIELLE (Desktop / Tablette / Navigateur) ── */}
      <Route path="/web" element={<WebLayout />}>
        <Route index element={<WebHome />} />
        <Route path="annonces" element={<WebListings />} />
        <Route path="annonce/:id" element={<WebListing />} />
        <Route path="login" element={<WebLogin />} />
        <Route path="register" element={<WebRegister />} />
        <Route path="forgot-password" element={<WebForgotPassword />} />
        <Route path="reset-password" element={<WebResetPassword />} />
        <Route path="aide" element={<WebAide />} />
        <Route path="verifier-document" element={<VerifierDocument />} />
        <Route path="cgu" element={<WebCGU />} />
        <Route path="politique-confidentialite" element={<WebPolitique />} />
        <Route path="contact" element={<WebContact />} />
        <Route path="contact/:listing_id" element={<WebContact />} />
        <Route path="favoris" element={<WebFavoris />} />
        <Route path="notifications" element={<WebNotifications />} />
        <Route path="profil" element={<WebProfil />} />

        {/* Espace Locataire */}
        <Route
          path="dashboard"
          element={
            <WebRoleGuard allowedRoles={['locataire']}>
              <WebLocataireDashboard />
            </WebRoleGuard>
          }
        />
        <Route
          path="paiements"
          element={
            <WebRoleGuard allowedRoles={['locataire']}>
              <WebLocatairePaiements />
            </WebRoleGuard>
          }
        />
        <Route
          path="documents"
          element={
            <WebRoleGuard allowedRoles={['locataire']}>
              <WebLocataireDocuments />
            </WebRoleGuard>
          }
        />
        <Route
          path="mes-demandes"
          element={
            <WebRoleGuard allowedRoles={['locataire']}>
              <WebLocataireDemandes />
            </WebRoleGuard>
          }
        />
        <Route
          path="recu/:paymentId"
          element={
            <WebRoleGuard allowedRoles={['locataire', 'proprietaire', 'agence']}>
              <WebRecu />
            </WebRoleGuard>
          }
        />

        {/* Espace Propriétaire */}
        <Route
          path="pro/dashboard"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietaireDashboard />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/annonces"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietaireAnnonces />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/mandats"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietaireMandats />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/publier"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietairePublier />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/publier/:listingEditId"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietairePublier />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/demandes"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietaireDemandes />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/locataires"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietaireLocataires />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/wallet"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietaireWallet />
            </WebRoleGuard>
          }
        />
        <Route
          path="pro/verification"
          element={
            <WebRoleGuard allowedRoles={['proprietaire']}>
              <WebProprietaireVerification />
            </WebRoleGuard>
          }
        />

        {/* Espace Agence */}
        <Route
          path="agence/dashboard"
          element={
            <WebRoleGuard allowedRoles={['agence', 'proprietaire']}>
              <WebAgenceDashboard />
            </WebRoleGuard>
          }
        />
        <Route
          path="agence/annonces"
          element={
            <WebRoleGuard allowedRoles={['agence', 'proprietaire']}>
              <WebAgenceAnnonces />
            </WebRoleGuard>
          }
        />
        <Route
          path="agence/publier"
          element={
            <WebRoleGuard allowedRoles={['agence', 'proprietaire']}>
              <WebAgencePublier />
            </WebRoleGuard>
          }
        />
        <Route
          path="agence/publier/:listingEditId"
          element={
            <WebRoleGuard allowedRoles={['agence', 'proprietaire']}>
              <WebAgencePublier />
            </WebRoleGuard>
          }
        />
        <Route
          path="agence/demandes"
          element={
            <WebRoleGuard allowedRoles={['agence', 'proprietaire']}>
              <WebAgenceDemandes />
            </WebRoleGuard>
          }
        />
        <Route
          path="agence/profil"
          element={
            <WebRoleGuard allowedRoles={['agence', 'proprietaire']}>
              <WebAgenceProfil />
            </WebRoleGuard>
          }
        />

        {/* 404 Web */}
        <Route path="*" element={<WebNotFound />} />
      </Route>

      {/* ── REDIRECTIONS DE CONVENANCE SUR LE WEB (Pour URL directes dans le navigateur) ── */}
      <Route path="/login" element={<Navigate to="/web/login" replace />} />
      <Route path="/register" element={<Navigate to="/web/register" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/web/forgot-password" replace />} />
      <Route path="/reset-password" element={<Navigate to="/web/reset-password" replace />} />
      <Route path="/aide" element={<Navigate to="/web/aide" replace />} />
      <Route path="/cgu" element={<Navigate to="/web/cgu" replace />} />
      <Route path="/politique-confidentialite" element={<Navigate to="/web/politique-confidentialite" replace />} />
      <Route path="/contact" element={<Navigate to="/web/contact" replace />} />
      <Route path="/favoris" element={<Navigate to="/web/favoris" replace />} />
      <Route path="/verifier-document" element={<VerifierDocument />} />
      <Route path="/dashboard" element={<Navigate to="/web/dashboard" replace />} />
      <Route path="/pro/dashboard" element={<Navigate to="/web/pro/dashboard" replace />} />
      <Route path="/pro/publier" element={<Navigate to="/web/pro/publier" replace />} />
      <Route path="/agence/dashboard" element={<Navigate to="/web/agence/dashboard" replace />} />

      {/* 404 Web général */}
      <Route path="*" element={<WebNotFound />} />
    </Routes>
  );
}

/**
 * Détecte si l'environnement d'exécution doit charger MobileAppRouter ou WebAppRouter.
 * - Sur Android natif (Capacitor) : TOUJOURS MobileAppRouter.
 * - Sur le Web : WebAppRouter par défaut.
 * - En mode simulation/test : MobileAppRouter si route mobile explicite.
 */
function isMobilePlatform(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  if (
    path.startsWith('/marketplace') ||
    path.startsWith('/splash') ||
    path.startsWith('/onboarding') ||
    path.startsWith('/filtres') ||
    path.startsWith('/rejoindre') ||
    path.startsWith('/logement/') ||
    path.startsWith('/payer/') ||
    window.location.search.includes('platform=mobile') ||
    window.sessionStorage.getItem('imx_platform') === 'mobile'
  ) {
    return true;
  }
  return false;
}

function AppRoutes() {
  const isMobile = isMobilePlatform();
  useAndroidBackButton();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Configuration native de la barre de statut
      StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => {});
      // Masquer le splash screen natif dès que l'app React est montée
      SplashScreen.hide().catch(() => {});
    }
  }, []);

  return isMobile ? <MobileAppRouter /> : <WebAppRouter />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <Suspense fallback={<PageLoader />}>
                <div className="fixed top-0 left-0 w-full z-50">
                  <NetworkBanner />
                </div>
                <AppRoutes />
              </Suspense>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        <AppRatingModal />
        <Toaster position="top-center" richColors closeButton offset="70px" />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
