import { useState, useEffect, useCallback } from 'react';
import { supabase, Wallet, Withdrawal } from '../lib/supabase';

export function useWallet(ownerId: string | undefined) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async () => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('wallets')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (err) {
      setError(err.message);
    } else if (data) {
      setWallet(data as Wallet);
      const { data: wds } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('wallet_id', data.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setWithdrawals((wds || []) as Withdrawal[]);
    } else {
      setWallet(null);
    }
    setLoading(false);
  }, [ownerId]);

  const ensureWallet = useCallback(async (): Promise<Wallet | null> => {
    if (!ownerId) return null;

    // Vérification locale d'abord (évite un appel réseau inutile)
    const { data: existing } = await supabase
      .from('wallets')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (existing) return existing as Wallet;

    // Création via Edge Function (service_role) — l'insert client direct
    // est désormais bloqué par RLS (migration 016).
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Non authentifié');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-wallet`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
      throw new Error(errorBody.error || `Erreur HTTP ${response.status}`);
    }

    const { wallet } = await response.json();
    return wallet as Wallet;
  }, [ownerId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  return { wallet, withdrawals, loading, error, refetch: fetchWallet, ensureWallet };
}
