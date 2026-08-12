import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { BackButton } from '../../components/BackButton';
import { Wallet } from 'lucide-react';

export default function ProfilMobileMoney() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [mobileMoneyNumber, setMobileMoneyNumber] = useState(profile?.mobile_money_number || '');
  const [preferredOperator, setPreferredOperator] = useState<'mtn' | 'moov' | 'celtiis' | ''>(
    profile?.preferred_operator || ''
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('users').update({
        mobile_money_number: mobileMoneyNumber || null,
        preferred_operator: preferredOperator || null,
      }).eq('id', profile.id);

      if (error) throw new Error(error.message);
      await refreshProfile();
      showToast('Numéro Mobile Money mis à jour', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="page-container flex flex-col min-h-screen pb-24">
      <div className="px-4 pt-6 pb-4 flex items-center justify-between sticky top-0 z-40" style={{ background: 'var(--imx-bg-app)' }}>
        <BackButton />
        <h1 className="text-lg font-nunito font-black text-[var(--imx-text-primary)]">Mobile Money</h1>
        <div className="w-10"></div>
      </div>

      <div className="px-4 py-2 space-y-6">
        <div className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
          <Wallet size={18} className="text-[var(--imx-accent-glow)] flex-shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-[var(--imx-accent-glow)]" style={{ fontFamily: 'Space Grotesk' }}>
            Ce numéro sera pré-rempli automatiquement à chaque paiement ou retrait, pour aller plus vite.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-[var(--imx-text-muted)] px-1" style={{ fontFamily: 'Space Grotesk' }}>
            Numéro de téléphone
          </label>
          <input
            type="tel"
            className="input-field w-full"
            placeholder="+229 XX XX XX XX"
            value={mobileMoneyNumber}
            onChange={e => setMobileMoneyNumber(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-widest text-[var(--imx-text-muted)] px-1" style={{ fontFamily: 'Space Grotesk' }}>
            Opérateur
          </label>
          <div className="flex gap-2">
            {(['mtn', 'moov', 'celtiis'] as const).map(op => (
              <button
                key={op}
                type="button"
                onClick={() => setPreferredOperator(op)}
                className="flex-1 py-3 text-xs font-bold rounded-xl border transition-all"
                style={{
                  background: preferredOperator === op ? 'var(--imx-accent)' : 'var(--imx-surface-2)',
                  borderColor: preferredOperator === op ? 'var(--imx-accent)' : 'var(--imx-border)',
                  color: preferredOperator === op ? 'white' : 'var(--imx-text-secondary)'
                }}
              >
                {op.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full"
        >
          {saving ? 'Sauvegarde...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
