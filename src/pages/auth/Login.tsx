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



  const fadeStyle = (_delay = 0) => ({});

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
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="relative" style={fadeStyle(100)}>
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
          <div className="relative" style={fadeStyle(150)}>
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
          <div className="flex items-center justify-between px-1" style={fadeStyle(200)}>
            <label className="flex items-center gap-2 cursor-pointer" onClick={() => setRememberMe(!rememberMe)}>
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center transition-all flex-shrink-0"
                style={{
                  background: rememberMe ? 'var(--imx-accent)' : 'transparent',
                  border: `1.5px solid ${rememberMe ? 'var(--imx-accent)' : 'var(--imx-border)'}`,
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
            style={fadeStyle(250)}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Se connecter'
            )}
          </button>
        </form>



        {/* Lien inscription */}
        <div className="text-center mt-auto pt-8" style={fadeStyle(400)}>
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
