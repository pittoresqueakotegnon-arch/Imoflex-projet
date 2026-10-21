import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/* ─────────────────────────────────────────────────────────────
   WebLogin — Connexion web ImoFlex
───────────────────────────────────────────────────────────── */

export default function WebLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, role, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = searchParams.get('from') || null;

  const getRedirectForRole = (r: string | null) => {
    if (from) return from;
    if (r === 'locataire')    return '/web/dashboard';
    if (r === 'proprietaire') return '/web/pro/dashboard';
    if (r === 'agence')       return '/web/agence/dashboard';
    if (r === 'admin')        return '/admin';
    return '/web';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      // After sign in, role is set in context — navigate based on it
      // (useAuth will have updated before signIn resolves)
    } catch (err: any) {
      setError(err.message || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  // Redirect after auth context loads
  React.useEffect(() => {
    if (!authLoading && role) {
      navigate(getRedirectForRole(role), { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, role]);

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--imx-bg-app)' }}>

      {/* Left decorative panel (desktop only) */}
      <div
        className="hidden lg:flex flex-1 flex-col justify-center px-16 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1A0A3B 0%, #2D1265 60%, #17132B 100%)',
        }}
      >
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #7B3FE4, transparent 70%)', transform: 'translate(30%, -30%)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
            </div>
            <span className="text-2xl font-black text-white" style={{ fontFamily: 'Sora' }}>ImoFlex</span>
          </div>
          <h1 className="text-4xl font-black text-white mb-4" style={{ fontFamily: 'Sora', lineHeight: 1.2 }}>
            Bienvenue
            <br />
            <span style={{ color: '#A855F7' }}>sur ImoFlex</span>
          </h1>
          <p className="text-white/70 text-sm leading-relaxed max-w-sm">
            Connectez-vous pour gérer vos biens, payer vos loyers ou accéder à vos documents depuis n'importe quel appareil.
          </p>

          <div className="mt-10 space-y-3">
            {[
              'Paiement progressif Mobile Money',
              'Contrats numériques sécurisés',
              'États des lieux PDF intégrés',
              'Données synchronisées mobile & web',
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#A855F7' }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex flex-col justify-center items-center px-4 sm:px-8 py-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-xl overflow-hidden" style={{ background: '#F1EBFF' }}>
              <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
            </div>
            <span className="font-black text-lg" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>ImoFlex</span>
          </div>

          <h2 className="text-2xl font-black mb-1" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
            Connexion
          </h2>
          <p className="text-sm mb-8" style={{ color: 'var(--imx-text-muted)' }}>
            Pas encore de compte ?{' '}
            <Link to="/web/register" className="font-semibold underline" style={{ color: 'var(--imx-accent)' }}>
              Créer un compte
            </Link>
          </p>

          {/* Banned notice */}
          {searchParams.get('banned') && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl mb-5 text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}
            >
              <AlertCircle size={15} />
              Votre compte a été suspendu. Contactez le support.
            </div>
          )}

          {error && (
            <div
              className="flex items-center gap-2 p-3 rounded-xl mb-5 text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}
            >
              <AlertCircle size={15} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
                Adresse e-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="votre@email.com"
                required
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: 'var(--imx-surface)',
                  border: '1.5px solid var(--imx-border)',
                  color: 'var(--imx-text-primary)',
                  fontFamily: 'Space Grotesk',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--imx-accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--imx-border)')}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium" style={{ color: 'var(--imx-text-primary)' }}>
                  Mot de passe
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium"
                  style={{ color: 'var(--imx-accent)' }}
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 pr-11 rounded-xl text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--imx-surface)',
                    border: '1.5px solid var(--imx-border)',
                    color: 'var(--imx-text-primary)',
                    fontFamily: 'Space Grotesk',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--imx-accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--imx-border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--imx-text-muted)' }}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-98"
              style={{
                background: 'var(--imx-accent)',
                fontFamily: 'Space Grotesk',
                opacity: loading || !email || !password ? 0.7 : 1,
              }}
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <>Se connecter <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <p className="text-xs text-center mt-6" style={{ color: 'var(--imx-text-muted)' }}>
            En vous connectant, vous acceptez nos{' '}
            <Link to="/cgu" className="underline" style={{ color: 'var(--imx-accent)' }}>CGU</Link>
            {' '}et notre{' '}
            <Link to="/politique-confidentialite" className="underline" style={{ color: 'var(--imx-accent)' }}>
              politique de confidentialité
            </Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
