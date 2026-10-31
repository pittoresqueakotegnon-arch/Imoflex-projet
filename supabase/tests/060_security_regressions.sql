-- Tests transactionnels de sécurité pour la migration 060.
-- À lancer sur une base Supabase locale/de test avec les migrations appliquées.
-- Toutes les données créées sont annulées par le ROLLBACK final.
BEGIN;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_property uuid := gen_random_uuid();
  v_listing uuid := gen_random_uuid();
  v_lease uuid := gen_random_uuid();
  v_rent_period uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_contract uuid := gen_random_uuid();
  v_inspection uuid := gen_random_uuid();
  v_mandate_id uuid := gen_random_uuid();
  v_contact_request_id uuid := gen_random_uuid();
  v_mandate public.agence_mandats%ROWTYPE;
BEGIN
  -- Les profils sont créés par le trigger Auth réel.
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES
    (v_owner, 'authenticated', 'authenticated', v_owner::text || '@security-test.invalid', '', now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Owner Security Test','phone','+229000000001','role','proprietaire')),
    (v_tenant, 'authenticated', 'authenticated', v_tenant::text || '@security-test.invalid', '', now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Tenant Security Test','phone','+229000000002','role','locataire')),
    (v_agency, 'authenticated', 'authenticated', v_agency::text || '@security-test.invalid', '', now(),
     '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name','Agency Security Test','phone','+229000000003','role','agence'));

  INSERT INTO public.listings (id, owner_id, title, city, address, property_type, monthly_rent)
  VALUES (v_listing, v_owner, 'Security test listing', 'Cotonou', 'Test address', 'appartement', 100000);
  INSERT INTO public.properties (id, owner_id, listing_id, name, address, monthly_rent, payment_deadline_day, access_code)
  VALUES (v_property, v_owner, v_listing, 'Security test property', 'Test address', 100000, 5, 'SEC-' || left(v_property::text, 6));
  INSERT INTO public.leases (id, tenant_id, property_id, start_date, status)
  VALUES (v_lease, v_tenant, v_property, current_date, 'actif');
  INSERT INTO public.rent_periods (id, lease_id, period_month, period_year, amount_due, amount_paid, deadline_date)
  VALUES (v_rent_period, v_lease, 10, 2026, 100000, 25000, current_date + 5);
  INSERT INTO public.payments (id, rent_period_id, tenant_id, amount, operator, status, fedapay_transaction_id, validated_at)
  VALUES (v_payment, v_rent_period, v_tenant, 25000, 'mtn', 'valide', 'SEC-RECEIPT-' || left(v_payment::text, 8), now());
  INSERT INTO public.contact_requests (id, listing_id, requester_id, message, contact_phone)
  VALUES (v_contact_request_id, v_listing, v_tenant, 'Demande de visite de sécurité', '+229000000002');

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  INSERT INTO public.lease_contracts (id, lease_id, contract_number, monthly_rent, payment_deadline_day,
                                      duration_months, start_date, property_usage, notice_period_months)
  VALUES (v_contract, v_lease, 'SEC-' || left(v_contract::text, 12), 100000, 5, 12, current_date,
          'habitation_exclusive', 3);
  INSERT INTO public.property_inspections (id, lease_id, inspection_type)
  VALUES (v_inspection, v_lease, 'entree');
  -- Représente une ancienne proposition préexistante créée avant la migration.
  INSERT INTO public.agence_mandats (id, agence_id, owner_id, listing_id, property_id, status, commission_rate)
  VALUES (v_mandate_id, v_agency, v_owner, v_listing, v_property, 'actif', 10);

  PERFORM set_config('imoflex_test.owner', v_owner::text, true);
  PERFORM set_config('imoflex_test.tenant', v_tenant::text, true);
  PERFORM set_config('imoflex_test.agency', v_agency::text, true);
  PERFORM set_config('imoflex_test.property', v_property::text, true);
  PERFORM set_config('imoflex_test.listing', v_listing::text, true);
  PERFORM set_config('imoflex_test.lease', v_lease::text, true);
  PERFORM set_config('imoflex_test.payment', v_payment::text, true);
  PERFORM set_config('imoflex_test.contract', v_contract::text, true);
  PERFORM set_config('imoflex_test.inspection', v_inspection::text, true);
  PERFORM set_config('imoflex_test.mandate', v_mandate_id::text, true);
  PERFORM set_config('imoflex_test.contact_request', v_contact_request_id::text, true);
END $$;

-- Un locataire ne peut pas remplir les champs de signature du propriétaire.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('imoflex_test.tenant'), true);
UPDATE public.lease_contracts
  SET owner_signature_svg = 'data:image/png;base64,QQ=='
  WHERE id = current_setting('imoflex_test.contract')::uuid;
