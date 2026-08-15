import React, { useState } from 'react';
import { X, AlertTriangle, Send, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

const DELETION_REASONS = [
  'Logement déjà loué',
  "Logement n'est plus disponible",
  'Erreur dans l’annonce',
  'Je souhaite retirer temporairement l’annonce',
  'Autre',
] as const;

interface DemandeSuppressionModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: {
    id: string;
    title: string;
    owner_id: string;
  };
  onSuccess: (listingId: string) => void;
}

export const DemandeSuppressionModal: React.FC<DemandeSuppressionModalProps> = ({
  isOpen,
  onClose,
  listing,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [selectedReason, setSelectedReason] = useState<string>(DELETION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedReason === 'Autre' && !customReason.trim()) {
      setError('Veuillez préciser la raison de votre demande.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Vérifier si une demande en attente existe déjà
      const { data: existing, error: checkErr } = await supabase
        .from('listing_deletion_requests')
        .select('id')
        .eq('listing_id', listing.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (checkErr && checkErr.code !== 'PGRST116') {
        throw checkErr;
      }

      if (existing) {
        showToast('Une demande de suppression est déjà en cours pour cette annonce.', 'error');
        onClose();
        return;
      }

      // 2. Insérer la demande de suppression (le trigger Postgres trg_on_listing_deletion_requested passera automatiquement le statut de l'annonce à 'suppression_demandee')
      const { error: insertErr } = await supabase
        .from('listing_deletion_requests')
        .insert({
          listing_id: listing.id,
          owner_id: listing.owner_id,
          reason: selectedReason,
          custom_reason: selectedReason === 'Autre' ? customReason.trim() : null,
          status: 'pending',
        });

      if (insertErr) throw insertErr;

      showToast('Votre demande de suppression a été envoyée à l\'administration.', 'success');
      onSuccess(listing.id);
      onClose();
    } catch (err: any) {
      console.error('Erreur lors de l\'envoi de la demande de suppression:', err);
      setError(err?.message || 'Une erreur est survenue lors de l\'envoi de la demande.');
      showToast('Erreur lors de l\'envoi de la demande', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md rounded-2xl p-5 border shadow-2xl transition-all"
        style={{
          background: 'var(--imx-surface-1, #161622)',
          borderColor: 'var(--imx-border, rgba(255,255,255,0.1))',
          color: 'var(--imx-text-primary, #ffffff)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-[var(--imx-border)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="font-nunito font-bold text-base text-[var(--imx-text-primary)]">
                Demander la suppression
              </h2>
              <p className="text-xs text-[var(--imx-text-secondary)] font-space-grotesk truncate max-w-[230px]">
                {listing.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-[var(--imx-text-secondary)] hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 leading-relaxed font-space-grotesk">
            Vous êtes sur le point de demander la suppression de cette annonce. Votre demande sera examinée par l'administration avant toute suppression définitive.
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--imx-text-secondary)] mb-2 font-space-grotesk">
              Motif de suppression <span className="text-red-400">*</span>
            </label>
            <div className="space-y-2">
              {DELETION_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <label
                    key={reason}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/15 font-semibold text-white'
                        : 'border-[var(--imx-border)] bg-[var(--imx-surface-2)] text-[var(--imx-text-secondary)] hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deletionReason"
                      value={reason}
                      checked={isSelected}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-purple-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="flex-1">{reason}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {selectedReason === 'Autre' && (
            <div className="animate-fade-in">
              <label className="block text-xs font-semibold text-[var(--imx-text-secondary)] mb-1 font-space-grotesk">
                Précisez la raison <span className="text-red-400">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Indiquez les détails de votre demande de suppression..."
                rows={3}
                required
                className="w-full rounded-xl p-3 text-xs bg-[var(--imx-surface-2)] border border-[var(--imx-border)] text-[var(--imx-text-primary)] placeholder-[var(--imx-text-dim)] focus:border-purple-500 focus:outline-none transition-colors resize-none"
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[var(--imx-text-secondary)] hover:bg-white/5 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all shadow-md shadow-purple-600/30 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Envoi en cours...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Envoyer la demande</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
