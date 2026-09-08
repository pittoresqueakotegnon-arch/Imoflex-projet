-- ============================================================================
-- Migration 039 : baux et échéances créés côté base, jamais par le navigateur
-- ============================================================================

BEGIN;

-- Les écritures monétaires et les baux sont exclusivement créés par les flux
-- serveur ci-dessous. Les lectures restent protégées par les policies existantes.
DROP POLICY IF EXISTS "payments_insert_tenant" ON public.payments;
DROP POLICY IF EXISTS "withdrawals_insert_own" ON public.withdrawals;
DROP POLICY IF EXISTS "rent_periods_insert_tenant" ON public.rent_periods;
DROP POLICY IF EXISTS "rent_periods_update_tenant" ON public.rent_periods;
DROP POLICY IF EXISTS "leases_insert_tenant" ON public.leases;
DROP POLICY IF EXISTS "leases_update_tenant" ON public.leases;

-- Le code d'accès est un secret de rattachement : la précédente policy donnait
-- accès à toutes les propriétés actives, y compris leur access_code.
DROP POLICY IF EXISTS "properties_select_by_code" ON public.properties;
DROP POLICY IF EXISTS "properties_select_tenant_active_lease" ON public.properties;
CREATE POLICY "properties_select_tenant_active_lease" ON public.properties FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leases
    WHERE leases.property_id = properties.id
      AND leases.tenant_id = auth.uid()
      AND leases.status = 'actif'
  )
);

-- Crée, si nécessaire, l'échéance du mois courant avec les valeurs calculées à
-- partir du bail et du bien. L'appelant peut être le locataire ou le propriétaire
-- du bien, mais ne peut choisir ni le montant ni le statut.
CREATE OR REPLACE FUNCTION public.ensure_current_rent_period(p_lease_id UUID)
RETURNS public.rent_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lease public.leases%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_period public.rent_periods%ROWTYPE;
  v_caller_id UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_month SMALLINT := EXTRACT(MONTH FROM CURRENT_DATE)::SMALLINT;
  v_year SMALLINT := EXTRACT(YEAR FROM CURRENT_DATE)::SMALLINT;
  v_current_deadline DATE;
  v_next_deadline DATE;
  v_previous_deadline DATE;
  v_deadline DATE;
  v_total_days INTEGER;
  v_days_occupied INTEGER;
  v_amount INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT * INTO v_lease
  FROM public.leases
  WHERE id = p_lease_id
    AND status = 'actif';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bail actif introuvable';
  END IF;

  SELECT * INTO v_property FROM public.properties WHERE id = v_lease.property_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bien introuvable';
  END IF;

  IF v_caller_id <> v_lease.tenant_id AND v_caller_id <> v_property.owner_id THEN
    RAISE EXCEPTION 'Accès non autorisé';
  END IF;

  SELECT * INTO v_period
  FROM public.rent_periods
  WHERE lease_id = v_lease.id
    AND period_month = v_month
    AND period_year = v_year;
  IF FOUND THEN
    RETURN v_period;
  END IF;

  v_current_deadline := make_date(v_year, v_month, v_property.payment_deadline_day);
  IF date_trunc('month', v_lease.start_date) = date_trunc('month', v_today) THEN
    -- Reproduit le prorata affiché par le client, mais le calcule côté serveur.
    v_next_deadline := CASE
      WHEN v_current_deadline <= v_lease.start_date THEN (v_current_deadline + INTERVAL '1 month')::DATE
      ELSE v_current_deadline
    END;
    v_previous_deadline := (v_next_deadline - INTERVAL '1 month')::DATE;
    v_total_days := v_next_deadline - v_previous_deadline;
    v_days_occupied := v_next_deadline - v_lease.start_date;
    v_amount := LEAST(
      v_property.monthly_rent,
      (ROUND(((v_property.monthly_rent::NUMERIC / v_total_days) * GREATEST(v_days_occupied, 0)) / 500) * 500)::INTEGER
    );
    v_deadline := GREATEST(v_current_deadline, v_lease.start_date);
  ELSE
    v_amount := v_property.monthly_rent;
    v_deadline := v_current_deadline;
  END IF;

  INSERT INTO public.rent_periods (
    lease_id, period_month, period_year, amount_due, amount_paid, deadline_date, status
  ) VALUES (
    v_lease.id, v_month, v_year, v_amount, 0, v_deadline, 'en_cours'
  )
  ON CONFLICT (lease_id, period_month, period_year) DO NOTHING
  RETURNING * INTO v_period;

  IF NOT FOUND THEN
    SELECT * INTO v_period
    FROM public.rent_periods
    WHERE lease_id = v_lease.id
      AND period_month = v_month
      AND period_year = v_year;
  END IF;

  RETURN v_period;
END;
$$;

-- Rejoint un bien depuis son code sans exposer au client une possibilité de
-- créer un bail arbitraire. Le verrou sur properties sérialise deux demandes
-- concurrentes vers le même logement.
CREATE OR REPLACE FUNCTION public.join_property_with_access_code(p_access_code TEXT)
RETURNS TABLE (lease_id UUID, rent_period_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_property public.properties%ROWTYPE;
  v_lease public.leases%ROWTYPE;
  v_period public.rent_periods%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT public.check_rate_limit(v_caller_id, 'join-property', 3, 60) THEN
    RAISE EXCEPTION 'Trop de tentatives. Réessayez dans une minute';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_caller_id AND role = 'locataire' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Seul un compte locataire actif peut rejoindre un logement';
  END IF;

  SELECT * INTO v_property
  FROM public.properties
  WHERE access_code = UPPER(TRIM(p_access_code))
    AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code invalide ou inexistant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.leases WHERE property_id = v_property.id AND status = 'actif'
  ) THEN
    RAISE EXCEPTION 'Ce logement est déjà occupé';
  END IF;

  INSERT INTO public.leases (tenant_id, property_id, start_date, status)
  VALUES (v_caller_id, v_property.id, CURRENT_DATE, 'actif')
  RETURNING * INTO v_lease;

  v_period := public.ensure_current_rent_period(v_lease.id);

  IF v_property.listing_id IS NOT NULL THEN
    UPDATE public.listings
    SET availability_status = 'occupe'
    WHERE id = v_property.listing_id;
  END IF;

  RETURN QUERY SELECT v_lease.id, v_period.id;
END;
$$;

-- Prévisualisation limitée du bien pour l'écran de confirmation. Aucun code,
-- propriétaire ou autre champ sensible n'est renvoyé.
CREATE OR REPLACE FUNCTION public.preview_property_by_access_code(p_access_code TEXT)
RETURNS TABLE (
  id UUID,
  name VARCHAR,
  address TEXT,
  monthly_rent INTEGER,
  payment_deadline_day SMALLINT,
  listing_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT public.check_rate_limit(auth.uid(), 'preview-property', 10, 60) THEN
    RAISE EXCEPTION 'Trop de tentatives. Réessayez dans une minute';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.address, p.monthly_rent, p.payment_deadline_day, p.listing_id
  FROM public.properties p
  WHERE p.access_code = UPPER(TRIM(p_access_code))
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.leases l WHERE l.property_id = p.id AND l.status = 'actif'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_current_rent_period(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_property_with_access_code(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.preview_property_by_access_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_rent_period(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_property_with_access_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_property_by_access_code(TEXT) TO authenticated;

COMMIT;
