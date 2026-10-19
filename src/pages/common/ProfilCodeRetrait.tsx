import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { BackButton } from '../../components/BackButton';
import { ShieldCheck, Lock, AlertTriangle, KeyRound, CheckCircle2, LifeBuoy } from 'lucide-react';
import { haptics } from '../../lib/haptics';

export default function ProfilCodeRetrait() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Mode initial setup
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Mode modification
  const [oldPin, setOldPin] = useState('');
  const [modifiedNewPin, setModifiedNewPin] = useState('');
  const [confirmModifiedPin, setConfirmModifiedPin] = useState('');

  // Erreur contextuelle dans le formulaire
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const checkPinStatus = async () => {
      if (!profile?.id) return;
      try {
        // Le PIN est stocké dans withdrawal_pins (pas de colonne has_withdrawal_pin sur users)
        const { count, error } = await supabase
          .from('withdrawal_pins')
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id', profile.id);

        if (error) throw error;
        if (active) {
          setHasPin((count ?? 0) > 0);
        }
      } catch (err) {
        console.error('Erreur vérification statut PIN:', err);
      } finally {
        if (active) setLoadingInitial(false);
      }
    };

    checkPinStatus();
    return () => { active = false; };
  }, [profile?.id]);

  // Validation 4 chiffres stricts
  const isValid4Digits = (val: string) => /^[0-9]{4}$/.test(val);

  // Configuration initiale
  const handleSetupInitialPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isValid4Digits(newPin)) {
      setFormError('Le code PIN doit comporter exactement 4 chiffres.');
      return;
    }
    if (newPin !== confirmPin) {
      setFormError('La confirmation ne correspond pas au code PIN saisi.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('set_initial_withdrawal_pin', { p_pin: newPin });
      if (error) throw error;

      if (data === true) {
        haptics.success();
        showToast('Code PIN de retrait configuré avec succès', 'success');
        setHasPin(true);
        setNewPin('');
        setConfirmPin('');
        navigate(-1);
      } else {
        throw new Error('Impossible de configurer le code PIN.');
      }
    } catch (err: unknown) {
      haptics.error();
      const msg = err instanceof Error ? err.message : 'Une erreur est survenue';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Modification du code PIN existant
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isValid4Digits(oldPin)) {
      setFormError("L'ancien code PIN doit comporter 4 chiffres.");
      return;
    }
    if (!isValid4Digits(modifiedNewPin)) {
      setFormError('Le nouveau code PIN doit comporter exactement 4 chiffres.');
      return;
    }
    if (modifiedNewPin !== confirmModifiedPin) {
      setFormError('La confirmation ne correspond pas au nouveau code PIN.');
      return;
    }
    if (oldPin === modifiedNewPin) {
      setFormError('Le nouveau code PIN doit être différent de l\'ancien.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('change_withdrawal_pin', {
        p_old_pin: oldPin,
        p_new_pin: modifiedNewPin,
      });

      if (error) {
        throw error;
      }

      // La fonction retourne false si l'ancien PIN est incorrect (sans lever d'exception pour compter les essais)
      if (data === false) {
        haptics.error();
        const errorMsg = "L'ancien code PIN est incorrect. Attention : 3 tentatives erronées bloquent les retraits pendant 15 minutes.";
        setFormError(errorMsg);
        showToast(errorMsg, 'error');
        setOldPin('');
        return;
      }

      haptics.success();
      showToast('Code PIN de retrait modifié avec succès', 'success');
      setOldPin('');
      setModifiedNewPin('');
      setConfirmModifiedPin('');
      navigate(-1);
    } catch (err: unknown) {
      haptics.error();
      const msg = err instanceof Error ? err.message : 'Erreur lors de la mise à jour du code PIN';
      setFormError(msg);
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container flex flex-col min-h-screen pb-24">
      {/* Header */}
      <div
        className="px-4 pt-6 pb-4 flex items-center justify-between sticky top-0 z-40 border-b border-[var(--imx-border)]"
        style={{ background: 'var(--imx-bg-app)' }}
      >
        <BackButton />
        <h1 className="text-lg font-nunito font-black text-[var(--imx-text-primary)]">
          Code PIN de retrait
        </h1>
        <div className="w-10" />
      </div>

      <div className="px-4 py-4 space-y-6">
        {loadingInitial ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin border-[var(--imx-accent)]" />
            <p className="text-xs text-[var(--imx-text-muted)] font-medium">Chargement du statut de sécurité...</p>
          </div>
        ) : hasPin ? (
          /* Mode modification */
          <>
            <div
              className="flex items-start gap-3 p-4 rounded-2xl"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
            >
              <ShieldCheck size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-blue-600 dark:text-blue-400 space-y-1">
                <p className="font-bold">Code PIN actif et sécurisé</p>
                <p>
                  Ce code à 4 chiffres protège vos fonds et autorise chacun de vos retraits Mobile Money vers votre numéro vérifié.
                </p>
              </div>
            </div>

            <div
              className="flex items-start gap-3 p-3.5 rounded-2xl"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-red-600 dark:text-red-400">
                <strong>Protection anti-bruteforce :</strong> En cas de 3 tentatives incorrectes successives, tout retrait et modification seront automatiquement bloqués pendant 15 minutes.
              </p>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleChangePin} className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="old-pin-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--imx-text-muted)] px-1"
                  style={{ fontFamily: 'Space Grotesk' }}
                >
                  Ancien code PIN (4 chiffres)
                </label>
                <input
                  id="old-pin-input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="one-time-code"
                  placeholder="••••"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="input-field w-full text-center tracking-[0.5em] text-lg font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="new-pin-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--imx-text-muted)] px-1"
                  style={{ fontFamily: 'Space Grotesk' }}
                >
                  Nouveau code PIN (4 chiffres)
                </label>
                <input
                  id="new-pin-input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={modifiedNewPin}
                  onChange={(e) => setModifiedNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="input-field w-full text-center tracking-[0.5em] text-lg font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirm-new-pin-input"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--imx-text-muted)] px-1"
                  style={{ fontFamily: 'Space Grotesk' }}
                >
                  Confirmer le nouveau code PIN
                </label>
                <input
                  id="confirm-new-pin-input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={confirmModifiedPin}
                  onChange={(e) => setConfirmModifiedPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="input-field w-full text-center tracking-[0.5em] text-lg font-bold"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting || oldPin.length !== 4 || modifiedNewPin.length !== 4 || confirmModifiedPin.length !== 4}
                className="btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 mt-4"
              >
                {submitting ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound size={16} /> Mettre à jour mon code PIN
                  </>
                )}
              </button>
            </form>

            {/* Assistance code oublié */}
            <div className="pt-4 border-t border-[var(--imx-border)] text-center">
              <p className="text-xs text-[var(--imx-text-muted)] mb-2">Code oublié ou compte bloqué ?</p>
              <button
                type="button"
                onClick={() => navigate('/aide')}
                className="text-xs font-bold text-[var(--imx-accent)] hover:underline inline-flex items-center gap-1.5"
              >
                <LifeBuoy size={14} /> Contacter le support administrateur
              </button>
            </div>
          </>
        ) : (
          /* Mode configuration initiale */
          <>
            <div
              className="flex items-start gap-3 p-4 rounded-2xl"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <Lock size={20} className="text-[var(--imx-accent-glow)] flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-[var(--imx-accent-glow)] space-y-1">
                <p className="font-bold">Configuration du code secret de retrait</p>
                <p>
                  Pour retirer vos loyers perçus vers MTN, Moov ou Celtiis, définissez un code confidentiel à 4 chiffres. Ne communiquez jamais ce code.
                </p>
              </div>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-500 font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSetupInitialPin} className="space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor="setup-new-pin"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--imx-text-muted)] px-1"
                  style={{ fontFamily: 'Space Grotesk' }}
                >
                  Code PIN secret (4 chiffres)
                </label>
                <input
                  id="setup-new-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="input-field w-full text-center tracking-[0.5em] text-lg font-bold"
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="setup-confirm-pin"
                  className="block text-xs font-bold uppercase tracking-wider text-[var(--imx-text-muted)] px-1"
                  style={{ fontFamily: 'Space Grotesk' }}
                >
                  Confirmer le code PIN
                </label>
                <input
                  id="setup-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="input-field w-full text-center tracking-[0.5em] text-lg font-bold"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting || newPin.length !== 4 || confirmPin.length !== 4}
                className="btn-primary w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 mt-4"
              >
                {submitting ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Enregistrer mon code PIN
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
