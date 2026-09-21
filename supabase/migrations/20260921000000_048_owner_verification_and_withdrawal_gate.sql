-- ============================================================================
-- Migration 048 : vérification des propriétaires et verrouillage des retraits
--
-- Principes :
-- - Les documents d'identité restent dans un bucket Storage privé.
-- - Le propriétaire ne peut créer/soumettre que son propre dossier.
-- - Seul un administrateur authentifié peut approuver ou refuser un dossier.
-- - La vérification est contrôlée dans la RPC qui débite le wallet ; une UI
--   contournée ne peut donc jamais déclencher un retrait.
-- - Le modèle prévoit un tarif de vérification, désactivé par défaut, sans
--   prétendre proposer un encaissement tant qu'il n'est pas configuré.
-- ============================================================================

BEGIN;

-- Statut public, volontairement distinct de l'historique des demandes. Il est
-- visible sur le profil du propriétaire et sert de source de vérité des retraits.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS owner_verification_status TEXT NOT NULL DEFAULT 'non_verifie',
  ADD COLUMN IF NOT EXISTS owner_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_verification_updated_at TIMESTAMPTZ;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_owner_verification_status_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_owner_verification_status_check
  CHECK (owner_verification_status IN ('non_verifie', 'en_attente', 'verifie', 'refuse'));

-- Une ligne correspond à une soumission. Les dossiers refusés sont conservés
-- pour l'audit ; un propriétaire peut ensuite en préparer un nouveau.
CREATE TABLE IF NOT EXISTS public.owner_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  legal_name TEXT NOT NULL,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('cni', 'passeport', 'permis_conduire')),
  document_number_last4 TEXT NOT NULL CHECK (document_number_last4 ~ '^[A-Z0-9]{4}$'),
  identity_front_path TEXT,
  identity_back_path TEXT,
  fee_required BOOLEAN NOT NULL DEFAULT false,
  fee_amount INTEGER NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  fee_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (fee_status IN ('not_required', 'pending', 'paid', 'waived', 'refunded')),
  fee_payment_reference TEXT,
  fee_paid_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT owner_verification_document_paths_complete CHECK (
    (status = 'draft' AND identity_front_path IS NULL AND identity_back_path IS NULL)
    OR (status IN ('pending', 'approved', 'rejected') AND identity_front_path IS NOT NULL AND identity_back_path IS NOT NULL)
  ),
  CONSTRAINT owner_verification_fee_consistency CHECK (
    (fee_required = false AND fee_status = 'not_required' AND fee_amount = 0)
    OR (fee_required = true AND fee_amount > 0 AND fee_status IN ('pending', 'paid', 'waived', 'refunded'))
  )
);

CREATE INDEX IF NOT EXISTS idx_owner_verification_requests_owner_created
  ON public.owner_verification_requests (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_verification_requests_status_submitted
  ON public.owner_verification_requests (status, submitted_at ASC)
  WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS owner_verification_one_open_request_per_owner
  ON public.owner_verification_requests (owner_id)
  WHERE status IN ('draft', 'pending');
CREATE UNIQUE INDEX IF NOT EXISTS owner_verification_fee_payment_reference_unique
  ON public.owner_verification_requests (fee_payment_reference)
  WHERE fee_payment_reference IS NOT NULL;

ALTER TABLE public.owner_verification_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.owner_verification_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.owner_verification_requests TO authenticated;

DROP POLICY IF EXISTS "owner_verification_requests_select_owner_or_admin" ON public.owner_verification_requests;
CREATE POLICY "owner_verification_requests_select_owner_or_admin"
ON public.owner_verification_requests FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.is_admin());

-- Prépare l'activation ultérieure d'une vérification payante. Ces valeurs sont
-- consommées côté SQL, pas codées dans l'interface. Elles restent désactivées
-- tant qu'un flux d'encaissement dédié n'est pas raccordé.
INSERT INTO public.app_config (key, value) VALUES
  ('owner_verification_fee_enabled', 'false'),
  ('owner_verification_fee_amount', '0')
ON CONFLICT (key) DO NOTHING;

-- Bucket privé : aucun getPublicUrl, aucun accès anonyme aux documents.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'owner-verification-documents',
  'owner-verification-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "owner_verification_documents_insert_draft_owner" ON storage.objects;
DROP POLICY IF EXISTS "owner_verification_documents_select_owner_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "owner_verification_documents_delete_draft_owner" ON storage.objects;

