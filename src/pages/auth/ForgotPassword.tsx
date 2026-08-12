import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { diagnoseAndShowError } from '../../utils/errorDiagnostics';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (resetError) throw new Error(resetError.message);

      setSent(true);
      showToast('Email envoyé avec succès !', 'success');
    } catch (err) {
      diagnoseAndShowError(err, 'Authentification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-[var(--imx-bg-app)]"
    >
      {/* Header */}
      <div className="px-5 pt-safe" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-colors"
          style={{ background: 'var(--imx-border)', border: '1px solid var(--imx-border)' }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--imx-text-secondary)' }} />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-8 pb-safe" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        {!sent ? (
          <>
            <h1 className="text-3xl mb-2" style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}>
              Réinitialiser le mot de passe
            </h1>
            <p className="text-sm mb-10 leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
              Entrez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  className="input-field w-full pl-11"
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="btn-primary w-full"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Envoyer le lien'
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8"
              style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', boxShadow: '0 0 40px rgba(168,85,247,0.2)' }}
            >
              <Mail size={36} style={{ color: 'var(--imx-accent-light)' }} />
            </div>

            <h2 className="text-2xl mb-3 text-center" style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}>
              Email envoyé !
            </h2>
            <p className="text-sm text-center mb-12 max-w-sm leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
              Vérifiez votre boîte mail. Nous vous avons envoyé un lien pour réinitialiser votre mot de passe.
            </p>

            <button onClick={() => navigate('/login')} className="btn-primary w-full mb-3">
              Retour à la connexion
            </button>

            <button onClick={() => setSent(false)} className="btn-ghost w-full">
              Renvoyer l'émail
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