DO $$ BEGIN
  IF (SELECT owner_signature_svg FROM public.lease_contracts WHERE id = current_setting('imoflex_test.contract')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'SEC-01: tenant wrote the owner contract signature';
  END IF;
END $$;
SELECT public.sign_lease_contract(current_setting('imoflex_test.contract')::uuid, 'data:image/png;base64,QQ==');
DO $$ BEGIN
  IF (SELECT owner_signature_svg FROM public.lease_contracts WHERE id = current_setting('imoflex_test.contract')::uuid) IS NOT NULL
     OR (SELECT tenant_signer_name FROM public.lease_contracts WHERE id = current_setting('imoflex_test.contract')::uuid) IS DISTINCT FROM 'Tenant Security Test'
     OR (SELECT status FROM public.lease_contracts WHERE id = current_setting('imoflex_test.contract')::uuid) <> 'en_attente_proprietaire' THEN
    RAISE EXCEPTION 'SEC-01: tenant signature was not bound to the authenticated tenant';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.lease_contracts SET status = 'signe'
    WHERE id = current_setting('imoflex_test.contract')::uuid;
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_CONTRACT_TRANSITION';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'SECURITY_TEST_UNEXPECTED_CONTRACT_TRANSITION' THEN RAISE; END IF;
  END;
END $$;

-- L'agence ne peut ni insérer un mandat ni consentir en se faisant passer pour le propriétaire.
SELECT set_config('request.jwt.claim.sub', current_setting('imoflex_test.agency'), true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.agence_mandats WHERE agence_id = current_setting('imoflex_test.agency')::uuid) <> 0 THEN
    RAISE EXCEPTION 'SEC-02: agency can see a mandate without owner consent';
  END IF;
  BEGIN
    INSERT INTO public.agence_mandats (agence_id, owner_id, property_id, status)
    VALUES (current_setting('imoflex_test.agency')::uuid, current_setting('imoflex_test.owner')::uuid,
            current_setting('imoflex_test.property')::uuid, 'actif');
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_INSERT';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.grant_agence_mandat(
      current_setting('imoflex_test.agency')::uuid,
      current_setting('imoflex_test.listing')::uuid,
      current_setting('imoflex_test.property')::uuid,
      10,
      NULL
    );
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_GRANT';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'SECURITY_TEST_UNEXPECTED_GRANT' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.accept_agence_mandat(current_setting('imoflex_test.mandate')::uuid);
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_ACCEPT';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'SECURITY_TEST_UNEXPECTED_ACCEPT' THEN RAISE; END IF;
  END;
END $$;

-- La signature du propriétaire est, elle aussi, déterminée par la session authentifiée.
SELECT set_config('request.jwt.claim.sub', current_setting('imoflex_test.owner'), true);
DO $$
DECLARE
  v_private_profile_count integer;
  v_profile jsonb;