-- Un upload ne peut viser que le dossier brouillon de son propriétaire. Les
-- noms sont validés de nouveau lors de la soumission par la fonction SQL.
CREATE POLICY "owner_verification_documents_insert_draft_owner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'owner-verification-documents'
  AND (storage.foldername(name))[1] = auth.uid()::TEXT
  AND array_length(storage.foldername(name), 1) = 2
  AND lower(regexp_replace(name, '^.*/', '')) ~ '^identity_(front|back)\.(jpg|jpeg|png|webp|pdf)$'
  AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
  AND COALESCE((metadata->>'size')::BIGINT, 0) BETWEEN 1 AND 10485760
  AND EXISTS (
    SELECT 1
    FROM public.owner_verification_requests r
    WHERE r.id::TEXT = (storage.foldername(name))[2]
      AND r.owner_id = auth.uid()
      AND r.status = 'draft'
  )
);

CREATE POLICY "owner_verification_documents_select_owner_or_admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'owner-verification-documents'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.owner_verification_requests r
      WHERE r.id::TEXT = (storage.foldername(storage.objects.name))[2]
        AND r.owner_id = auth.uid()
    )
  )
);

CREATE POLICY "owner_verification_documents_delete_draft_owner"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'owner-verification-documents'
  AND EXISTS (
    SELECT 1
    FROM public.owner_verification_requests r
    WHERE r.id::TEXT = (storage.foldername(storage.objects.name))[2]
      AND r.owner_id = auth.uid()
      AND r.status = 'draft'
  )
);

REVOKE ALL ON TABLE storage.objects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE storage.objects TO authenticated;

-- Retourne uniquement les métadonnées utiles au propriétaire connecté ; les
-- chemins des documents ne sont jamais renvoyés par cette RPC.
CREATE OR REPLACE FUNCTION public.get_my_owner_verification()
RETURNS TABLE (
  verification_status TEXT,
  request_id UUID,
  request_status TEXT,
  legal_name TEXT,
  document_type TEXT,
  document_number_last4 TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  fee_required BOOLEAN,
  fee_amount INTEGER,
  fee_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_user_id AND u.role = 'proprietaire'
  ) THEN
    RAISE EXCEPTION 'Cette vérification est réservée aux propriétaires';
  END IF;

  RETURN QUERY
  SELECT
    u.owner_verification_status,
    r.id,
    r.status,
    r.legal_name,
    r.document_type,
    r.document_number_last4,
    r.submitted_at,
    r.reviewed_at,
    r.rejection_reason,
    r.fee_required,
    r.fee_amount,
    r.fee_status
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.owner_verification_requests
    WHERE owner_id = v_user_id
    ORDER BY created_at DESC
    LIMIT 1
  ) r ON true
  WHERE u.id = v_user_id;
END;
$$;

