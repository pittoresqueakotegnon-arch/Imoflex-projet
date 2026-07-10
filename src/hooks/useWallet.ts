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
    const { data: existing } = await supabase
      .from('wallets')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (existing) return existing as Wallet;

    const { data: created, error: err } = await supabase
      .from('wallets')
      .insert({ owner_id: ownerId })
      .select()
      .single();
    if (err) throw new Error(err.message);
    return created as Wallet;
  }, [ownerId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  return { wallet, withdrawals, loading, error, refetch: fetchWallet, ensureWallet };
}
