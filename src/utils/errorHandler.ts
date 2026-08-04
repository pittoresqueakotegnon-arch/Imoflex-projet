import { toast } from 'sonner';

export interface AppError {
  message: string;
  code?: string;
  details?: any;
}

export function handleAppError(error: any, fallbackMessage: string = "Une erreur est survenue") {
  console.error("🔴 GLOBAL ERROR CAPTURED:", error);

  let userFriendlyMessage = fallbackMessage;
  const rawMessage = error?.message || error?.error || String(error);

  // --- 1. ERREURS FEDAPAY / MOBIL MONEY ---
  if (rawMessage.includes("300000") || rawMessage.includes("maximum")) {
    userFriendlyMessage = "Le montant dépasse le plafond autorisé de 300 000 FCFA par transaction.";
  } else if (rawMessage.includes("INSUFFICIENT_FUND") || rawMessage.includes("LOW_BALANCE")) {
    userFriendlyMessage = "Solde Mobile Money insuffisant sur votre compte. Veuillez recharger votre téléphone.";
  } else if (rawMessage.includes("canceled") || rawMessage.includes("declined")) {
    userFriendlyMessage = "La transaction a été annulée ou refusée sur votre téléphone.";
  } 

  // --- 2. ERREURS SUPABASE / AUTH ---
  else if (rawMessage.includes("Invalid login credentials") || rawMessage.includes("identifiants")) {
    userFriendlyMessage = "Identifiants incorrects. Veuillez vérifier votre numéro/email et mot de passe.";
  } else if (rawMessage.includes("JWT expired") || rawMessage.includes("not authenticated") || rawMessage.includes("session")) {
    userFriendlyMessage = "Votre session a expiré. Veuillez vous reconnecter.";
  } else if (rawMessage.includes("FetchError") || rawMessage.includes("Failed to fetch") || rawMessage.includes("NetworkError")) {
    userFriendlyMessage = "Problème de connexion Internet. Veuillez vérifier votre réseau.";
  } 

  // --- 3. MESSAGE PAR DÉFAUT SI NON SPÉCIFIÉ ---
  else if (typeof rawMessage === 'string' && rawMessage.length < 100) {
    userFriendlyMessage = rawMessage;
  }

  // Affiche l'alerte visuelle immédiate à l'utilisateur
  toast.error(userFriendlyMessage, {
    duration: 5000,
    dismissible: true,
  });

  return userFriendlyMessage;
}
