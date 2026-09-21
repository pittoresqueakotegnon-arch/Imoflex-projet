import { useCallback, useEffect, useState } from 'react';
import { OwnerVerificationSummary } from '../lib/supabase';
import { fetchMyOwnerVerification } from '../lib/ownerVerification';

export function useOwnerVerification(enabled = true) {
  const [verification, setVerification] = useState<OwnerVerificationSummary>({ verification_status: 'non_verifie' });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setVerification(await fetchMyOwnerVerification());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger votre vérification.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { verification, loading, error, refetch };
}
