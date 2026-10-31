import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function WebResetPassword() {
  const navigate = useNavigate();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let resolved = false;

    const finalize = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      setHasRecoverySession(ok);
      setCheckingSession(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finalize(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        finalize(true);
      }
    });

    const timeout = setTimeout(() => finalize(false), 4500);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setError('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe saisis ne correspondent pas.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      setDone(true);
      await supabase.auth.signOut();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Impossible de mettre à jour le mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: 'var(--imx-bg-app)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
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
          {checkingSession ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div
                className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mb-4"
                style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }}
              />
              <p className="text-sm" style={{ color: 'var(--imx-text-muted)' }}>
                Vérification du lien de récupération…
              </p>
            </div>
          ) : !hasRecoverySession ? (
            <div className="text-center py-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: '#FEF2F2', color: '#DC2626' }}
              >
                <AlertTriangle size={32} />
              </div>

              <h1
                className="text-xl font-black mb-2"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Lien invalide ou expiré
              </h1>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--imx-text-secondary)' }}>
                Ce lien de réinitialisation est invalide ou son délai de validité est écoulé. Veuillez demander un nouveau lien sécurisé.
              </p>

              <Link
                to="/web/forgot-password"
                className="w-full inline-flex items-center justify-center py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--imx-accent)' }}
              >
                Demander un nouveau lien
              </Link>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: '#ECFDF5', color: '#10B981' }}
              >
                <ShieldCheck size={32} />
              </div>

              <h2
                className="text-xl font-black mb-2"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Mot de passe mis à jour !
              </h2>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--imx-text-secondary)' }}>
                Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter avec vos nouveaux identifiants.
              </p>

              <button
                onClick={() => navigate('/web/login', { replace: true })}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all shadow-md hover:opacity-90"
                style={{ background: 'var(--imx-accent)' }}
              >
                Se connecter
                <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <>
              <h1
                className="text-2xl font-black mb-2"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Nouveau mot de passe
              </h1>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--imx-text-secondary)' }}>
                Définissez un mot de passe sécurisé d'au moins 8 caractères pour protéger l'accès à votre compte.
              </p>

              {error && (
                <div
                  className="flex items-start gap-2.5 p-3 rounded-xl mb-5 text-sm"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}
                >
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--imx-text-primary)' }}>
                    Nouveau mot de passe
                  </label>
                  <div className="relative">
                    <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      className="w-full pl-10 pr-11 py-3 rounded-xl text-sm outline-none transition-colors"
                      style={{
                        background: 'var(--imx-surface-2)',
                        border: '1.5px solid var(--imx-border)',
                        color: 'var(--imx-text-primary)',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--imx-accent)')}
                      onBlur={(e) => (e.target.style.borderColor = 'var(--imx-border)')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--imx-text-primary)' }}>
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
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
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all shadow-md hover:opacity-90 disabled:opacity-50 mt-2"
                  style={{ background: 'var(--imx-accent)' }}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Enregistrer le mot de passe
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
