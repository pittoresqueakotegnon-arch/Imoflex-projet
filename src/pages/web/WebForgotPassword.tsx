import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAuthRedirectUrl } from '../../lib/domainConfig';

export default function WebForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const redirectUrl = getAuthRedirectUrl('/web/reset-password');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (resetError) throw resetError;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'envoi du lien.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: 'var(--imx-bg-app)' }}>
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-8">
          <Link to="/web" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: '#F1EBFF' }}>
              <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl font-black text-[#17132B]" style={{ fontFamily: 'Sora, sans-serif' }}>
              Imo<span style={{ color: 'var(--imx-accent)' }}>Flex</span>
            </span>
          </Link>
        </div>

        <div
          className="rounded-2xl p-6 sm:p-8 border shadow-sm"
          style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
        >
          {!sent ? (
            <>
              <Link
                to="/web/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold mb-6 transition-colors"
                style={{ color: 'var(--imx-text-muted)' }}
              >
                <ArrowLeft size={14} />
                Retour à la connexion
              </Link>

              <h1
                className="text-2xl font-black mb-2"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Mot de passe oublié ?
              </h1>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--imx-text-secondary)' }}>
                Saisissez l'adresse e-mail associée à votre compte ImoFlex. Nous vous enverrons un lien sécurisé pour créer un nouveau mot de passe.
              </p>

              {error && (
                <div
                  className="flex items-start gap-2.5 p-3 rounded-xl mb-5 text-sm"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}
                >
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--imx-text-primary)' }}>
                    Adresse e-mail
                  </label>
                  <div className="relative">
                    <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-colors"
                      style={{
                        background: 'var(--imx-surface-2)',
                        border: '1.5px solid var(--imx-border)',
                        color: 'var(--imx-text-primary)',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--imx-accent)')}
                      onBlur={(e) => (e.target.style.borderColor = 'var(--imx-border)')}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all shadow-md hover:opacity-90 disabled:opacity-50"
                  style={{ background: 'var(--imx-accent)' }}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Envoyer le lien de réinitialisation
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: '#ECFDF5', color: '#10B981' }}
              >
                <CheckCircle2 size={32} />
              </div>

              <h2
                className="text-xl font-black mb-2"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Lien envoyé !
              </h2>

              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--imx-text-secondary)' }}>
                Un e-mail contenant les instructions de réinitialisation a été envoyé à <strong>{email}</strong>. Vérifiez également vos courriers indésirables (spams).
              </p>

              <div className="space-y-2">
                <Link
                  to="/web/login"
                  className="w-full inline-flex items-center justify-center py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: 'var(--imx-accent)' }}
                >
                  Retour à la page de connexion
                </Link>

                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="w-full py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-800"
                >
                  Renvoyer avec une autre adresse
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
