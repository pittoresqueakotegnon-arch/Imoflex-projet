-- Extension de l'enum notification_type_enum avec les nouveaux types KYC.
-- IMPORTANT : ALTER TYPE ADD VALUE ne peut pas être dans la même transaction
-- que les requêtes utilisant ces nouvelles valeurs (SQLSTATE 55P04).
-- La mise à jour des données existantes est dans la migration 053.

DO $$
BEGIN
  ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'owner_verified';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'owner_verification_rejected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.notification_type_enum ADD VALUE IF NOT EXISTS 'alerte';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