-- Crée ou réutilise un unique brouillon. Le numéro complet ne persiste jamais :
-- seules ses quatre dernières positions sont conservées pour le rapprochement.
CREATE OR REPLACE FUNCTION public.create_owner_verification_draft(
  p_legal_name TEXT,
  p_document_type TEXT,
  p_document_number TEXT
)
RETURNS TABLE (request_id UUID, fee_required BOOLEAN, fee_amount INTEGER, fee_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_name TEXT := regexp_replace(btrim(COALESCE(p_legal_name, '')), '\s+', ' ', 'g');
  v_type TEXT := lower(btrim(COALESCE(p_document_type, '')));
  v_number TEXT := regexp_replace(upper(COALESCE(p_document_number, '')), '[^A-Z0-9]', '', 'g');
  v_request public.owner_verification_requests%ROWTYPE;
  v_fee_required BOOLEAN;
  v_fee_amount INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_user_id AND u.role = 'proprietaire' AND u.is_active = true
  ) THEN
    RAISE EXCEPTION 'Seul un propriétaire actif peut soumettre une vérification';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_user_id AND u.owner_verification_status IN ('en_attente', 'verifie')
  ) THEN
    RAISE EXCEPTION 'Une vérification est déjà en cours ou a déjà été validée';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION 'Le nom légal doit contenir entre 2 et 150 caractères';
  END IF;
  IF v_type NOT IN ('cni', 'passeport', 'permis_conduire') THEN
    RAISE EXCEPTION 'Type de pièce d''identité invalide';
  END IF;
  IF char_length(v_number) NOT BETWEEN 4 AND 40 THEN
    RAISE EXCEPTION 'Numéro de pièce invalide';
  END IF;

  PERFORM 1
  FROM public.users
  WHERE id = v_user_id
  FOR UPDATE;

  SELECT
    COALESCE((SELECT lower(value) = 'true' FROM public.app_config WHERE key = 'owner_verification_fee_enabled'), false),
    COALESCE((
      SELECT CASE WHEN value ~ '^[0-9]{1,9}$' THEN value::INTEGER ELSE 0 END
      FROM public.app_config
      WHERE key = 'owner_verification_fee_amount'
    ), 0)
  INTO v_fee_required, v_fee_amount;
  v_fee_required := v_fee_required AND v_fee_amount > 0;

  SELECT * INTO v_request
  FROM public.owner_verification_requests
  WHERE owner_id = v_user_id AND status = 'draft'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.owner_verification_requests
    SET legal_name = v_name,
        document_type = v_type,
        document_number_last4 = right(v_number, 4),
        fee_required = v_fee_required,
        fee_amount = CASE WHEN v_fee_required THEN v_fee_amount ELSE 0 END,
        fee_status = CASE
          WHEN v_fee_required
            AND v_request.fee_required
            AND v_request.fee_amount = v_fee_amount
            AND v_request.fee_status IN ('paid', 'waived')
            THEN v_request.fee_status
          WHEN v_fee_required THEN 'pending'
          ELSE 'not_required'
        END,
        fee_payment_reference = CASE
          WHEN v_fee_required
            AND v_request.fee_required
            AND v_request.fee_amount = v_fee_amount
            AND v_request.fee_status IN ('paid', 'waived')
            THEN v_request.fee_payment_reference
          ELSE NULL
        END,
        fee_paid_at = CASE
          WHEN v_fee_required
            AND v_request.fee_required
            AND v_request.fee_amount = v_fee_amount
            AND v_request.fee_status IN ('paid', 'waived')
            THEN v_request.fee_paid_at
          ELSE NULL
        END,
        updated_at = now()
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  ELSE
    INSERT INTO public.owner_verification_requests (
      owner_id, legal_name, document_type, document_number_last4,
      fee_required, fee_amount, fee_status
    ) VALUES (
      v_user_id, v_name, v_type, right(v_number, 4),
      v_fee_required, CASE WHEN v_fee_required THEN v_fee_amount ELSE 0 END,
      CASE WHEN v_fee_required THEN 'pending' ELSE 'not_required' END
    )
    RETURNING * INTO v_request;
  END IF;

  RETURN QUERY SELECT v_request.id, v_request.fee_required, v_request.fee_amount, v_request.fee_status;
END;
$$;

-- Soumet un brouillon après avoir vérifié les deux objets privés dans Storage.
CREATE OR REPLACE FUNCTION public.submit_owner_verification(
  p_request_id UUID,
  p_identity_front_path TEXT,
  p_identity_back_path TEXT
)
RETURNS TABLE (request_id UUID, verification_status TEXT, submitted_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request public.owner_verification_requests%ROWTYPE;
  v_front_metadata JSONB;
  v_back_metadata JSONB;
  v_expected_prefix TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT * INTO v_request
  FROM public.owner_verification_requests
  WHERE id = p_request_id AND owner_id = v_user_id AND status = 'draft'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brouillon de vérification introuvable';
  END IF;
  IF v_request.fee_required AND v_request.fee_status NOT IN ('paid', 'waived') THEN
    RAISE EXCEPTION 'Le paiement de la vérification doit être réglé avant la soumission';
  END IF;

  v_expected_prefix := v_user_id::TEXT || '/' || p_request_id::TEXT || '/';
  IF lower(COALESCE(p_identity_front_path, '')) !~ ('^' || v_expected_prefix || 'identity_front\.(jpg|jpeg|png|webp|pdf)$')
     OR lower(COALESCE(p_identity_back_path, '')) !~ ('^' || v_expected_prefix || 'identity_back\.(jpg|jpeg|png|webp|pdf)$')
  THEN
    RAISE EXCEPTION 'Chemin de document invalide';
  END IF;

  SELECT metadata INTO v_front_metadata
  FROM storage.objects
  WHERE bucket_id = 'owner-verification-documents' AND name = p_identity_front_path;
  SELECT metadata INTO v_back_metadata
  FROM storage.objects
  WHERE bucket_id = 'owner-verification-documents' AND name = p_identity_back_path;

  IF v_front_metadata IS NULL OR v_back_metadata IS NULL THEN
    RAISE EXCEPTION 'Les deux documents d''identité sont requis';
  END IF;
  IF COALESCE((v_front_metadata->>'size')::BIGINT, 0) NOT BETWEEN 1 AND 10485760
     OR COALESCE((v_back_metadata->>'size')::BIGINT, 0) NOT BETWEEN 1 AND 10485760
  THEN
    RAISE EXCEPTION 'Chaque document doit peser au maximum 10 Mo';
  END IF;
  IF lower(COALESCE(v_front_metadata->>'mimetype', '')) NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR lower(COALESCE(v_back_metadata->>'mimetype', '')) NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  THEN
    RAISE EXCEPTION 'Format de document non autorisé';
  END IF;

  UPDATE public.owner_verification_requests
  SET status = 'pending',
      identity_front_path = p_identity_front_path,
      identity_back_path = p_identity_back_path,
      submitted_at = now(),
      updated_at = now(),
      rejection_reason = NULL,
      admin_note = NULL,
      reviewed_at = NULL,
      reviewed_by = NULL
  WHERE id = v_request.id;

  UPDATE public.users
  SET owner_verification_status = 'en_attente',
      owner_verified_at = NULL,
      owner_verification_updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_user_id, 'owner_verification_submitted', 'owner_verification_requests', v_request.id,
          jsonb_build_object('document_type', v_request.document_type));

  RETURN QUERY SELECT v_request.id, 'en_attente'::TEXT, now();
