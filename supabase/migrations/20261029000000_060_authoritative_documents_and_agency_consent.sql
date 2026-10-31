BEGIN;

-- ---------------------------------------------------------------------------
-- Signatures et documents : l'acteur est déterminé par auth.uid(), jamais par
-- un rôle ou un nom transmis par le navigateur. Les documents existants ne
-- sont ni supprimés ni réécrits.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_lease_contract_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_tenant_id uuid;
  v_owner_changed boolean;
  v_tenant_changed boolean;
  v_terms_changed boolean;
  v_profile_name text;
BEGIN
  SELECT l.tenant_id, p.owner_id
    INTO v_tenant_id, v_owner_id
  FROM public.leases l
  JOIN public.properties p ON p.id = l.property_id
  WHERE l.id = NEW.lease_id;

  IF v_owner_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Bail ou participants introuvables';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_actor IS DISTINCT FROM v_owner_id THEN
      RAISE EXCEPTION 'Seul le propriétaire du bien peut créer le brouillon';
    END IF;
    NEW.status := 'brouillon';
    NEW.owner_consent := false;
    NEW.owner_signed_at := NULL;
    NEW.owner_signature_svg := NULL;
    NEW.owner_signer_name := NULL;
    NEW.owner_signer_ip := NULL;
    NEW.tenant_consent := false;
    NEW.tenant_signed_at := NULL;
    NEW.tenant_signature_svg := NULL;
    NEW.tenant_signer_name := NULL;
    NEW.tenant_signer_ip := NULL;
    NEW.document_hash := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  v_owner_changed := ROW(NEW.owner_consent, NEW.owner_signed_at, NEW.owner_signature_svg,
                         NEW.owner_signer_name, NEW.owner_signer_ip)
                  IS DISTINCT FROM
                     ROW(OLD.owner_consent, OLD.owner_signed_at, OLD.owner_signature_svg,
                         OLD.owner_signer_name, OLD.owner_signer_ip);
  v_tenant_changed := ROW(NEW.tenant_consent, NEW.tenant_signed_at, NEW.tenant_signature_svg,
                          NEW.tenant_signer_name, NEW.tenant_signer_ip)
                   IS DISTINCT FROM
                      ROW(OLD.tenant_consent, OLD.tenant_signed_at, OLD.tenant_signature_svg,
                          OLD.tenant_signer_name, OLD.tenant_signer_ip);
  v_terms_changed := ROW(NEW.monthly_rent, NEW.deposit_amount, NEW.advance_amount,
                         NEW.charges_amount, NEW.payment_deadline_day, NEW.duration_months,
                         NEW.start_date, NEW.end_date, NEW.property_usage,
                         NEW.notice_period_months, NEW.special_clauses, NEW.contract_number,
                         NEW.version, NEW.lease_id, NEW.pdf_storage_path)
                  IS DISTINCT FROM
                     ROW(OLD.monthly_rent, OLD.deposit_amount, OLD.advance_amount,
                         OLD.charges_amount, OLD.payment_deadline_day, OLD.duration_months,
                         OLD.start_date, OLD.end_date, OLD.property_usage,
                         OLD.notice_period_months, OLD.special_clauses, OLD.contract_number,
                         OLD.version, OLD.lease_id, OLD.pdf_storage_path);

  IF v_owner_changed AND v_tenant_changed THEN
    RAISE EXCEPTION 'Une seule partie peut signer par opération';
  END IF;

  IF v_owner_changed THEN
    IF v_actor IS DISTINCT FROM v_owner_id OR OLD.owner_signed_at IS NOT NULL
       OR NEW.owner_signature_svg IS NULL
       OR length(NEW.owner_signature_svg) > 524288
       OR NEW.owner_signature_svg !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
       OR OLD.status NOT IN ('brouillon', 'en_attente_proprietaire') THEN
      RAISE EXCEPTION 'Signature propriétaire non autorisée ou invalide';
    END IF;
    SELECT u.full_name INTO v_profile_name FROM public.users u WHERE u.id = v_actor;
    NEW.owner_consent := true;
    NEW.owner_signed_at := now();
    NEW.owner_signer_name := v_profile_name;
    NEW.owner_signer_ip := NULL;
  END IF;

  IF v_tenant_changed THEN
    IF v_actor IS DISTINCT FROM v_tenant_id OR OLD.tenant_signed_at IS NOT NULL
       OR NEW.tenant_signature_svg IS NULL
       OR length(NEW.tenant_signature_svg) > 524288
       OR NEW.tenant_signature_svg !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
       OR OLD.status NOT IN ('brouillon', 'en_attente_locataire') THEN
      RAISE EXCEPTION 'Signature locataire non autorisée ou invalide';
    END IF;
    SELECT u.full_name INTO v_profile_name FROM public.users u WHERE u.id = v_actor;
    NEW.tenant_consent := true;
    NEW.tenant_signed_at := now();
    NEW.tenant_signer_name := v_profile_name;
    NEW.tenant_signer_ip := NULL;
  END IF;

  IF v_terms_changed AND (v_actor IS DISTINCT FROM v_owner_id
      OR OLD.status <> 'brouillon'
      OR OLD.owner_signed_at IS NOT NULL
      OR OLD.tenant_signed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Les clauses ne peuvent plus être modifiées après le début des signatures';
  END IF;

  IF NOT v_owner_changed AND NOT v_tenant_changed AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Le statut du contrat est déterminé par les signatures';
  END IF;
  IF NOT v_owner_changed AND NOT v_tenant_changed AND NEW.document_hash IS DISTINCT FROM OLD.document_hash THEN
    RAISE EXCEPTION 'L’empreinte du contrat est calculée côté serveur';
  END IF;

  NEW.updated_at := now();
  IF v_owner_changed OR v_tenant_changed THEN
    IF NEW.owner_signed_at IS NOT NULL AND NEW.tenant_signed_at IS NOT NULL THEN
      NEW.status := 'signe';
      NEW.document_hash := encode(digest(convert_to((to_jsonb(NEW) - 'document_hash')::text, 'UTF8'), 'sha256'), 'hex');
    ELSIF NEW.owner_signed_at IS NOT NULL THEN
      NEW.status := 'en_attente_locataire';
      NEW.document_hash := NULL;
    ELSE
      NEW.status := 'en_attente_proprietaire';
      NEW.document_hash := NULL;
    END IF;
  ELSIF v_terms_changed THEN
    NEW.document_hash := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_lease_contract_write ON public.lease_contracts;
CREATE TRIGGER guard_lease_contract_write
  BEFORE INSERT OR UPDATE ON public.lease_contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_lease_contract_write();

CREATE OR REPLACE FUNCTION public.sign_lease_contract(
  p_contract_id uuid,
  p_signature_data text
)
RETURNS public.lease_contracts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_contract public.lease_contracts%ROWTYPE;
  v_owner_id uuid;
  v_tenant_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_signature_data IS NULL OR length(p_signature_data) > 524288
     OR p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' THEN
    RAISE EXCEPTION 'Format de signature invalide';
  END IF;

  SELECT c INTO v_contract
  FROM public.lease_contracts c
  WHERE c.id = p_contract_id
  FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrat introuvable'; END IF;

  SELECT l.tenant_id, p.owner_id INTO v_tenant_id, v_owner_id
  FROM public.leases l JOIN public.properties p ON p.id = l.property_id
  WHERE l.id = v_contract.lease_id;

  IF v_actor = v_owner_id THEN
    IF v_contract.owner_signed_at IS NOT NULL THEN RAISE EXCEPTION 'Le propriétaire a déjà signé'; END IF;
    IF v_contract.status NOT IN ('brouillon', 'en_attente_proprietaire') THEN
      RAISE EXCEPTION 'Le contrat n’attend pas la signature du propriétaire';
    END IF;
    UPDATE public.lease_contracts
      SET owner_signature_svg = p_signature_data
      WHERE id = p_contract_id;
  ELSIF v_actor = v_tenant_id THEN
    IF v_contract.tenant_signed_at IS NOT NULL THEN RAISE EXCEPTION 'Le locataire a déjà signé'; END IF;
    IF v_contract.status NOT IN ('brouillon', 'en_attente_locataire') THEN
      RAISE EXCEPTION 'Le contrat n’attend pas la signature du locataire';
    END IF;
    UPDATE public.lease_contracts
      SET tenant_signature_svg = p_signature_data
      WHERE id = p_contract_id;
  ELSE
    RAISE EXCEPTION 'Seules les parties au bail peuvent signer';
  END IF;

  SELECT * INTO v_contract FROM public.lease_contracts WHERE id = p_contract_id;
  RETURN v_contract;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_lease_contract(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_lease_contract(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- États des lieux : même séparation des signatures, attribution serveur de
-- l'auteur et verrouillage des constats dès la première signature.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_property_inspection_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_tenant_id uuid;
  v_owner_changed boolean;
  v_tenant_changed boolean;
  v_details_changed boolean;
BEGIN
  SELECT l.tenant_id, p.owner_id
    INTO v_tenant_id, v_owner_id
  FROM public.leases l
  JOIN public.properties p ON p.id = l.property_id
  WHERE l.id = NEW.lease_id;
  IF v_owner_id IS NULL OR v_tenant_id IS NULL THEN RAISE EXCEPTION 'Bail introuvable'; END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_actor IS DISTINCT FROM v_owner_id AND v_actor IS DISTINCT FROM v_tenant_id THEN
      RAISE EXCEPTION 'Seules les parties au bail peuvent créer un état des lieux';
    END IF;
    NEW.conducted_by_id := v_actor;
    NEW.status := 'brouillon';
    NEW.owner_confirmed_at := NULL;
    NEW.owner_signature_svg := NULL;
    NEW.tenant_confirmed_at := NULL;
    NEW.tenant_signature_svg := NULL;
    NEW.document_hash := NULL;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  v_owner_changed := ROW(NEW.owner_confirmed_at, NEW.owner_signature_svg)
                  IS DISTINCT FROM ROW(OLD.owner_confirmed_at, OLD.owner_signature_svg);
  v_tenant_changed := ROW(NEW.tenant_confirmed_at, NEW.tenant_signature_svg)
                   IS DISTINCT FROM ROW(OLD.tenant_confirmed_at, OLD.tenant_signature_svg);
  v_details_changed := ROW(NEW.inspection_type, NEW.inspection_date, NEW.conducted_by_id,
                           NEW.water_meter_reading, NEW.electric_meter_reading,
                           NEW.keys_handed_count, NEW.keys_description,
                           NEW.general_observations, NEW.pdf_report_path)
                    IS DISTINCT FROM
                       ROW(OLD.inspection_type, OLD.inspection_date, OLD.conducted_by_id,
                           OLD.water_meter_reading, OLD.electric_meter_reading,
                           OLD.keys_handed_count, OLD.keys_description,
                           OLD.general_observations, OLD.pdf_report_path);

  IF v_owner_changed AND v_tenant_changed THEN RAISE EXCEPTION 'Une seule partie peut confirmer par opération'; END IF;
  IF v_owner_changed THEN
    IF v_actor IS DISTINCT FROM v_owner_id OR OLD.owner_confirmed_at IS NOT NULL
       OR NEW.owner_signature_svg IS NULL OR length(NEW.owner_signature_svg) > 524288
       OR NEW.owner_signature_svg !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
       OR OLD.status NOT IN ('brouillon', 'en_attente_validation', 'conteste') THEN
      RAISE EXCEPTION 'Confirmation propriétaire non autorisée ou invalide';
    END IF;
    NEW.owner_confirmed_at := now();
  END IF;
  IF v_tenant_changed THEN
    IF v_actor IS DISTINCT FROM v_tenant_id OR OLD.tenant_confirmed_at IS NOT NULL
       OR NEW.tenant_signature_svg IS NULL OR length(NEW.tenant_signature_svg) > 524288
       OR NEW.tenant_signature_svg !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
       OR OLD.status NOT IN ('brouillon', 'en_attente_validation', 'conteste') THEN
      RAISE EXCEPTION 'Confirmation locataire non autorisée ou invalide';
    END IF;
    NEW.tenant_confirmed_at := now();
  END IF;

  IF NEW.tenant_reserves IS DISTINCT FROM OLD.tenant_reserves
     AND (NOT v_tenant_changed OR v_actor IS DISTINCT FROM v_tenant_id) THEN
    RAISE EXCEPTION 'Seul le locataire peut transmettre ses réserves au moment de sa confirmation';
  END IF;
  IF v_details_changed AND (OLD.owner_confirmed_at IS NOT NULL OR OLD.tenant_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Les constats sont verrouillés après la première confirmation';
  END IF;
  IF NOT v_owner_changed AND NOT v_tenant_changed AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Le statut de l’état des lieux est déterminé par les confirmations';
  END IF;
  IF NOT v_owner_changed AND NOT v_tenant_changed AND NEW.document_hash IS DISTINCT FROM OLD.document_hash THEN
    RAISE EXCEPTION 'L’empreinte de l’état des lieux est calculée côté serveur';
  END IF;

  NEW.updated_at := now();
  IF v_owner_changed OR v_tenant_changed THEN
    IF NEW.owner_confirmed_at IS NOT NULL AND NEW.tenant_confirmed_at IS NOT NULL THEN
      IF NULLIF(btrim(NEW.tenant_reserves), '') IS NOT NULL THEN
        NEW.status := 'conteste';
      ELSE
        NEW.status := 'valide';
      END IF;
      NEW.document_hash := encode(digest(convert_to(jsonb_build_object(
        'inspection', to_jsonb(NEW) - 'document_hash',
        'items', COALESCE((
          SELECT jsonb_agg(to_jsonb(i) ORDER BY i.display_order, i.id)
          FROM public.property_inspection_items i WHERE i.inspection_id = NEW.id
        ), '[]'::jsonb)
      )::text, 'UTF8'), 'sha256'), 'hex');
    ELSE
      NEW.status := 'en_attente_validation';
      NEW.document_hash := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_property_inspection_write ON public.property_inspections;
CREATE TRIGGER guard_property_inspection_write
  BEFORE INSERT OR UPDATE ON public.property_inspections
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_inspection_write();

CREATE OR REPLACE FUNCTION public.confirm_property_inspection(
  p_inspection_id uuid,
  p_signature_data text,
  p_tenant_reserves text DEFAULT NULL
)
RETURNS public.property_inspections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_inspection public.property_inspections%ROWTYPE;
  v_owner_id uuid;
  v_tenant_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_signature_data IS NULL OR length(p_signature_data) > 524288
     OR p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' THEN
    RAISE EXCEPTION 'Format de signature invalide';
  END IF;
  IF p_tenant_reserves IS NOT NULL AND length(p_tenant_reserves) > 5000 THEN
    RAISE EXCEPTION 'Les réserves dépassent la taille autorisée';
  END IF;

  SELECT i.* INTO v_inspection
  FROM public.property_inspections i
  WHERE i.id = p_inspection_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'État des lieux introuvable'; END IF;

  SELECT l.tenant_id, p.owner_id INTO v_tenant_id, v_owner_id
  FROM public.leases l JOIN public.properties p ON p.id = l.property_id
  WHERE l.id = v_inspection.lease_id;

  IF v_actor = v_owner_id THEN
    IF v_inspection.owner_confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Le propriétaire a déjà confirmé'; END IF;
    IF p_tenant_reserves IS NOT NULL THEN RAISE EXCEPTION 'Seul le locataire peut transmettre des réserves'; END IF;
    UPDATE public.property_inspections SET owner_signature_svg = p_signature_data WHERE id = p_inspection_id;
  ELSIF v_actor = v_tenant_id THEN
    IF v_inspection.tenant_confirmed_at IS NOT NULL THEN RAISE EXCEPTION 'Le locataire a déjà confirmé'; END IF;
    UPDATE public.property_inspections
      SET tenant_signature_svg = p_signature_data,
          tenant_reserves = NULLIF(btrim(p_tenant_reserves), '')
      WHERE id = p_inspection_id;
  ELSE
    RAISE EXCEPTION 'Seules les parties au bail peuvent confirmer';
  END IF;

  SELECT * INTO v_inspection FROM public.property_inspections WHERE id = p_inspection_id;
  RETURN v_inspection;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_property_inspection(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_property_inspection(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_property_inspection_item_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_inspection_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.inspection_id ELSE NEW.inspection_id END;
  v_lease_id uuid;
BEGIN
  SELECT lease_id INTO v_lease_id FROM public.property_inspections
  WHERE id = v_inspection_id AND status = 'brouillon';
  IF v_lease_id IS NULL OR NOT public.is_lease_participant(v_lease_id) THEN
    RAISE EXCEPTION 'Les constats ne sont modifiables que par les parties pendant le brouillon';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_property_inspection_item_write ON public.property_inspection_items;
CREATE TRIGGER guard_property_inspection_item_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.property_inspection_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_inspection_item_write();

-- Les participants lisent les documents, mais les écritures client passent par
-- les gardes ci-dessus. Les brouillons contractuels restent modifiables par le
-- propriétaire ; les signatures passent par les RPC authentifiées.
DROP POLICY IF EXISTS lease_contracts_update_participant ON public.lease_contracts;
DROP POLICY IF EXISTS lease_contracts_update_owner_draft ON public.lease_contracts;
CREATE POLICY lease_contracts_update_owner_draft ON public.lease_contracts
  FOR UPDATE TO authenticated
  USING (public.is_lease_owner(lease_id) AND status = 'brouillon')
  WITH CHECK (public.is_lease_owner(lease_id) AND status = 'brouillon');

-- Un propriétaire ne doit pas lire toute la ligne privée `users` d'un
-- locataire. Les écrans de gestion ont besoin uniquement du nom, du téléphone
-- de contact et de l'avatar du locataire actif sur l'un de ses biens.
DROP POLICY IF EXISTS "users_select_as_owner" ON public.users;

CREATE OR REPLACE FUNCTION public.get_owner_tenant_profiles(p_tenant_ids uuid[])
RETURNS TABLE (id uuid, full_name text, phone text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT u.id, u.full_name::text, u.phone::text, u.avatar_url::text
  FROM public.users u
  JOIN public.leases l ON l.tenant_id = u.id AND l.status = 'actif'
  JOIN public.properties p ON p.id = l.property_id AND p.owner_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND cardinality(COALESCE(p_tenant_ids, ARRAY[]::uuid[])) BETWEEN 1 AND 500
    AND u.id = ANY(p_tenant_ids)
$$;

REVOKE ALL ON FUNCTION public.get_owner_tenant_profiles(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_owner_tenant_profiles(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Mandats : seuls les propriétaires peuvent consentir via une fonction qui
-- dérive leur identité depuis la session et vérifie la propriété des ressources.
-- ---------------------------------------------------------------------------

ALTER TABLE public.agence_mandats
  ADD COLUMN IF NOT EXISTS owner_consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_consented_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Les demandes de contact précèdent parfois le bail actif. Elles donnent
-- accès au nom du candidat seulement au propriétaire de l'annonce (ou à une
-- agence qui détient un mandat explicitement consenti sur cette annonce).
CREATE OR REPLACE FUNCTION public.get_contact_requester_names(p_contact_request_ids uuid[])
RETURNS TABLE (request_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT r.id, u.full_name::text
  FROM public.contact_requests r
  JOIN public.listings l ON l.id = r.listing_id
  JOIN public.users u ON u.id = r.requester_id
  WHERE auth.uid() IS NOT NULL
    AND cardinality(COALESCE(p_contact_request_ids, ARRAY[]::uuid[])) BETWEEN 1 AND 500
    AND r.id = ANY(p_contact_request_ids)
    AND (
      l.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.agence_mandats m
        WHERE m.agence_id = auth.uid()
          AND m.listing_id = r.listing_id
          AND m.owner_consented_at IS NOT NULL
          AND m.status = 'actif'
      )
    )
$$;

REVOKE ALL ON FUNCTION public.get_contact_requester_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_requester_names(uuid[]) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_agence_mandats_consented
  ON public.agence_mandats (agence_id, owner_id, status)
  WHERE owner_consented_at IS NOT NULL;

DROP POLICY IF EXISTS "agence_mandats_agence_select" ON public.agence_mandats;
CREATE POLICY "agence_mandats_agence_select" ON public.agence_mandats FOR SELECT
  TO authenticated USING (agence_id = auth.uid() AND owner_consented_at IS NOT NULL);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.agence_mandats FROM PUBLIC, anon, authenticated;

-- Répertoire minimal pour que le propriétaire puisse choisir une agence sans
-- ouvrir la lecture des téléphones, emails ou adresses des profils agence.
CREATE OR REPLACE FUNCTION public.list_active_agencies()
RETURNS TABLE (id uuid, nom_agence text, ville text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT u.id,
         COALESCE(NULLIF(ap.nom_agence, ''), u.full_name)::text,
         ap.ville::text,
         ap.logo_url::text
  FROM public.users u
  JOIN public.agences_profiles ap ON ap.id = u.id
  WHERE u.role = 'agence'::public.user_role
    AND u.is_active = true
  ORDER BY COALESCE(NULLIF(ap.nom_agence, ''), u.full_name)
$$;

REVOKE ALL ON FUNCTION public.list_active_agencies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_agencies() TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_agence_mandat(
  p_agence_id uuid,
  p_listing_id uuid DEFAULT NULL,
  p_property_id uuid DEFAULT NULL,
  p_commission_rate numeric DEFAULT 10,
  p_notes text DEFAULT NULL
)
RETURNS public.agence_mandats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
  v_agency_role public.user_role;
  v_listing_owner uuid;
  v_property_owner uuid;
  v_mandat public.agence_mandats%ROWTYPE;
BEGIN
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_agence_id IS NULL OR p_agence_id = v_owner_id THEN RAISE EXCEPTION 'Agence invalide'; END IF;
  IF p_listing_id IS NULL AND p_property_id IS NULL THEN
    RAISE EXCEPTION 'Un bien ou une annonce doit être associé au mandat';
  END IF;
  IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 100 THEN
    RAISE EXCEPTION 'Taux de commission invalide';
  END IF;
  IF p_notes IS NOT NULL AND length(p_notes) > 2000 THEN RAISE EXCEPTION 'Notes trop longues'; END IF;

SELECT role INTO v_agency_role FROM public.users WHERE id = p_agence_id AND is_active = true;
IF v_agency_role IS DISTINCT FROM 'agence'::public.user_role THEN
    RAISE EXCEPTION 'Le bénéficiaire doit être une agence active';
  END IF;

  IF p_listing_id IS NOT NULL THEN
    SELECT owner_id INTO v_listing_owner FROM public.listings WHERE id = p_listing_id;
    IF v_listing_owner IS DISTINCT FROM v_owner_id THEN RAISE EXCEPTION 'Cette annonce ne vous appartient pas'; END IF;
  END IF;
  IF p_property_id IS NOT NULL THEN
    SELECT owner_id INTO v_property_owner FROM public.properties WHERE id = p_property_id;
    IF v_property_owner IS DISTINCT FROM v_owner_id THEN RAISE EXCEPTION 'Ce bien ne vous appartient pas'; END IF;
  END IF;
  IF p_listing_id IS NOT NULL AND p_property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = p_property_id AND listing_id = p_listing_id AND owner_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'L’annonce ne correspond pas au bien sélectionné';
  END IF;

  INSERT INTO public.agence_mandats (
    agence_id, owner_id, listing_id, property_id, status, commission_rate,
    notes, owner_consented_at, owner_consented_by
  ) VALUES (
    p_agence_id, v_owner_id, p_listing_id, p_property_id, 'actif',
    p_commission_rate, p_notes, now(), v_owner_id
  ) RETURNING * INTO v_mandat;
  RETURN v_mandat;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_agence_mandat(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_agence_mandat(uuid, uuid, uuid, numeric, text) TO authenticated;

-- Permet au propriétaire de valider explicitement une proposition ancienne
-- créée avant le verrouillage des écritures directes. L’agence ne peut pas
-- exécuter cette transition à la place du propriétaire.
CREATE OR REPLACE FUNCTION public.accept_agence_mandat(p_mandat_id uuid)
RETURNS public.agence_mandats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_mandat public.agence_mandats%ROWTYPE;
  v_agency_role public.user_role;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  SELECT * INTO v_mandat FROM public.agence_mandats
  WHERE id = p_mandat_id AND owner_id = v_actor AND owner_consented_at IS NULL
    AND status <> 'termine'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposition introuvable ou déjà consentie'; END IF;

  SELECT role INTO v_agency_role FROM public.users
  WHERE id = v_mandat.agence_id AND is_active = true;
  IF v_agency_role IS DISTINCT FROM 'agence'::public.user_role THEN
    RAISE EXCEPTION 'Le bénéficiaire n’est pas une agence active';
  END IF;

  IF v_mandat.property_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = v_mandat.property_id AND owner_id = v_actor
  ) THEN RAISE EXCEPTION 'Cette proposition ne porte pas sur un bien qui vous appartient'; END IF;
  IF v_mandat.listing_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.listings WHERE id = v_mandat.listing_id AND owner_id = v_actor
  ) THEN RAISE EXCEPTION 'Cette proposition ne porte pas sur une annonce qui vous appartient'; END IF;
  IF v_mandat.property_id IS NULL AND v_mandat.listing_id IS NULL THEN
    RAISE EXCEPTION 'La proposition ne référence plus de bien existant';
  END IF;
  IF v_mandat.property_id IS NOT NULL AND v_mandat.listing_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE id = v_mandat.property_id
      AND listing_id = v_mandat.listing_id AND owner_id = v_actor
  ) THEN RAISE EXCEPTION 'Le bien et l’annonce ne correspondent pas'; END IF;

  UPDATE public.agence_mandats
    SET status = 'actif', owner_consented_at = now(), owner_consented_by = v_actor, updated_at = now()
  WHERE id = v_mandat.id
  RETURNING * INTO v_mandat;
  RETURN v_mandat;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_agence_mandat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_agence_mandat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.terminate_agence_mandat(p_mandat_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  UPDATE public.agence_mandats
    SET status = 'termine', updated_at = now()
  WHERE id = p_mandat_id
    AND status <> 'termine'
    AND (owner_id = v_actor OR agence_id = v_actor)
    AND owner_consented_at IS NOT NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.terminate_agence_mandat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminate_agence_mandat(uuid) TO authenticated;

-- Les objets d’un état des lieux restent immuables après la première
-- confirmation. Les PDFs attachés à un document signé ne peuvent pas être
-- supprimés au travers du bucket privé.
DROP POLICY IF EXISTS lease_documents_insert ON storage.objects;
CREATE POLICY lease_documents_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lease-documents'
    AND public.is_lease_participant((storage.foldername(name))[1]::uuid)
    AND (
      (array_length(storage.foldername(name), 1) >= 3
       AND (storage.foldername(name))[2] = 'inspections'
       AND EXISTS (
         SELECT 1 FROM public.property_inspections i
         WHERE i.id = (storage.foldername(name))[3]::uuid
           AND i.lease_id = (storage.foldername(name))[1]::uuid
           AND i.status = 'brouillon'
           AND i.owner_confirmed_at IS NULL
           AND i.tenant_confirmed_at IS NULL
       ))
      OR
      ((array_length(storage.foldername(name), 1) < 3
        OR (storage.foldername(name))[2] <> 'inspections')
       AND public.is_lease_owner((storage.foldername(name))[1]::uuid))
    )
  );

DROP POLICY IF EXISTS lease_documents_delete ON storage.objects;
CREATE POLICY lease_documents_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lease-documents'
    AND public.is_lease_owner((storage.foldername(name))[1]::uuid)
    AND NOT EXISTS (
      SELECT 1 FROM public.lease_contracts c
      WHERE c.lease_id = (storage.foldername(name))[1]::uuid
        AND c.pdf_storage_path = name
        AND (c.owner_signed_at IS NOT NULL OR c.tenant_signed_at IS NOT NULL)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.property_inspections i
      WHERE i.lease_id = (storage.foldername(name))[1]::uuid
        AND (i.pdf_report_path = name OR
             (i.owner_confirmed_at IS NOT NULL OR i.tenant_confirmed_at IS NOT NULL)
             AND EXISTS (
               SELECT 1 FROM public.property_inspection_items item
               WHERE item.inspection_id = i.id AND item.photo_paths @> jsonb_build_array(name)
             ))
        AND (i.owner_confirmed_at IS NOT NULL OR i.tenant_confirmed_at IS NOT NULL)
    )
  );

-- Le hash précédent porte sur l'enregistrement en base, pas sur le PDF rendu.
-- Cette table conserve les octets PDF exacts, une seule fois, avec le hash de
-- l'enregistrement signé auquel le PDF se réfère. Aucun accès direct client.
CREATE TABLE IF NOT EXISTS public.signed_document_pdfs (
  document_type text NOT NULL CHECK (document_type IN ('lease_contract', 'property_inspection')),
  document_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  document_hash text NOT NULL CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes bytea NOT NULL CHECK (octet_length(pdf_bytes) BETWEEN 1 AND 4194304),
  sealed_by uuid NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_type, document_id)
);

ALTER TABLE public.signed_document_pdfs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.signed_document_pdfs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seal_signed_document_pdf(
  p_document_type text,
  p_document_id uuid,
  p_pdf_base64 text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner_id uuid;
  v_tenant_id uuid;
  v_lease_id uuid;
  v_document_hash text;
  v_pdf bytea;
  v_pdf_hash text;
  v_existing public.signed_document_pdfs%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_pdf_base64 IS NULL OR length(p_pdf_base64) > 5600000 THEN
    RAISE EXCEPTION 'Le PDF est absent ou dépasse la taille autorisée';
  END IF;
  v_pdf := decode(p_pdf_base64, 'base64');
  IF octet_length(v_pdf) > 4194304 OR position(convert_to('%PDF-', 'UTF8') IN v_pdf) <> 1
     OR position(convert_to('%%EOF', 'UTF8') IN v_pdf) = 0 THEN
    RAISE EXCEPTION 'Le contenu transmis n’est pas un PDF valide ou dépasse 4 Mio';
  END IF;

  IF p_document_type = 'lease_contract' THEN
    SELECT c.lease_id, c.document_hash, p.owner_id, l.tenant_id
      INTO v_lease_id, v_document_hash, v_owner_id, v_tenant_id
    FROM public.lease_contracts c
    JOIN public.leases l ON l.id = c.lease_id
    JOIN public.properties p ON p.id = l.property_id
    WHERE c.id = p_document_id AND c.status = 'signe'
      AND c.owner_signed_at IS NOT NULL AND c.tenant_signed_at IS NOT NULL;
  ELSIF p_document_type = 'property_inspection' THEN
    SELECT i.lease_id, i.document_hash, p.owner_id, l.tenant_id
      INTO v_lease_id, v_document_hash, v_owner_id, v_tenant_id
    FROM public.property_inspections i
    JOIN public.leases l ON l.id = i.lease_id
    JOIN public.properties p ON p.id = l.property_id
    WHERE i.id = p_document_id AND i.status IN ('valide', 'conteste')
      AND i.owner_confirmed_at IS NOT NULL AND i.tenant_confirmed_at IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Type de document non pris en charge';
  END IF;

  IF v_lease_id IS NULL OR v_document_hash IS NULL THEN
    RAISE EXCEPTION 'Le document n’est pas signé par les deux parties';
  END IF;
  IF v_actor IS DISTINCT FROM v_owner_id THEN
    RAISE EXCEPTION 'Seul le propriétaire authentifié peut sceller le PDF final';
  END IF;
  IF position(convert_to(v_document_hash, 'UTF8') IN v_pdf) = 0 THEN
    RAISE EXCEPTION 'Le PDF ne contient pas l’empreinte de l’enregistrement signé';
  END IF;

  v_pdf_hash := encode(digest(v_pdf, 'sha256'), 'hex');
  INSERT INTO public.signed_document_pdfs (
    document_type, document_id, lease_id, document_hash, pdf_sha256, pdf_bytes, sealed_by
  ) VALUES (
    p_document_type, p_document_id, v_lease_id, v_document_hash, v_pdf_hash, v_pdf, v_actor
  ) ON CONFLICT (document_type, document_id) DO NOTHING;

  SELECT * INTO v_existing FROM public.signed_document_pdfs
  WHERE document_type = p_document_type AND document_id = p_document_id;
  IF v_existing.pdf_sha256 IS DISTINCT FROM v_pdf_hash
     OR v_existing.document_hash IS DISTINCT FROM v_document_hash
     OR v_existing.pdf_bytes IS DISTINCT FROM v_pdf THEN
    RAISE EXCEPTION 'Un PDF final immuable est déjà scellé pour ce document';
  END IF;
  RETURN v_pdf_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_signed_document_pdf(
  p_document_type text,
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_lease_id uuid;
  v_current_hash text;
  v_artifact public.signed_document_pdfs%ROWTYPE;
  v_participant boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_document_type = 'lease_contract' THEN
    SELECT c.lease_id, c.document_hash INTO v_lease_id, v_current_hash
    FROM public.lease_contracts c WHERE c.id = p_document_id AND c.status = 'signe';
  ELSIF p_document_type = 'property_inspection' THEN
    SELECT i.lease_id, i.document_hash INTO v_lease_id, v_current_hash
    FROM public.property_inspections i WHERE i.id = p_document_id AND i.status IN ('valide', 'conteste');
  ELSE RAISE EXCEPTION 'Type de document non pris en charge';
  END IF;
  IF v_lease_id IS NULL THEN RAISE EXCEPTION 'Document signé introuvable'; END IF;
  v_participant := public.is_lease_participant(v_lease_id);
  IF NOT v_participant THEN RAISE EXCEPTION 'Accès refusé'; END IF;

  SELECT * INTO v_artifact FROM public.signed_document_pdfs
  WHERE document_type = p_document_type AND document_id = p_document_id;
  RETURN jsonb_build_object(
    'verified', v_artifact.document_id IS NOT NULL
      AND v_artifact.document_hash = v_current_hash
      AND v_artifact.pdf_sha256 = encode(digest(v_artifact.pdf_bytes, 'sha256'), 'hex'),
    'pdf_sha256', v_artifact.pdf_sha256,
    'document_hash', v_current_hash,
    'sealed_at', v_artifact.sealed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.download_signed_document_pdf(
  p_document_type text,
  p_document_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_verified jsonb;
  v_pdf bytea;
BEGIN
  v_verified := public.verify_signed_document_pdf(p_document_type, p_document_id);
  IF COALESCE((v_verified->>'verified')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'L’empreinte du PDF ne correspond plus au document signé';
  END IF;
  SELECT pdf_bytes INTO v_pdf FROM public.signed_document_pdfs
  WHERE document_type = p_document_type AND document_id = p_document_id;
  RETURN encode(v_pdf, 'base64');
END;
$$;

REVOKE ALL ON FUNCTION public.seal_signed_document_pdf(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_signed_document_pdf(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.download_signed_document_pdf(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seal_signed_document_pdf(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_signed_document_pdf(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.download_signed_document_pdf(text, uuid) TO authenticated;

-- Données d'une quittance / d'un reçu construites uniquement depuis les
-- tables financières. Le hash ci-dessous porte sur ces données JSON canoniques,
-- pas sur le PDF ni sur une signature manuscrite.
CREATE OR REPLACE FUNCTION public._payment_receipt_facts(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_row record;
  v_facts jsonb;
BEGIN
  SELECT p.id, p.tenant_id, prop.owner_id, p.amount, p.status, p.operator,
         p.fedapay_transaction_id, p.created_at,
         rp.period_month, rp.period_year, rp.amount_due, rp.amount_paid,
         prop.name AS property_name, prop.address AS property_location,
         tenant.full_name AS tenant_name, tenant.phone AS tenant_phone,
         owner.full_name AS owner_name, owner.phone AS owner_phone,
         owner.owner_verification_status
    INTO v_row
  FROM public.payments p
  JOIN public.rent_periods rp ON rp.id = p.rent_period_id
  JOIN public.leases l ON l.id = rp.lease_id
  JOIN public.properties prop ON prop.id = l.property_id
  JOIN public.users tenant ON tenant.id = p.tenant_id
  JOIN public.users owner ON owner.id = prop.owner_id
  WHERE p.id = p_payment_id AND p.status = 'valide';

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_facts := jsonb_build_object(
    'payment_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'owner_id', v_row.owner_id,
    'amount', v_row.amount,
    'status', v_row.status,
    'operator', v_row.operator,
    'fedapay_transaction_id', v_row.fedapay_transaction_id,
    'created_at', v_row.created_at,
    'period_month', v_row.period_month,
    'period_year', v_row.period_year,
    'amount_due', v_row.amount_due,
    'amount_paid', v_row.amount_paid,
    'remaining_due', GREATEST(v_row.amount_due - v_row.amount_paid, 0),
    'property_name', v_row.property_name,
    'property_location', v_row.property_location,
    'tenant_name', v_row.tenant_name,
    'tenant_phone', v_row.tenant_phone,
    'owner_name', v_row.owner_name,
    'owner_phone', v_row.owner_phone,
    'owner_verification_status', v_row.owner_verification_status
  );
  RETURN v_facts || jsonb_build_object(
    'record_sha256', encode(digest(convert_to(v_facts::text, 'UTF8'), 'sha256'), 'hex')
  );
END;
$$;

REVOKE ALL ON FUNCTION public._payment_receipt_facts(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_receipt_data(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_facts jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  v_facts := public._payment_receipt_facts(p_payment_id);
  IF v_facts IS NULL THEN RAISE EXCEPTION 'Paiement confirmé introuvable'; END IF;
  IF v_actor IS DISTINCT FROM (v_facts->>'tenant_id')::uuid
     AND v_actor IS DISTINCT FROM (v_facts->>'owner_id')::uuid THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN v_facts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_receipt_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_receipt_data(uuid) TO authenticated;

-- Le QR public confirme seulement les faits financiers non identifiants. Les
-- noms et téléphones restent disponibles uniquement aux deux participants.
CREATE OR REPLACE FUNCTION public.verify_public_payment_receipt(p_reference text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_prefix text;
  v_match_count integer;
  v_payment_id uuid;
  v_facts jsonb;
BEGIN
  v_prefix := lower(regexp_replace(btrim(COALESCE(p_reference, '')), '^QUIT-', '', 'i'));
  IF v_prefix !~ '^[0-9a-f]{12,32}$' THEN
    RETURN jsonb_build_object('found', false, 'verified', false);
  END IF;

  SELECT count(*) INTO v_match_count FROM public.payments p
  WHERE p.status = 'valide'
    AND lower(replace(p.id::text, '-', '')) LIKE v_prefix || '%';
  IF v_match_count <> 1 THEN
    RETURN jsonb_build_object('found', false, 'verified', false, 'ambiguous', v_match_count > 1);
  END IF;

  SELECT p.id INTO v_payment_id FROM public.payments p
  WHERE p.status = 'valide'
    AND lower(replace(p.id::text, '-', '')) LIKE v_prefix || '%';
  v_facts := public._payment_receipt_facts(v_payment_id);
  IF v_facts IS NULL THEN RETURN jsonb_build_object('found', false, 'verified', false); END IF;

  RETURN jsonb_build_object(
    'found', true,
    'verified', true,
    'reference', 'QUIT-' || upper(left(replace(v_payment_id::text, '-', ''), 12)),
    'amount', v_facts->'amount',
    'date', v_facts->'created_at',
    'operator', v_facts->'operator',
    'period_month', v_facts->'period_month',
    'period_year', v_facts->'period_year',
    'amount_due', v_facts->'amount_due',
    'amount_paid', v_facts->'amount_paid',
    'remaining_due', v_facts->'remaining_due',
    'record_sha256', v_facts->'record_sha256'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_public_payment_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_public_payment_receipt(text) TO anon, authenticated;

-- Vérification publique par numéro de contrat : ne renvoie aucun nom ni donnée
-- locative, seulement l’état des empreintes et leurs valeurs cryptographiques.
CREATE OR REPLACE FUNCTION public.verify_public_contract_pdf(p_contract_number text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_contract public.lease_contracts%ROWTYPE;
  v_artifact public.signed_document_pdfs%ROWTYPE;
  v_verified boolean := false;
BEGIN
  SELECT * INTO v_contract FROM public.lease_contracts
  WHERE contract_number = p_contract_number AND status = 'signe'
    AND owner_signed_at IS NOT NULL AND tenant_signed_at IS NOT NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false, 'verified', false); END IF;
  SELECT * INTO v_artifact FROM public.signed_document_pdfs
  WHERE document_type = 'lease_contract' AND document_id = v_contract.id;
  v_verified := v_artifact.document_id IS NOT NULL
    AND v_artifact.document_hash = v_contract.document_hash
    AND v_artifact.pdf_sha256 = encode(digest(v_artifact.pdf_bytes, 'sha256'), 'hex');
  RETURN jsonb_build_object(
    'found', true,
    'verified', v_verified,
    'contract_number', v_contract.contract_number,
    'document_hash', v_contract.document_hash,
    'pdf_sha256', v_artifact.pdf_sha256,
    'sealed_at', v_artifact.sealed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_public_contract_pdf(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_public_contract_pdf(text) TO anon, authenticated;

COMMIT;
