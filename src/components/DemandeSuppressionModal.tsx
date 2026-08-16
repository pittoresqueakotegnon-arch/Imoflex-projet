import React, { useState } from 'react';
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
      // 1. Tenter via la RPC sécurisée request_listing_deletion
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm sm:max-w-md rounded-2xl p-4 sm:p-5 border shadow-2xl transition-all relative my-auto max-h-[92vh] flex flex-col bg-[#1A1230] border-white/10 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="font-nunito font-bold text-sm sm:text-base text-white truncate">
                Demander la suppression
              </h2>
              <p className="text-[11px] sm:text-xs text-purple-200/70 font-space-grotesk truncate">
                {listing.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            className="p-1.5 rounded-lg text-purple-200/60 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body with scrolling */}
        <form onSubmit={handleSubmit} className="mt-3 space-y-3.5 overflow-y-auto pr-0.5 flex-1">
          <div className="p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] sm:text-xs text-amber-200/90 leading-relaxed font-space-grotesk">
            Vous êtes sur le point de demander la suppression de cette annonce. Votre demande sera examinée par l'administration avant toute suppression définitive.
          </div>

          <div>
            <label className="block text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-purple-200/70 mb-2 font-space-grotesk">
              Motif de suppression <span className="text-red-400">*</span>
            </label>
            <div className="space-y-1.5 sm:space-y-2">
              {DELETION_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <label
                    key={reason}
                    className={`flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-500/20 font-semibold text-white shadow-sm ring-1 ring-purple-500/40'
                        : 'border-white/10 bg-white/5 text-purple-100/80 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deletionReason"
                      value={reason}
                      checked={isSelected}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-purple-500 w-3.5 h-3.5 sm:w-4 sm:h-4 cursor-pointer"
                    />
                    <span className="flex-1 leading-snug">{reason}</span>
                    {isSelected && <CheckCircle2 size={14} className="text-purple-400 flex-shrink-0" />}
                  </label>
                );
              })}
            </div>
          </div>

          {selectedReason === 'Autre' && (
            <div className="animate-fade-in">
              <label className="block text-[11px] sm:text-xs font-semibold text-purple-200/80 mb-1 font-space-grotesk">
                Précisez la raison <span className="text-red-400">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Indiquez les détails de votre demande..."
                rows={2}
                required
                className="w-full rounded-xl p-2.5 sm:p-3 text-xs bg-white/5 border border-white/10 text-white placeholder-purple-200/30 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-300 bg-red-500/15 border border-red-500/30 p-2.5 rounded-xl leading-relaxed">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-semibold text-purple-200/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 sm:gap-2 px-4 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all shadow-md shadow-purple-600/30 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Envoi...</span>
                </>
              ) : (
                <>
                  <Send size={13} />
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