END;
$$;

-- Point de branchement du futur webhook de paiement de la vérification. Cette
-- fonction est inaccessible au navigateur ; elle ne peut être appelée que par
-- service_role une fois un paiement effectivement confirmé.
CREATE OR REPLACE FUNCTION public.record_owner_verification_fee_payment(
  p_request_id UUID,
  p_payment_reference TEXT,
  p_amount INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.owner_verification_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.owner_verification_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_request.fee_required OR v_request.status <> 'draft' THEN
    RAISE EXCEPTION 'Demande de vérification payante introuvable';
  END IF;
  IF v_request.fee_status = 'paid' THEN
    IF v_request.fee_payment_reference = btrim(p_payment_reference) AND p_amount = v_request.fee_amount THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'Référence de paiement incohérente';
  END IF;
  IF p_amount <> v_request.fee_amount OR char_length(btrim(COALESCE(p_payment_reference, ''))) < 4 THEN
    RAISE EXCEPTION 'Paiement de vérification invalide';
  END IF;

  UPDATE public.owner_verification_requests
  SET fee_status = 'paid',
      fee_payment_reference = btrim(p_payment_reference),
      fee_paid_at = now(),
      updated_at = now()
  WHERE id = v_request.id;
  RETURN true;
END;
$$;

-- Décision administrative atomique. Le client admin ne peut pas modifier une
-- ligne directement ni marquer un propriétaire vérifié par une mise à jour.
CREATE OR REPLACE FUNCTION public.admin_review_owner_verification(
  p_request_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT NULL,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS TABLE (verification_status TEXT, reviewed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_request public.owner_verification_requests%ROWTYPE;
  v_decision TEXT := lower(btrim(COALESCE(p_decision, '')));
  v_reason TEXT := btrim(COALESCE(p_rejection_reason, ''));
  v_note TEXT := NULLIF(btrim(COALESCE(p_admin_note, '')), '');
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_admin_id IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis';
  END IF;
  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Décision de vérification invalide';
  END IF;
  IF v_decision = 'rejected' AND char_length(v_reason) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Un motif de refus entre 5 et 1000 caractères est requis';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'La note administrateur est trop longue';
  END IF;

  SELECT * INTO v_request
  FROM public.owner_verification_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande en attente introuvable ou déjà traitée';
  END IF;
  IF v_request.fee_required AND v_request.fee_status NOT IN ('paid', 'waived') THEN
    RAISE EXCEPTION 'Le paiement de vérification n''est pas confirmé';
  END IF;

  UPDATE public.owner_verification_requests
  SET status = v_decision,
      reviewed_at = v_now,
      reviewed_by = v_admin_id,
      rejection_reason = CASE WHEN v_decision = 'rejected' THEN v_reason ELSE NULL END,
      admin_note = v_note,
      updated_at = v_now
  WHERE id = v_request.id;

  UPDATE public.users
  SET owner_verification_status = CASE WHEN v_decision = 'approved' THEN 'verifie' ELSE 'refuse' END,
      owner_verified_at = CASE WHEN v_decision = 'approved' THEN v_now ELSE NULL END,
      owner_verification_updated_at = v_now
  WHERE id = v_request.owner_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_id)
  VALUES (
    v_request.owner_id,
    'confirmation',
    CASE WHEN v_decision = 'approved' THEN 'Propriétaire vérifié' ELSE 'Vérification refusée' END,
    CASE WHEN v_decision = 'approved'
      THEN 'Votre identité a été vérifiée. Vous pouvez désormais demander un retrait.'
      ELSE 'Votre dossier de vérification a été refusé. Consultez le motif puis soumettez de nouveaux documents.'
    END,
    v_request.id
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    CASE WHEN v_decision = 'approved' THEN 'owner_verification_approved' ELSE 'owner_verification_rejected' END,
    'owner_verification_requests', v_request.id,
    jsonb_build_object('owner_id', v_request.owner_id, 'document_type', v_request.document_type)
  );

  RETURN QUERY SELECT
    CASE WHEN v_decision = 'approved' THEN 'verifie'::TEXT ELSE 'refuse'::TEXT END,
    v_now;
END;
$$;

-- RPC publique limitée à un booléen : elle permet l'affichage volontaire du
-- badge sur une annonce, sans exposer document, numéro, téléphone ou e-mail.
CREATE OR REPLACE FUNCTION public.is_owner_verified(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_owner_id
      AND u.role = 'proprietaire'
      AND u.owner_verification_status = 'verifie'
      AND u.owner_verified_at IS NOT NULL
  );
$$;

-- Le contrôle ci-dessous est la barrière décisive : même un appel direct à
-- l'Edge Function est refusé avant toute réservation du solde / payout.
CREATE OR REPLACE FUNCTION public.create_withdrawal_and_deduct(
  p_wallet_id UUID,
  p_owner_id UUID,
  p_amount INTEGER,
  p_operator public.operator_enum,
  p_destination_phone TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (withdrawal_id UUID, withdrawal_status TEXT, already_exists BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_withdrawal public.withdrawals%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant de retrait invalide';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE wallet_id = p_wallet_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, true;
    RETURN;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id AND owner_id = p_owner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet introuvable ou accès refusé';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_owner_id
      AND u.role = 'proprietaire'
      AND u.is_active = true
      AND u.owner_verification_status = 'verifie'
      AND u.owner_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Retrait indisponible : votre identité doit être vérifiée par ImoFlex';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.withdrawals
    WHERE wallet_id = p_wallet_id AND status = 'en_traitement'
  ) THEN
    RAISE EXCEPTION 'Un retrait est déjà en cours de traitement pour ce wallet';
  END IF;
  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  UPDATE public.wallets
  SET available_balance = available_balance - p_amount,
      total_withdrawn = total_withdrawn + p_amount
  WHERE id = p_wallet_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.withdrawals (
    wallet_id, amount, operator, destination_phone, status, idempotency_key, estimated_completion
  ) VALUES (
    p_wallet_id, p_amount, p_operator, p_destination_phone, 'en_traitement', p_idempotency_key,
    now() + interval '3 days'
  )
  RETURNING * INTO v_withdrawal;

  INSERT INTO public.financial_ledger (
    wallet_id, reference_type, reference_id, entry_type, amount, balance_after
  ) VALUES (
    p_wallet_id, 'withdrawal', v_withdrawal.id, 'debit', p_amount, v_wallet.available_balance
  );

  RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, false;
END;
$$;

-- Fonctions utilisables par le client : les contrôles de rôle/propriété sont
-- dans leur corps. La fonction de paiement futur reste exclusivement serveur.
REVOKE ALL ON FUNCTION public.get_my_owner_verification() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_owner_verification_draft(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_owner_verification(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_owner_verification(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_owner_verified(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_owner_verification_fee_payment(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_withdrawal_and_deduct(UUID, UUID, INTEGER, public.operator_enum, TEXT, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_owner_verification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_owner_verification_draft(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_owner_verification(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_owner_verification(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_verified(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_owner_verification_fee_payment(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_withdrawal_and_deduct(UUID, UUID, INTEGER, public.operator_enum, TEXT, UUID) TO service_role;

COMMIT;
