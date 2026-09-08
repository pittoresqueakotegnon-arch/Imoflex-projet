-- Fix the RPC error related to the rent_period_status_enum
CREATE OR REPLACE FUNCTION public.process_payment_webhook(p_fedapay_tx_id TEXT, p_event_type TEXT)
RETURNS json AS $$
DECLARE
    v_payment record;
    v_rent_period record;
    v_owner_id uuid;
    v_tenant_id uuid;
    v_commission_rate numeric;
    v_owner_amount numeric;
    v_commission_amount numeric;
    v_new_amount_paid numeric;
    v_new_rp_status public.rent_period_status_enum;
    v_wallet record;
BEGIN
    -- 1. Verrouiller le paiement
    SELECT p.* INTO v_payment
    FROM public.payments p
    WHERE p.fedapay_transaction_id = p_fedapay_tx_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable';
    END IF;

    -- Idempotence
    IF v_payment.status IN ('valide', 'echoue') THEN
        RETURN json_build_object(
            'status', 'already_processed',
            'payment_id', v_payment.id
        );
    END IF;
    
    v_tenant_id := v_payment.tenant_id;

    -- Gestion du refus
    IF p_event_type = 'transaction.declined' THEN
        UPDATE public.payments SET status = 'echoue' WHERE id = v_payment.id;
        RETURN json_build_object(
            'status', 'declined',
            'payment_id', v_payment.id,
            'tenant_id', v_tenant_id,
            'amount', v_payment.amount
        );
    END IF;

    IF p_event_type != 'transaction.approved' THEN
        RAISE EXCEPTION 'Event type non supporté par ce RPC';
    END IF;

    -- 2. Récupérer rent_period et owner_id avec verrous
    SELECT rp.* INTO v_rent_period
    FROM public.rent_periods rp
    WHERE rp.id = v_payment.rent_period_id
    FOR UPDATE;

    SELECT pr.owner_id INTO v_owner_id
    FROM public.properties pr
    JOIN public.leases l ON l.property_id = pr.id
    WHERE l.id = v_rent_period.lease_id;

    -- 3. Calcul de la commission avec arrondi
    SELECT COALESCE((SELECT value::numeric FROM public.app_config WHERE key = 'commission_rate'), 6) INTO v_commission_rate;
    
    v_owner_amount := ROUND(v_payment.amount * (1.0 - (v_commission_rate / 100.0)), 0);
    v_commission_amount := v_payment.amount - v_owner_amount;

    -- 4. Update payments
    UPDATE public.payments 
    SET status = 'valide', 
        validated_at = NOW(),
        commission_amount = v_commission_amount,
        commission_rate_applied = v_commission_rate
    WHERE id = v_payment.id;

    -- 5. Update rent_periods
    v_new_amount_paid := COALESCE(v_rent_period.amount_paid, 0) + v_payment.amount;
    IF v_new_amount_paid >= v_rent_period.amount_due THEN
        v_new_rp_status := 'solde';
    ELSE
        v_new_rp_status := 'en_cours';
    END IF;

    UPDATE public.rent_periods
    SET amount_paid = v_new_amount_paid,
        status = v_new_rp_status
    WHERE id = v_rent_period.id;

    -- 6. Update or Create wallet + Insertion dans le Ledger
    IF v_owner_id IS NOT NULL THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE owner_id = v_owner_id FOR UPDATE;
        IF FOUND THEN
            UPDATE public.wallets 
            SET available_balance = available_balance + v_owner_amount,
                total_earned = total_earned + v_owner_amount
            WHERE id = v_wallet.id
            RETURNING id, available_balance INTO v_wallet;
        ELSE
            INSERT INTO public.wallets (owner_id, available_balance, total_earned, total_withdrawn)
            VALUES (v_owner_id, v_owner_amount, v_owner_amount, 0)
            RETURNING id, available_balance INTO v_wallet;
        END IF;

        -- Insertion de l'écriture comptable
        INSERT INTO public.financial_ledger (
            wallet_id, reference_type, reference_id, entry_type, amount, balance_after
        ) VALUES (
            v_wallet.id, 'payment', v_payment.id, 'credit', v_owner_amount, v_wallet.available_balance
        );
    END IF;

    RETURN json_build_object(
        'status', 'approved',
        'payment_id', v_payment.id,
        'owner_id', v_owner_id,
        'tenant_id', v_tenant_id,
        'amount', v_payment.amount,
        'owner_amount', v_owner_amount,
        'commission_rate', v_commission_rate
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
