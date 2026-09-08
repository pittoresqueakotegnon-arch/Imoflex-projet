-- ============================================================
-- Migration 026 : Rate Limiting natif Postgres
-- Protège les endpoints financiers contre les abus
-- ============================================================

-- 1. Table de journalisation des appels API
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,
    endpoint    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index compound pour que la fenêtre glissante soit ultra-rapide
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_user_endpoint_created
    ON public.rate_limit_log (user_id, endpoint, created_at DESC);

-- Pas de RLS : table interne, jamais exposée au client
-- L'accès est contrôlé par les permissions de la fonction RPC ci-dessous

-- 2. Fonction RPC check_rate_limit
-- Retourne TRUE si l'appel est autorisé, FALSE si le seuil est dépassé.
-- En mode autorisé, insère le log atomiquement.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_user_id       UUID,
    p_endpoint      TEXT,
    p_max_requests  INT,
    p_window_seconds INT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Purge des entrées de plus de 1 heure pour éviter la croissance infinie de la table
    DELETE FROM public.rate_limit_log
    WHERE created_at < NOW() - INTERVAL '1 hour';

    -- Comptage dans la fenêtre glissante
    SELECT COUNT(*) INTO v_count
    FROM public.rate_limit_log
    WHERE user_id = p_user_id
      AND endpoint = p_endpoint
      AND created_at > NOW() - (p_window_seconds || ' seconds')::interval;

    IF v_count >= p_max_requests THEN
        RETURN false;
    END IF;

    -- Autorisé : on enregistre l'appel
    INSERT INTO public.rate_limit_log (user_id, endpoint, created_at)
    VALUES (p_user_id, p_endpoint, NOW());

    RETURN true;
END;
$$;

-- 3. Sécurisation stricte : seul service_role peut appeler cette fonction
REVOKE ALL ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) TO service_role;

-- 4. La table rate_limit_log est également inaccessible hors service_role
REVOKE ALL ON TABLE public.rate_limit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_log TO service_role;
GRANT USAGE ON SEQUENCE public.rate_limit_log_id_seq TO service_role;
