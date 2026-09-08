import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

// ─────────────────────────────────────────────────────────────────────────────
// useAuthGate — Hook utilitaire pour déclencher l'AuthGateModal
//
// Principe : "Zero friction" — si l'utilisateur est connecté, l'action
// s'exécute immédiatement. Sinon, la modal s'ouvre avec le bon contexte.
//
// Usage :
//   const { requireAuth, isModalOpen, closeModal, modalReason } = useAuthGate();
//   const handleFavorite = () => requireAuth(() => toggleFav(id), 'favorites');
//
// Futures extensions prévues :
//   - 'messagerie' — pour la messagerie temps réel
//   - 'notifications' — pour s'abonner aux alertes
//   - 'contrat' — pour signer un contrat numérique
//   - 'wallet' — pour accéder au portefeuille ImoFlex
// ─────────────────────────────────────────────────────────────────────────────

export type AuthGateReason =
  | 'favorites'
  | 'contact'
  | 'demande'
  | 'paiement'
  | 'publication'
  | 'default';

interface UseAuthGateReturn {
  requireAuth: (callback: () => void, reason?: AuthGateReason) => void;
  isModalOpen: boolean;
  closeModal: () => void;
  modalReason: AuthGateReason;
  pendingCallback: (() => void) | null;
}

export function useAuthGate(): UseAuthGateReturn {
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalReason, setModalReason] = useState<AuthGateReason>('default');
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const requireAuth = useCallback(
    (callback: () => void, reason: AuthGateReason = 'default') => {
      if (user) {
        // Utilisateur connecté → exécuter immédiatement
        callback();
      } else {
        // Visiteur → mémoriser le callback et ouvrir la modal
        setPendingCallback(() => callback);
        setModalReason(reason);
        setIsModalOpen(true);
      }
    },
    [user]
  );

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setPendingCallback(null);
  }, []);

  return {
    requireAuth,
    isModalOpen,
    closeModal,
    modalReason,
    pendingCallback,
  };
}