BEGIN
  SELECT count(*) INTO v_private_profile_count FROM public.users
  WHERE id = current_setting('imoflex_test.tenant')::uuid;
  IF v_private_profile_count <> 0 THEN
    RAISE EXCEPTION 'SEC-02: owner can read the tenant private users row directly';
  END IF;

  SELECT to_jsonb(profile) INTO v_profile
  FROM public.get_owner_tenant_profiles(ARRAY[current_setting('imoflex_test.tenant')::uuid]) profile;
  IF v_profile->>'full_name' IS DISTINCT FROM 'Tenant Security Test'
     OR v_profile->>'phone' IS DISTINCT FROM '+229000000002'
     OR v_profile ? 'email' OR v_profile ? 'mobile_money_number' OR v_profile ? 'fcm_token' THEN
    RAISE EXCEPTION 'SEC-02: owner tenant directory RPC returned incorrect or private fields';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_owner_tenant_profiles(ARRAY[current_setting('imoflex_test.agency')::uuid])
  ) THEN
    RAISE EXCEPTION 'SEC-02: owner can request a profile without an active lease';
  END IF;

  IF (SELECT full_name FROM public.get_contact_requester_names(ARRAY[current_setting('imoflex_test.contact_request')::uuid]))
      IS DISTINCT FROM 'Tenant Security Test' THEN
    RAISE EXCEPTION 'SEC-02: owner could not retrieve a contact requester name';
  END IF;

  v_profile := public.get_payment_receipt_data(current_setting('imoflex_test.payment')::uuid);
  IF (v_profile->>'amount')::integer <> 25000
     OR (v_profile->>'amount_due')::integer <> 100000
     OR (v_profile->>'amount_paid')::integer <> 25000
     OR (v_profile->>'remaining_due')::integer <> 75000
     OR v_profile->>'tenant_name' IS DISTINCT FROM 'Tenant Security Test'
     OR length(v_profile->>'record_sha256') <> 64 THEN
    RAISE EXCEPTION 'PDF: receipt facts did not come from the authoritative payment records';
  END IF;

  v_profile := public.verify_public_payment_receipt('QUIT-' || upper(left(replace(current_setting('imoflex_test.payment'), '-', ''), 12)));
  IF (v_profile->>'verified')::boolean IS NOT TRUE
     OR (v_profile->>'amount')::integer <> 25000
     OR (v_profile->>'remaining_due')::integer <> 75000
     OR v_profile ? 'tenant_name' OR v_profile ? 'owner_name' OR v_profile ? 'tenant_phone' THEN
    RAISE EXCEPTION 'PDF: public receipt verification failed or exposed private identity fields';
  END IF;

  v_profile := public.verify_public_payment_receipt('QUIT-' || upper(left(replace(current_setting('imoflex_test.payment'), '-', ''), 6)));
  IF (v_profile->>'found')::boolean IS TRUE THEN
    RAISE EXCEPTION 'PDF: public verification accepted a short, enumerable reference';
  END IF;
END $$;

UPDATE public.lease_contracts
  SET tenant_signature_svg = 'data:image/png;base64,Qg=='
  WHERE id = current_setting('imoflex_test.contract')::uuid;
