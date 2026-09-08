import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { BackButton } from '../../components/BackButton';
import { ShieldCheck } from 'lucide-react';

export default function ProfilMotDePasse() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!navigator.onLine) {
      showToast('Une connexion internet est requise pour modifier votre mot de passe.', 'error');
      return;
    }

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
      showToast('Mot de passe modifié', 'success');
      navigate(-1);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container flex flex-col min-h-screen pb-24">
      <div className="px-4 pt-6 pb-4 flex items-center justify-between sticky top-0 z-40" style={{ background: 'var(--imx-bg-app)' }}>
        <BackButton />
        <h1 className="text-lg font-nunito font-black text-[var(--imx-text-primary)]">Mot de passe</h1>
        <div className="w-10"></div>
      </div>

      <div className="px-4 py-2 space-y-6">
        <div className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
          <ShieldCheck size={18} className="text-[var(--imx-accent-glow)] flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-[var(--imx-accent-glow)]" style={{ fontFamily: 'Space Grotesk' }}>
            Choisissez un mot de passe d'au moins 8 caractères, différent de vos autres comptes.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-[var(--imx-text-muted)] px-1" style={{ fontFamily: 'Space Grotesk' }}>
            Nouveau mot de passe
          </label>
          <input
            type="password"
            className="input-field w-full"
            placeholder="Min. 8 caractères"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-[var(--imx-text-muted)] px-1" style={{ fontFamily: 'Space Grotesk' }}>
            Confirmer le mot de passe
          </label>
          <input
            type="password"
            className="input-field w-full"
            placeholder="Retapez le mot de passe"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
        </div>

        <button
          onClick={handleChangePassword}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Mise à jour...' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}
