BEGIN;
DROP POLICY IF EXISTS "owner_verification_documents_insert_draft_owner" ON storage.objects;
CREATE POLICY "owner_verification_documents_insert_draft_owner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'owner-verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND array_length(storage.foldername(name), 1) = 2
  AND lower(regexp_replace(name, '^.*/', '')) ~ '^identity_(front|back)\.(jpg|jpeg|png|webp|pdf)$'
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
  AND EXISTS (
    SELECT 1
    FROM public.owner_verification_requests r
    WHERE r.id::TEXT = (storage.foldername(name))[2]
      AND r.owner_id = auth.uid()
      AND r.status = 'draft'
  )
);
COMMIT;
