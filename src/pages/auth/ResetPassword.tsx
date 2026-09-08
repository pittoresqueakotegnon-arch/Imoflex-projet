import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';

// ─────────────────────────────────────────────────────────────────────────────
// ResetPassword — Destination réelle du lien "mot de passe oublié"
//
// Contexte : ForgotPassword.tsx envoie un email via
// supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` }).
// Quand l'utilisateur clique sur ce lien, le client Supabase détecte automatiquement
// le jeton de récupération dans l'URL et ouvre une session valide AVANT même que
// cette page ne s'affiche (comportement natif de supabase-js, détection dans l'URL).
//
// Cette page doit donc être atteinte AVANT toute redirection basée sur "utilisateur
// déjà connecté" (voir Login.tsx qui redirige automatiquement vers le dashboard dès
// que `user` existe) — sans quoi le lien "connecte" silencieusement la personne sans
// jamais lui proposer de changer son mot de passe. C'est exactement le bug corrigé ici.
// ─────────────────────────────────────────────────────────────────────────────

export default function ResetPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Le lien de récupération peut arriver soit avant que le SDK ait fini de
    // parser l'URL (événement PASSWORD_RECOVERY), soit avec une session déjà
    // posée (cas le plus courant selon le timing du montage du composant).
    // On couvre les deux cas plutôt que de supposer un seul ordre d'exécution.
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

    // Si aucune session n'apparaît après un court délai, le lien est invalide,
    // expiré, ou la page a été ouverte directement sans passer par l'email.
    const timeout = setTimeout(() => finalize(false), 4000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 8) {
      showToast('Le mot de passe doit contenir au moins 8 caractères', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Les mots de passe ne correspondent pas', 'error');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);

      setDone(true);
      // Par sécurité, on ferme la session ouverte automatiquement par le lien
      // de récupération : on ne veut pas qu'un lien d'email reçu (potentiellement
      // consulté par quelqu'un d'autre sur un autre appareil) équivaille à une
      // connexion complète sans jamais retaper d'identifiants.
      await supabase.auth.signOut();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du mot de passe', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--imx-bg-app)]">
        <div className="w-8 h-8 border-3 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasRecoverySession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--imx-bg-app)] text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h1 className="text-xl font-nunito font-black mb-2 text-[var(--imx-text-primary)]">Lien invalide ou expiré</h1>
        <p className="text-sm mb-8 max-w-sm leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
          Ce lien de réinitialisation n'est plus valable. Demandez-en un nouveau depuis la page de connexion.
        </p>
        <button onClick={() => navigate('/forgot-password')} className="btn-primary w-full max-w-xs">
          Redemander un lien
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-[var(--imx-bg-app)] text-center">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <ShieldCheck size={36} className="text-[#22C55E]" />
        </div>
        <h2 className="text-2xl mb-3 font-nunito font-black text-[var(--imx-text-primary)]">Mot de passe modifié !</h2>
        <p className="text-sm mb-10 max-w-sm leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
          Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
        </p>
        <button onClick={() => navigate('/login', { replace: true })} className="btn-primary w-full max-w-xs">
          Se connecter
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--imx-bg-app)]">
      <div
        className="flex-1 flex flex-col px-6 justify-center"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        }}
      >
        <h1 className="text-3xl mb-2 font-nunito font-black text-[var(--imx-text-primary)]">
          Nouveau mot de passe
        </h1>
        <p className="text-sm mb-10 leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
          Choisissez un nouveau mot de passe pour votre compte.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
              <Lock size={18} />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
              required
              minLength={8}
              className="input-field w-full pl-11 pr-12"
              placeholder="Nouveau mot de passe"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: '#6B5F8F' }}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
              <Lock size={18} />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
              minLength={8}
              className="input-field w-full pl-11"
              placeholder="Confirmer le mot de passe"
              autoComplete="new-password"
            />
          </div>

          <p className="text-xs" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-muted)' }}>
            8 caractères minimum.
          </p>

          <button type="submit" disabled={loading || !newPassword || !confirmPassword} className="btn-primary w-full mt-2">
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              'Mettre à jour le mot de passe'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
