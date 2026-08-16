import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Send, Loader2, CheckCircle2 } from 'lucide-react';
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

  // Bloquer le scroll d'arrière-plan quand la modale est ouverte
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Fermeture via touche Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, submitting, onClose]);

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
      const finalCustomReason = selectedReason === 'Autre' ? customReason.trim() : null;
      
      // 1. Appel RPC sécurisé (gère le statut + la notification admin)
      const { error: rpcErr } = await supabase.rpc('request_listing_deletion', {
        p_listing_id: listing.id,
        p_reason: selectedReason,
        p_custom_reason: finalCustomReason,
      });

      if (rpcErr) {
        // Fallback sur l'insert direct
        const { error: insertErr } = await supabase
          .from('listing_deletion_requests')
          .insert({
            listing_id: listing.id,
            owner_id: listing.owner_id,
            reason: selectedReason,
            custom_reason: finalCustomReason,
            status: 'pending',
          });

        if (insertErr) {
          if (insertErr.code === '23505' || insertErr.message?.includes('unique')) {
            throw new Error('Une demande de suppression est déjà en cours pour cette annonce.');
          }
          throw insertErr;
        }
      }

      showToast('Votre demande de suppression a été envoyée à l\'administration.', 'success');
      onSuccess(listing.id);
      onClose();
    } catch (err: any) {
      console.error('Erreur lors de l\'envoi de la demande de suppression:', err);
      const errMsg = err?.message || 'Une erreur est survenue lors de l\'envoi de la demande.';
      setError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm sm:max-w-md rounded-3xl p-4 sm:p-6 border shadow-2xl transition-all relative my-auto max-h-[92vh] flex flex-col"
        style={{
          backgroundColor: 'var(--imx-surface)',
          borderColor: 'var(--imx-border)',
          boxShadow: 'var(--imx-card-shadow), 0 20px 50px rgba(0, 0, 0, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between pb-3.5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--imx-border)' }}
        >
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 bg-amber-500/15 text-amber-500 border border-amber-500/20">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <h2
                className="font-nunito font-bold text-base sm:text-lg truncate"
                style={{ color: 'var(--imx-text-primary)' }}
              >
                Demander la suppression
              </h2>
              <p
                className="text-xs font-space-grotesk truncate opacity-80"
                style={{ color: 'var(--imx-text-secondary)' }}
              >
                {listing.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 hover:opacity-80"
            style={{
              backgroundColor: 'var(--imx-surface-2)',
              color: 'var(--imx-text-secondary)',
              border: '1px solid var(--imx-border)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-3.5 space-y-4 overflow-y-auto pr-0.5 flex-1">
          {/* Avertissement contextuel */}
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-600 dark:text-amber-300/90 leading-relaxed font-space-grotesk">
            Votre demande sera examinée par l'administration avant suppression définitive. Pendant ce temps, l'annonce sera marquée <strong>en attente de suppression</strong>.
          </div>

          {/* Choix du motif */}
          <div>
            <label
              className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider mb-2 font-space-grotesk"
              style={{ color: 'var(--imx-text-secondary)' }}
            >
              Motif de suppression <span className="text-red-400">*</span>
            </label>
            <div className="space-y-2">
              {DELETION_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <label
                    key={reason}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[var(--imx-accent)] bg-[var(--imx-accent)]/10 font-bold shadow-sm ring-1 ring-[var(--imx-accent)]/30'
                        : 'border-[var(--imx-border)] bg-[var(--imx-surface-2)] hover:border-[var(--imx-accent)]/40'
                    }`}
                    style={{
                      color: isSelected ? 'var(--imx-accent-glow, var(--imx-accent))' : 'var(--imx-text-primary)',
                    }}
                  >
                    <input
                      type="radio"
                      name="deletionReason"
                      value={reason}
                      checked={isSelected}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-[var(--imx-accent)] w-4 h-4 cursor-pointer"
                    />
                    <span className="flex-1 leading-snug">{reason}</span>
                    {isSelected && (
                      <CheckCircle2 size={16} className="text-[var(--imx-accent)] flex-shrink-0" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Précision si "Autre" */}
          {selectedReason === 'Autre' && (
            <div className="animate-fade-in">
              <label
                className="block text-xs font-semibold mb-1.5 font-space-grotesk"
                style={{ color: 'var(--imx-text-secondary)' }}
              >
                Précisez la raison <span className="text-red-400">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Indiquez les détails de votre demande..."
                rows={2}
                required
                className="w-full rounded-2xl p-3 text-xs border focus:outline-none transition-all resize-none font-space-grotesk"
                style={{
                  backgroundColor: 'var(--imx-surface-2)',
                  borderColor: 'var(--imx-border)',
                  color: 'var(--imx-text-primary)',
                }}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 dark:text-red-300 bg-red-500/10 border border-red-500/25 p-3 rounded-2xl leading-relaxed">
              {error}
            </div>
          )}

          {/* Actions */}
          <div
            className="flex items-center justify-end gap-2.5 pt-3 border-t flex-shrink-0"
            style={{ borderColor: 'var(--imx-border)' }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-2xl text-xs font-semibold transition-colors"
              style={{
                color: 'var(--imx-text-secondary)',
                backgroundColor: 'var(--imx-surface-2)',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-white shadow-lg active:scale-95 transition-all disabled:opacity-50"
              style={{
                backgroundColor: 'var(--imx-accent)',
                boxShadow: '0 4px 14px rgba(123, 63, 228, 0.4)',
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Envoi...</span>
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
