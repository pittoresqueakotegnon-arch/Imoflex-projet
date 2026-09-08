-- ============================================================
-- Migration 028 : Correction des politiques RLS Storage
--                pour listing-photos
--
-- Problème : la convention de nommage utilisée dans Publier.tsx
--   est {listing_id}/photo_{photoId}_hd.webp
--   → foldername(name)[1] = listing_id  (UUID de l'annonce)
--
-- La politique précédente vérifiait [2] = auth.uid(), ce qui
-- ne correspond pas au schéma réel → tous les uploads étaient
-- bloqués (403 Forbidden).
--
-- Correction : on autorise l'upload si le propriétaire de
-- l'annonce (listing.owner_id) = auth.uid(), en remontant
-- via la table listings.
-- ============================================================

-- 1. Supprimer les anciennes politiques Storage (chemin incorrect)
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own photos"     ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos"     ON storage.objects;
DROP POLICY IF EXISTS "Public Access to listing photos"       ON storage.objects;

-- 2. Accès public en lecture (inchangé)
CREATE POLICY "listing_photos_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'listing-photos');

-- 3. Upload : tout utilisateur authentifié peut uploader dans son propre dossier
--    Le premier segment du chemin = listing_id.
--    On vérifie que l'utilisateur est propriétaire de cette annonce
--    OU que l'annonce n'existe pas encore (upload avant publication).
CREATE POLICY "listing_photos_insert_owner" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (
      -- Soit l'annonce appartient à l'utilisateur courant
      EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id::text = (storage.foldername(name))[1]
          AND l.owner_id = auth.uid()
      )
      -- Soit le dossier n'est pas encore une annonce publiée
      -- (upload de photos avant insertion en DB, pattern UUID côté client)
      OR NOT EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id::text = (storage.foldername(name))[1]
      )
    )
  );

-- 4. Mise à jour : même règle que l'insert
CREATE POLICY "listing_photos_update_owner" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id::text = (storage.foldername(name))[1]
        AND l.owner_id = auth.uid()
    )
  );

-- 5. Suppression : même règle, plus admins
CREATE POLICY "listing_photos_delete_owner" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.listings l
        WHERE l.id::text = (storage.foldername(name))[1]
          AND l.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
    )
  );
