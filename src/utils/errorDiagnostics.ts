import { toast } from 'sonner';

export function diagnoseAndShowError(error: any, context?: string) {
  console.error(`🔴 [Erreur survenue dans : ${context || 'Plateforme'}]`, error);

  let title = "Oups ! Une erreur est survenue";
  let description = "Un problème inattendu s'est produit. Veuillez réessayer.";

  // Extraction du message brut
  const rawMessage = error?.message || error?.error || String(error);

  // --- 1. PROBLÈME DE CONNEXION INTERNET / RÉSEAU ---
  if (!navigator.onLine || rawMessage.includes("Failed to fetch") || error?.name === "TypeError" && rawMessage.includes("fetch")) {
    title = "🌐 Connexion Internet interrompue";
    description = "Vérifiez votre connexion Wi-Fi ou vos données mobiles et réessayez.";
  }

  // --- 2. ERREURS DE SERVEUR & SUPABASE (500 / Timeout) ---
  else if (error?.status >= 500 || error?.code === "500" || rawMessage.includes("Internal Server Error")) {
    title = "🖥️ Serveur indisponible";
    description = "Nos serveurs rencontrent un souci temporaire. Nous travaillons dessus, réessayez dans un instant.";
  }

  // --- 3. ERREURS D'AUTHENTIFICATION & SESSION (401 / 403) ---
  else if (error?.status === 401 || error?.code === "PGRST301" || rawMessage.includes("JWT expired")) {
    title = "🔒 Session expirée";
    description = "Votre session de connexion a expiré. Veuillez vous reconnecter à votre compte.";
  }

  // --- 4. ERREURS DE PAIEMENT & FEDAPAY ---
  else if (rawMessage.includes("300000") || rawMessage.includes("maximum")) {
    title = "💳 Plafond de paiement dépassé";
    description = "Le montant dépasse le plafond autorisé de 300 000 FCFA par versement.";
  } else if (rawMessage.includes("INSUFFICIENT_FUND") || rawMessage.includes("LOW_BALANCE")) {
    title = "📲 Solde Mobile Money insuffisant";
    description = "Votre compte Mobile Money n'a pas assez de solde pour valider cette transaction.";
  } else if (rawMessage.includes("canceled") || rawMessage.includes("declined")) {
    title = "❌ Paiement annulé";
    description = "La demande de paiement a été refusée ou annulée depuis le téléphone.";
  }

  // --- 5. ERREURS DE FORMULAIRE / VALIDATION DE DONNÉES ---
  else if (error?.status === 400 || error?.code === "23505") { // Violation d'unicité
    title = "⚠️ Données Invalides";
    description = error?.details || rawMessage || "Veuillez vérifier les informations saisies dans le formulaire.";
  }

  // --- 6. MESSAGE DÉTAILLÉ DE SECOURS ---
  else if (rawMessage && typeof rawMessage === 'string' && rawMessage.length < 150) {
    description = rawMessage;
  }

  // Affiche l'alerte visuelle claire avec Titre + Explication
  toast.error(title, {
    description: description,
    duration: 6000,
    dismissible: true,
  });
}
