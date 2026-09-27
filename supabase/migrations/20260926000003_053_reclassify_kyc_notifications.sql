-- Reclassification des notifications KYC mal typées en base.
-- Dépend de 052 qui a ajouté les valeurs dans l'enum notification_type_enum.
-- Ces deux opérations DOIVENT être dans des transactions séparées (contrainte PostgreSQL).

UPDATE public.notifications
SET type = 'owner_verified'
WHERE type = 'confirmation'
  AND title IN (
    'Propriétaire vérifié',
    'Identité vérifiée',
    'Identité vérifiée ✓'
  );

UPDATE public.notifications
SET type = 'owner_verification_rejected'
WHERE type = 'confirmation'
  AND title IN (
    'Vérification refusée',
    'Dossier refusé'
  );
