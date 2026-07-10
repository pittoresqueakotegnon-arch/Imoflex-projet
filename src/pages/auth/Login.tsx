import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, user, profile } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redirection automatique une fois le contexte d'authentification complètement à jour
  useEffect(() => {
    if (user && profile) {
      const from = location.state?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else {
        const role = profile.role;
        if (role === 'admin') navigate('/admin', { replace: true });
        else if (role === 'proprietaire') navigate('/pro/dashboard', { replace: true });
        else navigate('/dashboard', { replace: true });
      }
    }
  }, [user, profile, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      showToast('Connexion réussie !', 'success');
      // Ne PAS faire setLoading(false) ni navigate ici.
      // Le useEffect va détecter les changements de `user` et `profile` et naviguer proprement.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de connexion';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col px-5 pt-12 pb-8" style={{ background: '#120D2A', color: '#E8E0FF' }}>
      {/* ← Retour */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[#A855F7] text-sm mb-10 w-fit"
        style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Retour
      </button>

      {/* Titre */}
      <div className="mb-8">
        <h1 className="font-nunito font-900 text-3xl text-[#E8E0FF] mb-1.5">Bon retour 👋</h1>
        <p className="text-[#8B7BB5] text-sm" style={{ fontFamily: 'Space Grotesk' }}>
          Connectez-vous pour continuer
        </p>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        {/* Email */}
        <div className="mb-5">
          <label className="label block mb-2">EMAIL</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
            className="input-field"
            placeholder="vous@exemple.com"
          />
        </div>

        {/* Mot de passe */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="label">MOT DE PASSE</label>
            <Link to="/forgot-password" className="text-[#A855F7] text-xs" style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}>
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              className="input-field pr-12"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8B7BB5] hover:text-[#A855F7] transition-colors"
              disabled={loading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-5" style={{ fontFamily: 'Space Grotesk' }}>
            {error}
          </div>
        )}

        {/* Bouton */}
        <button
          type="submit"
          disabled={loading || !email || !password}
          className="btn-primary w-full mt-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Connexion...
            </>
          ) : 'Se connecter'}
        </button>

        {/* Lien inscription */}
        <div className="text-center mt-6">
          <span className="text-[#8B7BB5] text-sm" style={{ fontFamily: 'Space Grotesk' }}>
            Pas de compte ?{' '}
          </span>
          <Link to="/register" className="text-[#A855F7] text-sm font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
            Créer un compte
          </Link>
        </div>
      </form>
    </div>
  );
}
