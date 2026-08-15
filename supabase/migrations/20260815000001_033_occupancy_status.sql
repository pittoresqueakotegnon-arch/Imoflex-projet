-- ── Mise à jour de la politique contact_requests pour le statut d'occupation ──

-- La politique 'contact_insert_own' existante vérifiait uniquement l'ID du requester.
-- Nous y ajoutons une vérification sur le statut de disponibilité de l'annonce.
-- On ne peut insérer une demande de contact que si l'annonce n'est pas "occupe".

DROP POLICY IF EXISTS "contact_insert_own" ON contact_requests;
CREATE POLICY "contact_insert_own" ON contact_requests FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = requester_id AND
  EXISTS (
    SELECT 1 FROM listings l
    WHERE l.id = contact_requests.listing_id
    AND l.availability_status = 'disponible'
  )
);
