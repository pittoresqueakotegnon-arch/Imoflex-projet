import { toast } from 'sonner';

export function diagnoseAndShowError(error: any, context?: string) {
  console.error(`🔴 [Erreur dans : ${context || 'Plateforme'}]`, error);

  let title = 'Oups ! Une erreur est survenue';
  let description = 'Un problème inattendu s\'est produit. Veuillez réessayer.';
  let type: 'error' | 'warning' | 'info' = 'error';

  const rawMessage = String(error?.message || error?.error || error?.reason || error || '').toUpperCase();
  const statusCode = error?.status || error?.statusCode || 0;

  // ─── 1. CONNEXION / RÉSEAU ───────────────────────────────────────────────────
  if (!navigator.onLine || rawMessage.includes('FAILED TO FETCH') || rawMessage.includes('NETWORKERROR') || rawMessage.includes('NETWORK REQUEST FAILED')) {
    title = '📡 Connexion Internet perdue';
    description = 'Impossible de joindre le serveur. Vérifiez votre connexion Wi-Fi ou vos données mobiles et réessayez.';
    type = 'warning';
  }

  // ─── 2. SESSION EXPIRÉE ──────────────────────────────────────────────────────
  else if (rawMessage.includes('JWT EXPIRED') || rawMessage.includes('NOT AUTHENTICATED') || rawMessage.includes('SESSION') || statusCode === 401) {
    title = '🔐 Session expirée';
    description = 'Pour votre sécurité, votre session a expiré. Veuillez vous reconnecter pour continuer.';
    type = 'warning';
  }

  // ─── 3. SERVEUR INDISPONIBLE (503 / maintenance opérateur) ──────────────────
  else if (statusCode === 503 || rawMessage.includes('SERVICE UNAVAILABLE') || rawMessage.includes('MAINTENANCE')) {
    title = '🛠️ Service temporairement indisponible';
    description = 'Le service de paiement est actuellement en maintenance. Veuillez réessayer dans quelques minutes ou choisir un autre mode de paiement.';
    type = 'warning';
  }

  // ─── 4. ERREUR INTERNE SERVEUR (500) ────────────────────────────────────────
  else if (statusCode >= 500 || rawMessage.includes('INTERNAL SERVER ERROR') || rawMessage.includes('500')) {
    title = '⚠️ Un problème est survenu';
    description = 'Une erreur inattendue s\'est produite. Nos équipes ont été notifiées. Veuillez réessayer ultérieurement.';
    type = 'error';
  }

  // ─── 5. SOLDE INSUFFISANT ────────────────────────────────────────────────────
  else if (rawMessage.includes('INSUFFICIENT_FUND') || rawMessage.includes('LOW_BALANCE') || rawMessage.includes('INSUFFISANT') || rawMessage.includes('INSUFFICIENT BALANCE')) {
    title = '⚠️ Solde insuffisant';
    description = 'Votre solde est insuffisant pour effectuer ce paiement. Veuillez recharger votre compte puis réessayer.';
    type = 'error';
  }

  // ─── 6. ANNULATION PAR L'UTILISATEUR (mauvais PIN ou refus) ─────────────────
  else if (rawMessage.includes('CANCELED') || rawMessage.includes('DECLINED') || rawMessage.includes('CANCELLED') || rawMessage.includes('WRONG_PIN') || rawMessage.includes('INVALID_PIN')) {
    title = '❌ Transaction annulée';
    description = 'La validation du paiement a été annulée ou le code PIN saisi est incorrect. Aucune somme n\'a été débitée.';
    type = 'error';
  }

  // ─── 7. TIMEOUT USSD ────────────────────────────────────────────────────────
  else if (rawMessage.includes('EXPIR') || rawMessage.includes('TIMEOUT') || rawMessage.includes('TIMED OUT') || rawMessage.includes('N\'AVEZ PAS VALIDÉ') || rawMessage.includes('DELAI')) {
    title = '⏳ Délai dépassé';
    description = 'Vous n\'avez pas validé la transaction à temps sur votre téléphone. Veuillez réinitier le paiement.';
    type = 'warning';
  }

  // ─── 8. PLAFOND OPÉRATEUR ───────────────────────────────────────────────────
  else if (rawMessage.includes('300000') || rawMessage.includes('MAXIMUM') || rawMessage.includes('LIMIT') || rawMessage.includes('PLAFOND')) {
    title = '🚫 Plafond de paiement atteint';
    description = 'Ce paiement dépasse la limite autorisée. Veuillez effectuer votre versement en plusieurs fois (max 300 000 FCFA par transaction).';
    type = 'error';
  }

  // ─── 9. RECONNEXION EN COURS DE TRANSACTION ──────────────────────────────────
  else if (rawMessage.includes('INTERRUPTED') || rawMessage.includes('CONNEXION A ÉTÉ INTERROMPUE')) {
    title = '🔍 Vérification du statut du paiement...';
    description = 'La connexion a été interrompue. Nous vérifions auprès de votre opérateur si la transaction a été validée. Ne réitérez pas le paiement tout de suite.';
    type = 'info';
  }

  // ─── 10. IDENTIFIANTS INCORRECTS (Auth) ─────────────────────────────────────
  else if (rawMessage.includes('INVALID LOGIN') || rawMessage.includes('INVALID CREDENTIALS') || rawMessage.includes('WRONG PASSWORD') || rawMessage.includes('EMAIL NOT CONFIRMED')) {
    title = '🔑 Identifiants incorrects';
    description = 'Votre email ou mot de passe est incorrect. Vérifiez vos identifiants et réessayez.';
    type = 'error';
  }

  // ─── 11. DONNÉES INVALIDES / FORMULAIRE (400 / unicité) ─────────────────────
  else if (statusCode === 400 || error?.code === '23505') {
    title = '⚠️ Données invalides';
    description = error?.details || 'Veuillez vérifier les informations saisies dans le formulaire.';
    type = 'warning';
  }

  // ─── 12. FORMAT DE FICHIER NON CONFORME ─────────────────────────────────────
  else if (rawMessage.includes('FILE') || rawMessage.includes('FORMAT') || rawMessage.includes('5 MO') || rawMessage.includes('SIZE')) {
    title = '📄 Format de document non supporté';
    description = 'Veuillez sélectionner une image (JPG, PNG) ou un PDF d\'une taille maximale de 5 Mo.';
    type = 'warning';
  }

  // ─── 13. MESSAGE BRUT LISIBLE (< 150 caractères) ────────────────────────────
  else if (rawMessage && rawMessage.length < 150) {
    description = error?.message || error?.error || rawMessage;
  }

  // Afficher le Toast avec le bon style selon la sévérité
  if (type === 'warning') {
    toast.warning(title, { description, duration: 6000, dismissible: true });
  } else if (type === 'info') {
    toast.info(title, { description, duration: 8000, dismissible: true });
  } else {
    toast.error(title, { description, duration: 6000, dismissible: true });
  }

  return `${title} — ${description}`;
}

