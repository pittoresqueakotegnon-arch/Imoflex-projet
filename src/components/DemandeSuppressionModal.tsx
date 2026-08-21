import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useTheme } from '../contexts/ThemeContext';

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
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3.5 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className={`w-full max-w-sm sm:max-w-md rounded-3xl p-4 sm:p-6 border shadow-2xl transition-all relative my-auto max-h-[92vh] flex flex-col ${
          isLight
            ? 'bg-white text-slate-900 border-slate-200 shadow-slate-900/20'
            : 'bg-[#1A1230] text-white border-white/10 shadow-black/60'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-start justify-between pb-3.5 border-b flex-shrink-0 ${
            isLight ? 'border-slate-100' : 'border-white/10'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                isLight
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <h2
                className={`font-nunito font-bold text-base sm:text-lg truncate ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Demander la suppression
              </h2>
              <p
                className={`text-xs font-space-grotesk truncate ${
                  isLight ? 'text-slate-500' : 'text-purple-200/70'
                }`}
              >
                {listing.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Fermer"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
              isLight
                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                : 'bg-white/10 text-purple-200/70 hover:bg-white/20 hover:text-white'
            }`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-3.5 space-y-4 overflow-y-auto pr-0.5 flex-1">
          {/* Avertissement */}
          <div
            className={`p-3 rounded-2xl border text-xs leading-relaxed font-space-grotesk ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-200/90'
            }`}
          >
            Votre demande sera examinée par l'administration avant toute suppression définitive. Pendant ce temps, l'annonce sera marquée <strong>en attente de suppression</strong>.
          </div>

          {/* Motif */}
          <div>
            <label
              className={`block text-[11px] sm:text-xs font-bold uppercase tracking-wider mb-2 font-space-grotesk ${
                isLight ? 'text-slate-600' : 'text-purple-200/70'
              }`}
            >
              Motif de suppression <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {DELETION_REASONS.map((reason) => {
                const isSelected = selectedReason === reason;
                return (
                  <label
                    key={reason}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? isLight
                          ? 'border-purple-600 bg-purple-50 text-purple-950 font-bold ring-2 ring-purple-500/30 shadow-sm'
                          : 'border-purple-500 bg-purple-500/20 text-white font-bold ring-1 ring-purple-500/50 shadow-sm'
                        : isLight
                        ? 'border-slate-200 bg-slate-50/80 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        : 'border-white/10 bg-white/5 text-purple-100/80 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deletionReason"
                      value={reason}
                      checked={isSelected}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-purple-600 w-4 h-4 cursor-pointer"
                    />
                    <span className="flex-1 leading-snug">{reason}</span>
                    {isSelected && (
                      <CheckCircle2
                        size={16}
                        className={isLight ? 'text-purple-600 flex-shrink-0' : 'text-purple-400 flex-shrink-0'}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Si Autre */}
          {selectedReason === 'Autre' && (
            <div className="animate-fade-in">
              <label
                className={`block text-xs font-semibold mb-1.5 font-space-grotesk ${
                  isLight ? 'text-slate-700' : 'text-purple-200/80'
                }`}
              >
                Précisez la raison <span className="text-red-500">*</span>
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Indiquez les détails de votre demande..."
                rows={2}
                required
                className={`w-full rounded-2xl p-3 text-xs border focus:outline-none transition-all resize-none font-space-grotesk ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-purple-600 focus:ring-1 focus:ring-purple-600'
                    : 'bg-white/5 border-white/10 text-white placeholder:text-purple-200/30 focus:border-purple-500 focus:ring-1 focus:ring-purple-500'
                }`}
              />
            </div>
          )}

          {error && (
            <div
              className={`text-xs p-3 rounded-2xl leading-relaxed border ${
                isLight
                  ? 'text-red-700 bg-red-50 border-red-200'
                  : 'text-red-300 bg-red-500/15 border-red-500/30'
              }`}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div
            className={`flex items-center justify-end gap-2.5 pt-3 border-t flex-shrink-0 ${
              isLight ? 'border-slate-100' : 'border-white/10'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`px-4 py-2.5 rounded-2xl text-xs font-semibold transition-colors ${
                isLight
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/5 text-purple-200/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all shadow-md shadow-purple-600/30 disabled:opacity-50"
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
