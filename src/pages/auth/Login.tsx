import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, Mail, Check, ArrowLeft } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { diagnoseAndShowError } from '../../utils/errorDiagnostics';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Login — Page de connexion ImoFlex
//
// Inspiré de l'UX Facebook mais avec l'identité visuelle ImoFlex (fond sombre).
//
// Futures extensions prévues :
//   - Connexion Apple (Sign in with Apple)
//   - Connexion via numéro de téléphone + OTP
//   - Biométrie (Face ID / Touch ID via WebAuthn)
//   - Multi-langue (i18n)
// ─────────────────────────────────────────────────────────────────────────────

// Google OAuth disponible ?
let googleAvailable: boolean | null = null;
async function checkGoogleAvailable(): Promise<boolean> {
  if (googleAvailable !== null) return googleAvailable;
  try {
    // On vérifie si le provider Google est configuré dans Supabase
    // en tentant d'obtenir l'URL (sans rediriger)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { skipBrowserRedirect: true, redirectTo: window.location.origin },
    });
    googleAvailable = !error && !!data?.url;
  } catch {
    googleAvailable = false;
  }
  return googleAvailable;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, profile } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleVisible, setGoogleVisible] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Animation d'entrée
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Bouton Google gelé temporairement à la demande de l'utilisateur (en attente de config Supabase / Google Cloud)
  useEffect(() => {
    setGoogleVisible(false);
  }, []);

  // Redirection automatique si déjà connecté
  useEffect(() => {
    if (user && profile) {
      const from = location.state?.from?.pathname;
      const role = profile.role;
      if (role === 'admin') navigate('/admin', { replace: true });
      else if (from) navigate(from, { replace: true });
      else if (role === 'proprietaire') navigate('/pro/dashboard', { replace: true });
      else navigate('/dashboard', { replace: true });
    }
  }, [user, profile, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      showToast('Connexion réussie !', 'success');
      // Navigation gérée par le useEffect ci-dessus
    } catch (err) {
      diagnoseAndShowError(err, 'Authentification');
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) {
        // Google non configuré → masquer le bouton silencieusement
        setGoogleVisible(false);
        showToast('Connexion Google non disponible pour l\'instant', 'info');
      }
    } catch {
      setGoogleVisible(false);
    } finally {
      setGoogleLoading(false);
    }
  };

  const fadeStyle = (delay = 0) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(20px)',
    transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
  });

  return (
    <div
      className="min-h-screen flex flex-col bg-[var(--imx-bg-app)]"
    >
      {/* Bouton retour */}
      <div className="px-5 pt-safe" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--imx-border)', border: '1px solid var(--imx-border)' }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--imx-text-secondary)' }} />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-6 pb-safe" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        {/* Logo + Titre */}
        <div className="flex flex-col items-center mb-10" style={fadeStyle(0)}>
          <div
            className="w-20 h-20 rounded-3xl overflow-hidden mb-5"
            style={{
              boxShadow: '0 0 60px rgba(123,63,228,0.45), 0 0 0 1px rgba(123,63,228,0.2)',
              animation: 'shimmer 3s ease-in-out infinite',
            }}
          >
            <img
              src="/assets/logo-icon-transparent-recadre.png"
              alt="ImoFlex"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-3xl mb-1 text-center" style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}>
            Bon retour 👋
          </h1>
          <p className="text-sm text-center" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
            Connectez-vous pour continuer
          </p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" style={fadeStyle(100)}>
          {/* Email */}
          <div className="relative">
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: '#6B5F8F' }}
            >
              <Mail size={18} />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              className="input-field w-full pl-11"
              placeholder="Adresse e-mail"
              autoComplete="email"
            />
          </div>

          {/* Mot de passe */}
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
              <Lock size={18} />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="input-field w-full pl-11 pr-12"
              placeholder="Mot de passe"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: showPassword ? 'var(--imx-accent-light)' : '#6B5F8F' }}
              disabled={loading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Se souvenir + Mot de passe oublié */}
          <div className="flex items-center justify-between px-1">
            <label className="flex items-center gap-2 cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center transition-all flex-shrink-0"
                style={{
                  background: rememberMe ? 'var(--imx-accent)' : 'transparent',
                  border: `1.5px solid ${rememberMe ? 'var(--imx-accent)' : 'rgba(255,255,255,0.15)'}`,
                }}
              >
                {rememberMe && <Check size={12} className="text-white" />}
              </div>
              <span className="text-xs" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
                Se souvenir de moi
              </span>
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium transition-colors"
              style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-accent-light)' }}
            >
              Mot de passe oublié ?
            </Link>
          </div>

          {/* Bouton connexion */}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary w-full mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Se connecter'
            )}
          </button>
        </form>

        {/* Séparateur */}
        {googleVisible && (
          <div className="flex items-center gap-3 my-5" style={fadeStyle(200)}>
            <div className="flex-1 h-px" style={{ background: 'var(--imx-border)' }} />
            <span className="text-xs" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-muted)' }}>ou</span>
            <div className="flex-1 h-px" style={{ background: 'var(--imx-border)' }} />
          </div>
        )}

        {/* Bouton Google */}
        {googleVisible && (
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full h-14 rounded-2xl flex items-center justify-center gap-3 transition-all"
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
              fontFamily: 'Space Grotesk',
              fontWeight: 600,
              fontSize: '0.9375rem',
              color: '#1C1E21',
            }}
          >
            {googleLoading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {/* Logo Google SVG natif */}
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuer avec Google
              </>
            )}
          </button>
        )}

        {/* Lien inscription */}
        <div className="text-center mt-auto pt-8" style={fadeStyle(300)}>
          <span className="text-sm" style={{ fontFamily: 'Space Grotesk', color: '#6B5F8F' }}>
            Pas encore de compte ?{' '}
          </span>
          <Link
            to="/register"
            className="text-sm font-semibold transition-colors"
            style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-accent-light)' }}
          >
            Créer un compte
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0%, 100% { box-shadow: 0 0 40px rgba(123,63,228,0.35), 0 0 0 1px rgba(123,63,228,0.15); }
          50%       { box-shadow: 0 0 70px rgba(123,63,228,0.6),  0 0 0 1px rgba(123,63,228,0.3);  }
        }
      `}</style>
    </div>
  );
}
