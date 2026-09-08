import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Heart, MessageCircle, FileText, CreditCard, Building2, LogIn, UserPlus } from 'lucide-react';
import type { AuthGateReason } from '../hooks/useAuthGate';

// ─────────────────────────────────────────────────────────────────────────────
// AuthGateModal — Modal contextuelle d'authentification
//
// Affiche un message dynamique selon l'action que le visiteur a tentée,
// avec deux CTAs principaux (Se connecter / Créer un compte).
//
// Futures extensions :
//   - Ajouter reason 'messagerie', 'notifications', 'contrat', 'wallet'
//   - Supporter un "after-login callback" pour exécuter l'action post-connexion
// ─────────────────────────────────────────────────────────────────────────────

interface AuthGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: AuthGateReason;
  listingTitle?: string;
}

interface ReasonConfig {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const REASON_CONFIG: Record<AuthGateReason, ReasonConfig> = {
  favorites: {
    icon: <Heart size={22} className="text-[var(--imx-accent-light)]" />,
    title: 'Enregistrez ce logement',
    description: 'Connectez-vous pour ajouter ce bien à vos favoris et le retrouver facilement plus tard.',
  },
  contact: {
    icon: <MessageCircle size={22} className="text-[var(--imx-accent-light)]" />,
    title: 'Contactez le propriétaire',
    description: 'Connectez-vous pour envoyer votre demande directement au propriétaire.',
  },
  demande: {
    icon: <FileText size={22} className="text-[var(--imx-accent-light)]" />,
    title: 'Envoyez votre demande',
    description: 'Connectez-vous pour soumettre votre demande de location et suivre son avancement.',
  },
  paiement: {
    icon: <CreditCard size={22} className="text-[var(--imx-accent-light)]" />,
    title: 'Paiement sécurisé',
    description: 'Connectez-vous pour effectuer un paiement sécurisé via Mobile Money.',
  },
  publication: {
    icon: <Building2 size={22} className="text-[var(--imx-accent-light)]" />,
    title: 'Publiez votre annonce',
    description: 'Connectez-vous pour déposer votre bien immobilier sur ImoFlex.',
  },
  default: {
    icon: <LogIn size={22} className="text-[var(--imx-accent-light)]" />,
    title: 'Connectez-vous',
    description: 'Cette fonctionnalité est réservée aux membres ImoFlex. Rejoignez-nous gratuitement.',
  },
};

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  isOpen,
  onClose,
  reason = 'default',
}) => {
  const navigate = useNavigate();
  const backdropRef = useRef<HTMLDivElement>(null);

  const config = REASON_CONFIG[reason];

  // Fermeture par touche Escape et Bouton Retour Android
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleAndroidBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('imx:android-back', handleAndroidBack);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('imx:android-back', handleAndroidBack);
    };
  }, [isOpen, onClose]);

  // Empêcher le scroll du body quand modal ouverte
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = () => {
    onClose();
    navigate('/login');
  };

  const handleRegister = () => {
    onClose();
    navigate('/register');
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 relative"
        style={{
          background: 'linear-gradient(160deg, #1E1545 0%, #120D2A 100%)',
          border: '1px solid rgba(123, 63, 228, 0.2)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(123,63,228,0.1)',
          animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ background: 'var(--imx-border)' }}
        >
          <X size={16} style={{ color: 'var(--imx-text-secondary)' }} />
        </button>

        {/* Logo ImoFlex mini */}
        <div className="flex justify-center mb-5">
          <div
            className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ boxShadow: '0 0 24px rgba(123,63,228,0.3)' }}
          >
            <img
              src="/assets/logo-icon-transparent-recadre.png"
              alt="ImoFlex"
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Icône contextuelle */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4 mx-auto"
          style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168,85,247,0.2)' }}
        >
          {config.icon}
        </div>

        {/* Texte */}
        <h2
          className="text-center text-lg mb-2"
          style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}
        >
          {config.title}
        </h2>
        <p
          className="text-center text-sm mb-6 leading-relaxed"
          style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}
        >
          {config.description}
        </p>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleLogin}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <LogIn size={17} />
            Se connecter
          </button>

          <button
            onClick={handleRegister}
            className="btn-ghost-violet w-full flex items-center justify-center gap-2"
          >
            <UserPlus size={17} />
            Créer un compte
          </button>

          <button
            onClick={onClose}
            className="text-center text-sm py-2 transition-colors"
            style={{ fontFamily: 'Space Grotesk', color: '#6B5F8F' }}
          >
            Continuer sans compte
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(40px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default AuthGateModal;
