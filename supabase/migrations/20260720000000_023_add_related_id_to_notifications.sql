-- Ajouter la colonne related_id pour lier une notification à son événement (paiement, retrait, demande)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id UUID;

-- Créer un index pour optimiser les requêtes si nécessaire (bien que l'accès principal soit par user_id)
CREATE INDEX IF NOT EXISTS idx_notifications_related_id ON notifications(related_id);