/** Helper pour les erreurs de timeout USSD spécifiquement */
export function showUssdTimeoutError() {
  diagnoseAndShowError(
    { message: 'Vous n\'avez pas validé la transaction à temps. TIMEOUT.' },
    'Timeout USSD'
  );
}

/** Helper pour les erreurs de statut annulé/décliné avec raison */
export function showPaymentStatusError(status: string, failureReason?: string) {
  const reasonMap: Record<string, string> = {
    'INSUFFICIENT_FUND': 'Solde Mobile Money insuffisant.',
    'INSUFFICIENT_FUND_ERROR': 'Solde Mobile Money insuffisant.',
    'WRONG_PIN': 'Code PIN incorrect saisi.',
    'CANCELLED': 'Transaction annulée depuis le téléphone.',
    'TIMEOUT': 'Délai de validation dépassé.',
    'DECLINED': 'Transaction refusée par l\'opérateur.',
    'OPERATOR_TIMEOUT': 'L\'opérateur n\'a pas répondu dans le délai imparti.',
    'OVER_PARTIAL_LIMIT': 'Plafond de paiement progressif dépassé.',
    'INSUFFICIENT_FUNDS': 'Solde Mobile Money insuffisant.',
  };

  const reason = failureReason
    ? (reasonMap[failureReason.toUpperCase()] || failureReason)
    : (status === 'echoue' ? 'Transaction échouée.' : 'Transaction annulée.');

  diagnoseAndShowError(
    { message: reason },
    'Paiement Mobile Money'
  );
}

/** Helper pour avertir l'utilisateur d'une mise à jour du bail pendant le paiement */
export function showLeaseUpdatedWarning(newAmount: number) {
  toast.warning('⚠️ Mise à jour des informations', {
    description: `Les détails de votre loyer ont été actualisés. Veuillez vérifier le nouveau solde restant (${new Intl.NumberFormat('fr-FR').format(newAmount)} FCFA).`,
    duration: 8000,
    dismissible: true,
  });
}

