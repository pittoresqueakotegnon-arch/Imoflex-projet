import React, { useState } from 'react';
import { X, AlertCircle, Headset, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { haptics } from '../lib/haptics';

interface ReportProblemModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  'Problème technique',
  'Problème avec une annonce',
  'Problème de paiement',
  'Problème avec une demande/location',
  'Signaler un comportement',
  'Autre',
];

export const ReportProblemModal: React.FC<ReportProblemModalProps> = ({ isOpen, onClose }) => {
  const { user, role } = useAuth();
  const { showToast } = useToast();
  
  const [category, setCategory] = useState<string>('');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !message.trim()) {
      showToast('Veuillez remplir tous les champs obligatoires.', 'error');
      return;
    }

    if (!user && !contactEmail.trim()) {
      showToast('Veuillez fournir une adresse email pour vous recontacter.', 'error');
      return;
    }

    setIsSubmitting(true);
    haptics.light();

    try {
      const pageContext = window.location.pathname;
      const match = pageContext.match(/\/annonce\/([a-zA-Z0-9-]+)/);
      const listingId = match ? match[1] : null;

      const { error } = await supabase.from('support_tickets').insert({
        user_id: user?.id || null,
        role: user ? role : 'visiteur',
        category,
        message,
        page_context: pageContext,
        listing_id: listingId,
        contact_email: user ? null : contactEmail,
      });

      if (error) throw error;

      setIsSuccess(true);
      haptics.success();
      setTimeout(() => {
        setIsSuccess(false);
        setCategory('');
        setMessage('');
        setContactEmail('');
        onClose();
      }, 2500);

    } catch (err: any) {
      console.error('Erreur lors du signalement:', err);
      showToast('Une erreur est survenue. Veuillez réessayer.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div 
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[400px] overflow-hidden flex flex-col"
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F3FF] flex items-center justify-center">
              <Headset size={20} className="text-[#7B3FE4]" />
            </div>
            <div>
              <h2 className="font-nunito font-900 text-[17px] text-[#17132B]">Besoin d'aide ?</h2>
              <p className="font-space-grotesk text-[11.5px] text-gray-400 font-medium">Signalez un problème ou contactez-nous</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 bg-[#ECFDF5] rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={32} className="text-[#10B981]" />
              </div>
              <h3 className="font-nunito font-800 text-[18px] text-[#17132B] mb-2">Signalement envoyé</h3>
              <p className="font-space-grotesk text-[13px] text-gray-500">
                Notre équipe va traiter votre demande dans les plus brefs délais. Merci !
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div>
                <label className="block text-[12.5px] font-bold text-[#17132B] mb-1.5 font-space-grotesk">Catégorie du problème</label>
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[14px] font-space-grotesk outline-none focus:border-[#7B3FE4] focus:ring-2 focus:ring-[#7B3FE4]/20 transition-all appearance-none"
                  required
                >
                  <option value="" disabled>Sélectionnez une catégorie...</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {!user && (
                <div>
                  <label className="block text-[12.5px] font-bold text-[#17132B] mb-1.5 font-space-grotesk">Votre adresse email</label>
                  <input 
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="Pour vous recontacter..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[14px] font-space-grotesk outline-none focus:border-[#7B3FE4] focus:ring-2 focus:ring-[#7B3FE4]/20 transition-all"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-[12.5px] font-bold text-[#17132B] mb-1.5 font-space-grotesk">Décrivez votre problème</label>
                <textarea 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Soyez le plus précis possible pour nous aider à comprendre le problème..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[14px] font-space-grotesk outline-none focus:border-[#7B3FE4] focus:ring-2 focus:ring-[#7B3FE4]/20 transition-all resize-none h-[120px]"
                  required
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#7B3FE4] text-white rounded-xl py-3.5 font-bold text-[14px] font-nunito shadow-lg shadow-[#7B3FE4]/25 active:scale-95 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Envoyer le signalement</>
                  )}
                </button>
                <p className="text-center mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-400 font-space-grotesk">
                  <AlertCircle size={12} />
                  Vos informations de session sont automatiquement ajoutées.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
