import React, { useEffect } from 'react';
import { Share2, Check, ExternalLink } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Share } from '@capacitor/share';
import { haptics } from '../../lib/haptics';
import { useToast } from '../Toast';

export interface PaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  recipientName: string;
  propertyName?: string;
  transactionId?: string;
  date?: string;
  onViewReceipt?: () => void;
}

export const PaymentSuccessModal: React.FC<PaymentSuccessModalProps> = ({
  isOpen,
  onClose,
  amount,
  recipientName,
  propertyName,
  transactionId,
  date,
  onViewReceipt,
}) => {
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      haptics.success();
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.5 },
          colors: ['#22C55E', '#FBBF24', '#0EA5E9', '#7B3FE4'],
        });
      } catch {
        // ignore if canvas not supported
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formattedAmount = new Intl.NumberFormat('fr-FR').format(amount);
  const formattedDate = date ? new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : new Date().toLocaleDateString('fr-FR');

  const shareText = `✅ Reçu de paiement ImoFlex\nMontant : ${formattedAmount} FCFA\nBénéficiaire : ${recipientName}${propertyName ? `\nLogement : ${propertyName}` : ''}\nDate : ${formattedDate}${transactionId ? `\nRéférence : ${transactionId}` : ''}\n\nEffectué via ImoFlex.`;

  const handleShare = async () => {
    haptics.light();
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Reçu de paiement ImoFlex',
          text: shareText,
        });
      } else {
        await Share.share({
          title: 'Reçu de paiement ImoFlex',
          text: shareText,
          dialogTitle: 'Partager le reçu de loyer',
        });
      }
    } catch {
      // Fallback presse-papier
      try {
        await navigator.clipboard.writeText(shareText);
        showToast('Détails du reçu copiés dans le presse-papier !', 'success');
      } catch {
        showToast('Impossible de partager le reçu.', 'error');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-white text-slate-900 rounded-[32px] w-full max-w-sm overflow-hidden flex flex-col shadow-2xl relative">
        
        {/* Arche supérieure sombre / marine */}
        <div className="relative bg-[#07243A] h-36 flex items-center justify-center overflow-hidden">
          {/* Courbe SVG basse */}
          <div className="absolute -bottom-1 left-0 right-0 h-10">
            <svg
              viewBox="0 0 500 150"
              preserveAspectRatio="none"
              className="w-full h-full text-white fill-current"
            >
              <path d="M0,50 C150,140 350,140 500,50 L500,150 L0,150 Z"></path>
            </svg>
          </div>
        </div>

        {/* Avatar / Personnage avec badge de validation */}
        <div className="relative -mt-20 flex justify-center z-10">
          <div className="relative w-36 h-36 rounded-full border-4 border-white shadow-lg bg-[#E6F4EA] flex items-center justify-center overflow-visible p-1">
            {/* Anneau vert intérieur */}
            <div className="w-full h-full rounded-full border-[3.5px] border-[#22C55E] overflow-hidden bg-amber-50 flex items-end justify-center relative">
              {/* Illustration SVG du personnage pouce levé */}
              <svg
                viewBox="0 0 160 160"
                className="w-full h-full object-cover"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Fond / corps */}
                <circle cx="80" cy="80" r="80" fill="#F8FAFC" />
                
                {/* Cou & Corps / T-shirt Jaune */}
                <path
                  d="M32 160 C32 120 50 105 80 105 C110 105 128 120 128 160 Z"
                  fill="#F59E0B"
                />
                <path
                  d="M62 90 L62 110 C62 118 98 118 98 110 L98 90 Z"
                  fill="#C68A4C"
                />
                
                {/* Col T-Shirt */}
                <path
                  d="M62 106 C70 115 90 115 98 106 C92 120 68 120 62 106 Z"
                  fill="#D97706"
                />

                {/* Tête */}
                <ellipse cx="80" cy="72" rx="26" ry="30" fill="#DDA15E" />
                
                {/* Barbe */}
                <path
                  d="M58 74 C58 98 68 104 80 104 C92 104 102 98 102 74 C96 82 88 84 80 84 C72 84 64 82 58 74 Z"
                  fill="#3E2723"
                />

                {/* Bouche souriante */}
                <path
                  d="M72 84 Q80 92 88 84"
                  stroke="#FFFFFF"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Cheveux stylés */}
                <path
                  d="M54 62 C54 44 65 34 80 34 C94 34 106 42 106 58 C106 66 102 70 102 70 C98 52 82 48 70 54 C60 59 56 64 54 62 Z"
                  fill="#2D1E18"
                />
                <ellipse cx="86" cy="38" rx="14" ry="10" fill="#3E2723" />

                {/* Yeux */}
                <circle cx="70" cy="66" r="3.5" fill="#1E293B" />
                <circle cx="90" cy="66" r="3.5" fill="#1E293B" />
                {/* Sourcils */}
                <path d="M66 58 Q71 56 75 58" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
                <path d="M85 58 Q89 56 94 58" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />

                {/* Main / Bras avec pouce levé 👍 */}
                <g transform="translate(85, 82)">
                  {/* Bras */}
                  <path d="M6 38 Q18 25 24 16" stroke="#DDA15E" strokeWidth="12" strokeLinecap="round" />
                  {/* Pouce levé */}
                  <rect x="18" y="4" width="9" height="18" rx="4.5" fill="#C68A4C" transform="rotate(-15 18 4)" />
                  {/* Poing fermé */}
                  <circle cx="22" cy="18" r="9" fill="#DDA15E" />
                </g>
              </svg>
            </div>

            {/* Badge de validation vert (Top-Right) */}
            <div className="absolute top-2 right-1 w-8 h-8 rounded-full bg-[#16A34A] border-2 border-white flex items-center justify-center shadow-md">
              <Check size={18} className="text-white stroke-[3.5]" />
            </div>
          </div>
        </div>

        {/* Contenu textuel */}
        <div className="px-6 pt-5 pb-6 text-center flex flex-col items-center">
          
          <h2 className="text-[#07243A] font-extrabold text-[22px] sm:text-[24px] tracking-tight mb-2">
            Argent envoyé avec succès
          </h2>

          <p className="text-slate-600 text-[14px] leading-relaxed max-w-[270px] mb-6 font-medium">
            Vous avez envoyé avec succès{' '}
            <span className="font-bold text-slate-900 block text-[17px] my-1">
              {formattedAmount} FCFA
            </span>
            à <span className="font-bold text-slate-900 uppercase">{recipientName}</span>
            {propertyName && (
              <span className="text-slate-500 block text-xs mt-0.5">
                (Logement : {propertyName})
              </span>
            )}
          </p>

          {/* Bouton Partager le reçu */}
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center gap-2 text-slate-700 hover:text-slate-900 text-sm font-bold py-2 px-4 rounded-full transition-transform active:scale-95 mb-6 group"
          >
            <span className="w-8 h-8 rounded-full bg-[#FBBF24] flex items-center justify-center text-slate-900 shadow-sm group-hover:scale-105 transition-transform">
              <Share2 size={16} className="stroke-[2.5]" />
            </span>
            <span className="tracking-wide">Partager le reçu</span>
          </button>

          {/* Bouton Voir la quittance si disponible */}
          {onViewReceipt && (
            <button
              type="button"
              onClick={onViewReceipt}
              className="text-xs text-[#0F2F4A] hover:underline flex items-center gap-1 mb-5 font-semibold"
            >
              <span>Consulter la quittance officielle</span>
              <ExternalLink size={13} />
            </button>
          )}

          {/* Bouton principal TERMINÉ */}
          <button
            type="button"
            onClick={() => {
              haptics.medium();
              onClose();
            }}
            className="w-full bg-[#07243A] hover:bg-[#0c3859] active:scale-[0.98] text-white font-extrabold text-[15px] tracking-wider py-4 rounded-2xl shadow-md transition-all font-nunito uppercase"
          >
            TERMINÉ
          </button>

        </div>

      </div>
    </div>
  );
};
