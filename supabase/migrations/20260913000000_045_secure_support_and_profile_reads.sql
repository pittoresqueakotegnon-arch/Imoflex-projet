-- ============================================================================
-- Migration 045 : sécurité du support, des pièces jointes et des profils liés
-- ============================================================================
-- Le visiteur anonyme n'est pas une identité sécurisée : visitor_id était une
-- valeur manipulable depuis le navigateur et permettait de lire les échanges
-- d'un autre visiteur. Le support exige désormais une session authentifiée.

BEGIN;

-- Les anciennes URL publiques deviennent des chemins de bucket afin que le
-- client puisse obtenir une URL signée après l'activation du bucket privé.
UPDATE public.support_messages
SET screenshot_url = regexp_replace(
  screenshot_url,
  '^.*?/support_attachments/',
  ''
)
WHERE screenshot_url ~ '/support_attachments/';

UPDATE storage.buckets
SET public = false
WHERE id = 'support_attachments';

-- Les helpers utilisés dans les RLS doivent être fermés explicitement, avoir
-- un search_path sûr et rester utilisables par les policies authentifiées.
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_property_owner(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_active_tenant_of(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_tenant_of_owner(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_owner_of_tenant(UUID) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_property_owner(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_tenant_of(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_tenant_of_owner(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_of_tenant(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_property_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_tenant_of(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_of_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_of_tenant(UUID) TO authenticated;

-- Une relation terminée ne donne plus accès au profil de l'autre partie.
CREATE OR REPLACE FUNCTION public.is_tenant_of_owner(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leases l
    JOIN public.properties p ON p.id = l.property_id
    WHERE l.tenant_id = auth.uid()
      AND p.owner_id = p_owner_id
      AND l.status = 'actif'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leases l
    JOIN public.properties p ON p.id = l.property_id
    WHERE l.tenant_id = p_tenant_id
      AND p.owner_id = auth.uid()
      AND l.status = 'actif'
  );
$$;

-- Un locataire n'a besoin que du nom du propriétaire associé à son bail. La
-- policy qui exposait toute la ligne users (email, téléphone, FCM, etc.) est
-- remplacée par une RPC limitée.
DROP POLICY IF EXISTS "users_select_as_tenant" ON public.users;

CREATE OR REPLACE FUNCTION public.get_active_lease_owner_name(p_lease_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT u.full_name
  FROM public.leases l
  JOIN public.properties p ON p.id = l.property_id
  JOIN public.users u ON u.id = p.owner_id
  WHERE l.id = p_lease_id
    AND l.tenant_id = auth.uid()
    AND l.status = 'actif';
$$;

REVOKE ALL ON FUNCTION public.get_active_lease_owner_name(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_lease_owner_name(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- Conversations : aucune conversation anonyme nouvelle, aucun accès croisé.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can create conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can read own conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Admins can update conversations" ON public.support_conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.support_conversations;

CREATE POLICY "support_conversations_select_participant_or_admin"
ON public.support_conversations FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "support_conversations_insert_authenticated_owner"
ON public.support_conversations FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND visitor_id IS NULL
  AND status = 'ouverte'
);

CREATE POLICY "support_conversations_update_admin"
ON public.support_conversations FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.support_conversations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.support_conversations TO authenticated;
GRANT INSERT (user_id, status) ON TABLE public.support_conversations TO authenticated;
GRANT UPDATE (status) ON TABLE public.support_conversations TO authenticated;

-- --------------------------------------------------------------------------
-- Messages : le serveur impose l'émetteur, le destinataire et le type.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert messages" ON public.support_messages;
DROP POLICY IF EXISTS "Users can read messages" ON public.support_messages;
DROP POLICY IF EXISTS "Admins can update messages" ON public.support_messages;
DROP POLICY IF EXISTS "Users can update messages" ON public.support_messages;

CREATE POLICY "support_messages_select_participant_or_admin"
ON public.support_messages FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = support_messages.conversation_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "support_messages_insert_participant"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_type = 'user'
  AND sender_id = auth.uid()
  AND char_length(btrim(message)) BETWEEN 1 AND 2000
  AND EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = conversation_id
      AND c.user_id = auth.uid()
  )
  AND (
    screenshot_url IS NULL
    OR screenshot_url LIKE auth.uid()::TEXT || '/' || conversation_id::TEXT || '/%'
  )
);

CREATE POLICY "support_messages_insert_admin"
ON public.support_messages FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  AND sender_type = 'admin'
  AND sender_id = auth.uid()
  AND char_length(btrim(message)) BETWEEN 1 AND 2000
  AND (
    screenshot_url IS NULL
    OR screenshot_url LIKE 'admin/' || conversation_id::TEXT || '/%'
  )
);

CREATE POLICY "support_messages_mark_admin_message_read"
ON public.support_messages FOR UPDATE TO authenticated
USING (
  sender_type = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = support_messages.conversation_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  sender_type = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id = support_messages.conversation_id
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "support_messages_update_admin"
ON public.support_messages FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

REVOKE ALL ON TABLE public.support_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.support_messages TO authenticated;
GRANT INSERT (conversation_id, sender_type, sender_id, message, screenshot_url)
  ON TABLE public.support_messages TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.support_messages TO authenticated;

-- Le client ne contrôle plus la date du dernier message.
CREATE OR REPLACE FUNCTION public.touch_support_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.support_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_support_conversation_on_message ON public.support_messages;
CREATE TRIGGER touch_support_conversation_on_message
AFTER INSERT ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_support_conversation_on_message();

REVOKE ALL ON FUNCTION public.touch_support_conversation_on_message() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- Pièces jointes : bucket privé, dépôt image limité et lecture par URL signée.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public insert on support_attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public select on support_attachments" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_insert_participant" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_select_participant_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_delete_unreferenced_upload" ON storage.objects;

CREATE POLICY "support_attachments_insert_participant"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  AND COALESCE((metadata->>'size')::BIGINT, 0) BETWEEN 1 AND 5242880
  AND EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id::TEXT = (storage.foldername(name))[2]
      AND c.user_id = auth.uid()
  )
);

CREATE POLICY "support_attachments_insert_admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'support_attachments'
  AND (storage.foldername(name))[1] = 'admin'
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  AND COALESCE((metadata->>'size')::BIGINT, 0) BETWEEN 1 AND 5242880
  AND public.is_admin()
  AND EXISTS (
    SELECT 1 FROM public.support_conversations c
    WHERE c.id::TEXT = (storage.foldername(name))[2]
  )
);

CREATE POLICY "support_attachments_select_participant_or_admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support_attachments'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.support_messages m
      JOIN public.support_conversations c ON c.id = m.conversation_id
      WHERE m.screenshot_url = storage.objects.name
        AND c.user_id = auth.uid()
    )
  )
);

-- Un fichier ne peut être supprimé par son expéditeur que tant qu'aucun
-- message ne le référence. Cela permet de nettoyer un échec d'envoi sans
-- permettre l'effacement a posteriori d'une pièce jointe de conversation.
CREATE POLICY "support_attachments_delete_unreferenced_upload"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'support_attachments'
  AND NOT EXISTS (
    SELECT 1 FROM public.support_messages m
    WHERE m.screenshot_url = storage.objects.name
  )
  AND (
    ((storage.foldername(name))[1] = auth.uid()::TEXT)
    OR (public.is_admin() AND (storage.foldername(name))[1] = 'admin')
  )
);

REVOKE ALL ON TABLE storage.objects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE storage.objects TO authenticated;

COMMIT;