DO $$ BEGIN
  IF (SELECT tenant_signature_svg FROM public.lease_contracts WHERE id = current_setting('imoflex_test.contract')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'SEC-01: owner wrote the tenant contract signature';
  END IF;
END $$;
SELECT public.sign_lease_contract(current_setting('imoflex_test.contract')::uuid, 'data:image/png;base64,Qg==');
DO $$ BEGIN
  IF (SELECT owner_signer_name FROM public.lease_contracts WHERE id = current_setting('imoflex_test.contract')::uuid) IS DISTINCT FROM 'Owner Security Test'
     OR (SELECT status FROM public.lease_contracts WHERE id = current_setting('imoflex_test.contract')::uuid) <> 'signe' THEN
    RAISE EXCEPTION 'SEC-01: owner signature was not bound to the authenticated owner';
  END IF;
END $$;

-- Le propriétaire scelle le PDF exact après avoir signé. Le hash est calculé
-- en base sur les octets et vérifié contre l'empreinte des données signées.
DO $$
DECLARE
  v_document_hash text;
  v_pdf_base64 text;
  v_pdf_hash text;
  v_public_check jsonb;
BEGIN
  SELECT document_hash INTO v_document_hash FROM public.lease_contracts
  WHERE id = current_setting('imoflex_test.contract')::uuid;
  v_pdf_base64 := encode(convert_to('%PDF-1.7' || chr(10) || v_document_hash || chr(10) || '%%EOF', 'UTF8'), 'base64');
  v_pdf_hash := public.seal_signed_document_pdf('lease_contract', current_setting('imoflex_test.contract')::uuid, v_pdf_base64);
  PERFORM set_config('imoflex_test.contract_pdf_hash', v_pdf_hash, true);
END $$;

DO $$
DECLARE
  v_document_hash text;
  v_pdf_base64 text;
  v_public_check jsonb;
BEGIN
  SELECT document_hash INTO v_document_hash FROM public.lease_contracts
  WHERE id = current_setting('imoflex_test.contract')::uuid;
  IF (public.verify_signed_document_pdf('lease_contract', current_setting('imoflex_test.contract')::uuid)->>'verified')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SEC-01: signed PDF byte hash failed server verification';
  END IF;
  v_public_check := public.verify_public_contract_pdf('SEC-' || left(current_setting('imoflex_test.contract'), 12));
  IF (v_public_check->>'verified')::boolean IS NOT TRUE OR v_public_check->>'pdf_sha256' IS DISTINCT FROM current_setting('imoflex_test.contract_pdf_hash') THEN
    RAISE EXCEPTION 'SEC-01: public PDF verification did not match the sealed bytes';
  END IF;
  BEGIN
    PERFORM public.seal_signed_document_pdf(
      'lease_contract', current_setting('imoflex_test.contract')::uuid,
      encode(convert_to('%PDF-1.7 changed' || chr(10) || v_document_hash || chr(10) || '%%EOF', 'UTF8'), 'base64')
    );
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_PDF_RESEAL';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'SECURITY_TEST_UNEXPECTED_PDF_RESEAL' THEN RAISE; END IF;
  END;
END $$;

-- Le locataire peut vérifier et télécharger exactement le même PDF scellé.
SELECT set_config('request.jwt.claim.sub', current_setting('imoflex_test.tenant'), true);
DO $$ BEGIN
  IF (public.verify_signed_document_pdf('lease_contract', current_setting('imoflex_test.contract')::uuid)->>'verified')::boolean IS NOT TRUE
     OR public.download_signed_document_pdf('lease_contract', current_setting('imoflex_test.contract')::uuid) IS NULL THEN
    RAISE EXCEPTION 'SEC-01: tenant could not verify/download the sealed PDF';
  END IF;
END $$;

-- Un locataire ne peut pas confirmer un état des lieux au nom du propriétaire.
SELECT set_config('request.jwt.claim.sub', current_setting('imoflex_test.tenant'), true);
DO $$
BEGIN
  BEGIN
    UPDATE public.property_inspections
      SET owner_signature_svg = 'data:image/png;base64,QQ=='
      WHERE id = current_setting('imoflex_test.inspection')::uuid;
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_TENANT_INSPECTION_UPDATE';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'SECURITY_TEST_UNEXPECTED_TENANT_INSPECTION_UPDATE' THEN RAISE; END IF;
  END;
END $$;
DO $$ BEGIN
  IF (SELECT owner_signature_svg FROM public.property_inspections WHERE id = current_setting('imoflex_test.inspection')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'SEC-01: tenant wrote the owner inspection signature';
  END IF;
END $$;
SELECT public.confirm_property_inspection(current_setting('imoflex_test.inspection')::uuid, 'data:image/png;base64,QQ==', 'Réserve de test');
DO $$ BEGIN
  IF (SELECT status FROM public.property_inspections WHERE id = current_setting('imoflex_test.inspection')::uuid) <> 'en_attente_validation'
     OR (SELECT tenant_confirmed_at IS NULL OR owner_confirmed_at IS NOT NULL FROM public.property_inspections WHERE id = current_setting('imoflex_test.inspection')::uuid) THEN
    RAISE EXCEPTION 'SEC-01: inspection did not enter the expected pending state';
  END IF;
END $$;
DO $$
BEGIN
  BEGIN
    UPDATE public.property_inspections SET status = 'valide'
    WHERE id = current_setting('imoflex_test.inspection')::uuid;
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_INSPECTION_TRANSITION';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'SECURITY_TEST_UNEXPECTED_INSPECTION_TRANSITION' THEN RAISE; END IF;
  END;
END $$;

-- Le propriétaire ne peut pas écrire le champ de confirmation du locataire.
SELECT set_config('request.jwt.claim.sub', current_setting('imoflex_test.owner'), true);
DO $$
BEGIN
  BEGIN
    UPDATE public.property_inspections SET tenant_signature_svg = 'data:image/png;base64,Qg=='
      WHERE id = current_setting('imoflex_test.inspection')::uuid;
    RAISE EXCEPTION 'SECURITY_TEST_UNEXPECTED_INSPECTION_UPDATE';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'SECURITY_TEST_UNEXPECTED_INSPECTION_UPDATE' THEN RAISE; END IF;
  END;
END $$;
SELECT public.confirm_property_inspection(current_setting('imoflex_test.inspection')::uuid, 'data:image/png;base64,Qg==', NULL);
DO $$
DECLARE
  v_document_hash text;
  v_pdf_base64 text;
BEGIN
  IF (SELECT status FROM public.property_inspections WHERE id = current_setting('imoflex_test.inspection')::uuid) <> 'conteste' THEN
    RAISE EXCEPTION 'SEC-01: tenant reserves did not lead to conteste status';
  END IF;
  SELECT document_hash INTO v_document_hash FROM public.property_inspections
  WHERE id = current_setting('imoflex_test.inspection')::uuid;
  v_pdf_base64 := encode(convert_to('%PDF-1.7' || chr(10) || v_document_hash || chr(10) || '%%EOF', 'UTF8'), 'base64');
  PERFORM public.seal_signed_document_pdf('property_inspection', current_setting('imoflex_test.inspection')::uuid, v_pdf_base64);
END $$;
DO $$ BEGIN
  IF (public.verify_signed_document_pdf('property_inspection', current_setting('imoflex_test.inspection')::uuid)->>'verified')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'SEC-01: inspection PDF byte hash failed server verification';
  END IF;
END $$;

-- Le propriétaire seul peut accorder un mandat à une agence et la ligne est
-- visible à l'agence seulement après cet acte explicite.
SELECT public.grant_agence_mandat(
  current_setting('imoflex_test.agency')::uuid,
  current_setting('imoflex_test.listing')::uuid,
  current_setting('imoflex_test.property')::uuid,
  10,
  'Consentement explicite de test'
);
SELECT public.accept_agence_mandat(current_setting('imoflex_test.mandate')::uuid);
RESET ROLE;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agence_mandats
    WHERE agence_id = current_setting('imoflex_test.agency')::uuid
      AND owner_id = current_setting('imoflex_test.owner')::uuid
      AND owner_consented_by = current_setting('imoflex_test.owner')::uuid
      AND owner_consented_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'SEC-02: owner consent was not recorded'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agence_mandats
    WHERE id = current_setting('imoflex_test.mandate')::uuid
      AND owner_consented_by = current_setting('imoflex_test.owner')::uuid
      AND owner_consented_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'SEC-02: owner acceptance was not recorded'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('imoflex_test.agency'), true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.agence_mandats WHERE agence_id = current_setting('imoflex_test.agency')::uuid) <> 2 THEN
    RAISE EXCEPTION 'SEC-02: consented mandates are not visible to their agency';
  END IF;
END $$;
RESET ROLE;

ROLLBACK;
