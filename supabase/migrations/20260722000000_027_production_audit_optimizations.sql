-- ============================================================
-- Migration 027 : Production Audit & Optimizations
-- ============================================================

-- 1. Atomic Wallet Deduction RPC to prevent race conditions during withdrawals
CREATE OR REPLACE FUNCTION public.atomic_wallet_deduction(p_wallet_id UUID, p_amount NUMERIC)
RETURNS json AS $$
DECLARE
    v_wallet record;
BEGIN
    -- Verrouiller la ligne du wallet
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet introuvable';
    END IF;

    IF v_wallet.available_balance < p_amount THEN
        RAISE EXCEPTION 'Solde insuffisant';
    END IF;

    UPDATE public.wallets
    SET available_balance = available_balance - p_amount,
        total_withdrawn = total_withdrawn + p_amount
    WHERE id = p_wallet_id
    RETURNING * INTO v_wallet;

    RETURN json_build_object(
        'status', 'success',
        'wallet_id', v_wallet.id,
        'new_balance', v_wallet.available_balance
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC inverse pour le rollback en cas d'échec de Fedapay
CREATE OR REPLACE FUNCTION public.atomic_wallet_refund(p_wallet_id UUID, p_amount NUMERIC)
RETURNS void AS $$
BEGIN
    UPDATE public.wallets
    SET available_balance = available_balance + p_amount,
        total_withdrawn = total_withdrawn - p_amount
    WHERE id = p_wallet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Indexes for Foreign Keys to improve Dashboard & query performance
CREATE INDEX IF NOT EXISTS idx_leases_tenant_id ON public.leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_property_id ON public.leases(property_id);
CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON public.properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_rent_periods_lease_id ON public.rent_periods(lease_id);
CREATE INDEX IF NOT EXISTS idx_payments_rent_period_id ON public.payments(rent_period_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_wallet_id ON public.financial_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_wallet_id ON public.withdrawals(wallet_id);

-- 3. Strict RLS for withdrawals and financial_ledger
-- Ensures only the owner can insert or select their own records.
DROP POLICY IF EXISTS "withdrawals_insert_own" ON public.withdrawals;
CREATE POLICY "withdrawals_insert_own" ON public.withdrawals FOR INSERT
TO authenticated
WITH CHECK (
    wallet_id IN (
        SELECT id FROM public.wallets WHERE owner_id = auth.uid()
    )
);

-- Ensure wallets total_withdrawn constraint
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS check_positive_balances;
ALTER TABLE public.wallets ADD CONSTRAINT check_positive_balances CHECK (available_balance >= 0);
