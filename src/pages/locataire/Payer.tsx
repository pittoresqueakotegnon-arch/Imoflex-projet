import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth';
import { supabase, RentPeriod, Operator } from '../../lib/supabase';
import { initiatePayment, normalizeBjPhone } from '../../lib/fedapay';
import { diagnoseAndShowError, showPaymentStatusError, showUssdTimeoutError } from '../../utils/errorDiagnostics';
import { useToast } from '../../components/Toast';
import { BackButton } from '../../components/BackButton';
import { haptics } from '../../lib/haptics';

export default function Payer() {
  const navigate = useNavigate();
  const { leaseId } = useParams<{ leaseId: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [currentRentPeriod, setCurrentRentPeriod] = useState<RentPeriod | null>(null);
  const [propertyName, setPropertyName] = useState('');
  const [amount, setAmount] = useState(0);
  const [userHasInteracted, setUserHasInteracted] = useState(false); // true dès qu'il tape ou clique un quick amount
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');


  useEffect(() => {
    if (profile) {
      setPhoneNumber(profile.mobile_money_number || profile.phone || '');
    }
  }, [profile]);

  // Auto-détection de l'opérateur
  useEffect(() => {
    const cleanNumber = phoneNumber.replace(/\s+/g, '').replace(/^\+229/, '');
    if (cleanNumber.length >= 2) {
      const prefix = cleanNumber.substring(0, 2);
      if (['97', '96', '67', '66', '61', '62', '51', '52', '53', '54', '42', '46', '91'].includes(prefix)) {
        setSelectedOperator('mtn');
      } else if (['95', '94', '65', '64', '60', '55', '44', '58'].includes(prefix)) {
        setSelectedOperator('moov');
      } else if (['90', '40', '41', '43'].includes(prefix)) {
        setSelectedOperator('celtiis');
      }
    }
  }, [phoneNumber]);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) return;

      if (!leaseId) {
        navigate('/dashboard');
        return;
      }

      try {
        const { data: leaseData, error: leaseError } = await supabase
          .from('leases')
          .select('id, tenant_id, status, properties:property_id(name)')
          .eq('id', leaseId)
          .eq('tenant_id', profile.id)
          .eq('status', 'actif')
          .maybeSingle();

        if (leaseError) throw leaseError;

        if (!leaseData) {
          showToast('Logement introuvable ou inactif', 'error');
          navigate('/dashboard');
          return;
        }

        setPropertyName((leaseData as any).properties?.name || '');

        const now = new Date();
        const { data: periodData, error: periodError } = await supabase
          .from('rent_periods')
          .select('*')
          .eq('lease_id', leaseData.id)
          .eq('period_month', now.getMonth() + 1)
          .eq('period_year', now.getFullYear())
          .maybeSingle();

        if (periodError && periodError.code !== 'PGRST116') throw periodError;

        if (periodData) {
          setCurrentRentPeriod(periodData);
          setAmount(Math.max(periodData.amount_due - periodData.amount_paid, 0));
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        showToast('Erreur lors du chargement des données', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id, leaseId, navigate, showToast]);

  const handleQuickAmount = (value: number | 'all') => {
    if (!currentRentPeriod) return;
    const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;
    setUserHasInteracted(true);
    if (value === 'all') {
      setAmount(remaining);
    } else {
      setAmount(Math.min(value, remaining));
    }
  };

  // Nouveau state pour le polling
  const [pollingPaymentId, setPollingPaymentId] = useState<string | null>(null);


  // Polling Realtime : écoute les changements de statut du paiement en DB
  useEffect(() => {
    if (!pollingPaymentId) return;

    const channel = supabase
      .channel(`payment-status-${pollingPaymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `id=eq.${pollingPaymentId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          clearTimeout(timeoutId);
          supabase.removeChannel(channel);
          setPollingPaymentId(null);
          setProcessing(false);

          if (updated.status === 'valide') {
            showToast('Paiement réussi ! Votre versement a été enregistré.', 'success');
            navigate('/historique');
          } else if (['echoue', 'canceled', 'declined'].includes(updated.status)) {
            showPaymentStatusError(updated.status, updated.failure_reason);
          }
        }
      )
      .subscribe();

    // Timeout de sécurité : 45 secondes si l'opérateur ne répond pas
    const timeoutId = setTimeout(() => {
      supabase.removeChannel(channel);
      setPollingPaymentId(null);
      setProcessing(false);
      showUssdTimeoutError();
    }, 45000);

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [pollingPaymentId, navigate, showToast]);

  const handlePay = async () => {
    setError('');

    if (amount < 100) {
      setError('Le montant minimum est 100 FCFA');
      return;
    }

    if (!selectedOperator) {
      setError('Veuillez sélectionner un opérateur');
      return;
    }

    const cleanedPhone = normalizeBjPhone(phoneNumber);
    if (!cleanedPhone || cleanedPhone.length !== 10) {
      setError('Numéro invalide. Entrez 10 chiffres (ex: 01 97 00 00 00)');
      return;
    }

    if (!currentRentPeriod) {
      setError('Impossible de trouver la période de loyer');
      return;
    }

    setProcessing(true);

    try {
      const result = await initiatePayment({
        amount,
        operator: selectedOperator,
        rent_period_id: currentRentPeriod.id,
        phone_number: phoneNumber,
      });

      if (selectedOperator === 'celtiis' && result.payment_url) {
        // Celtiis : redirection externe, pas de polling
        window.open(result.payment_url, '_blank');
        showToast('Finalisez le paiement dans l\'onglet Fedapay ouvert', 'success');
        setProcessing(false);
        navigate('/historique');
      } else {
        // MTN / Moov : démarrer le polling Realtime sur payment_id
        setPollingPaymentId(result.payment_id);
        // setProcessing reste true jusqu'à la réponse du webhook ou timeout
      }
    } catch (err) {
      diagnoseAndShowError(err, 'Paiement FedaPay');
      setProcessing(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--imx-bg-app)] text-[var(--imx-text-primary)] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentRentPeriod) {
    return (
      <div className="min-h-screen bg-[var(--imx-bg-app)] text-[var(--imx-text-primary)] p-6 flex flex-col">
        <div className="mb-6">
          <BackButton />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--imx-text-secondary)]">Aucune période de loyer active pour ce logement</p>
        </div>
      </div>
    );
  }

  const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;

  return (
    <div className="min-h-screen bg-[var(--imx-bg-app)] text-[var(--imx-text-primary)] flex flex-col p-6">
      <div className="mb-5">
        <BackButton />
      </div>
      <h1 className="font-nunito font-900 text-[22px] text-[var(--imx-text-primary)] mb-1">Effectuer un versement</h1>
      {propertyName ? (
        <p className="text-[var(--imx-text-secondary)] text-[12px] mb-8" style={{ fontFamily: 'Space Grotesk' }}>
          Pour : {propertyName}
        </p>
      ) : (
        <div className="mb-8" />
      )}

      <div className="flex-1 flex flex-col">
        <div
          className="mb-6 flex flex-col items-center rounded-3xl py-8 px-4 shadow-sm"
          style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}
        >
          <p className="text-[var(--imx-text-secondary)] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            MONTANT À VERSER
          </p>
          <div className="flex items-baseline justify-center gap-2 mb-2">
            <span className="text-[var(--imx-accent-light)] font-nunito font-900 text-xl">FCFA</span>
            <input
              inputMode="numeric"
              type="text"
              value={amount ? new Intl.NumberFormat('fr-FR').format(amount) : ''}
              onChange={(e) => {
                // Extraire uniquement les chiffres
                const raw = e.target.value.replace(/\D/g, '');
                const val = parseInt(raw) || 0;
                setUserHasInteracted(true);
                setAmount(Math.min(val, remaining));
              }}
              placeholder="0"
              disabled={processing}
              className={`font-nunito font-900 leading-none text-[var(--imx-text-primary)] bg-transparent border-b-2 border-[var(--imx-accent-light)] focus:border-[#FBBF24] text-center w-full max-w-[220px] outline-none transition-colors disabled:opacity-50 ${
                amount >= 1000000 ? 'text-[2rem]' : amount >= 100000 ? 'text-[2.5rem]' : 'text-[3rem]'
              }`}
            />
          </div>
          {/* Solde restant — mis à jour dynamiquement SEULEMENT après interaction */}
          {!userHasInteracted ? (
            <p className="text-[var(--imx-text-muted)] text-[13px] font-space-grotesk">
              Solde restant : <strong className="text-[var(--imx-text-primary)]">{new Intl.NumberFormat('fr-FR').format(remaining)} FCFA</strong>
            </p>
          ) : amount > 0 && amount === remaining ? (
            <p className="text-[#22C55E] text-[13px] font-space-grotesk font-bold flex items-center justify-center gap-1">
              ✨ Ce versement soldera l'intégralité de votre loyer (0 FCFA restant)
            </p>
          ) : amount > remaining ? (
            <p className="text-red-400 text-[13px] font-space-grotesk font-bold">
              ⚠️ Montant supérieur au solde dû ({new Intl.NumberFormat('fr-FR').format(remaining)} FCFA max)
            </p>
          ) : amount > 300000 ? (
            <p className="text-red-400 text-[13px] font-space-grotesk font-bold text-center mt-2 max-w-[280px]">
              ⚠️ Le plafond maximal par transaction est de 300 000 FCFA. Pour régler un montant supérieur, veuillez effectuer votre versement en plusieurs fois.
            </p>
          ) : (
            <p className="text-[var(--imx-text-muted)] text-[13px] font-space-grotesk">
              {amount > 0
                ? <>À régler après versement : <strong className="text-[var(--imx-text-primary)]">{new Intl.NumberFormat('fr-FR').format(remaining - amount)} FCFA</strong></>
                : <>Solde restant : <strong>{new Intl.NumberFormat('fr-FR').format(remaining)} FCFA</strong></>}
            </p>
          )}
        </div>

        <div className="mb-8">
          <div className="grid grid-cols-4 gap-2">
            {[500, 5000, 10000].map((val) => (
              <button
                key={val}
                onClick={() => handleQuickAmount(val)}
                disabled={processing}
                className={`py-4 px-1 rounded-2xl font-space-grotesk font-600 text-[11px] sm:text-[13px] transition-all disabled:opacity-50 ${
                  amount === val
                    ? 'text-white border border-transparent'
                    : 'bg-transparent text-[var(--imx-text-secondary)] border border-[var(--imx-border)] hover:border-[var(--imx-accent-light)]'
                }`}
                style={amount === val ? { background: 'var(--imx-accent)' } : undefined}
              >
                {new Intl.NumberFormat('fr-FR').format(val)}
              </button>
            ))}
            <button
              onClick={() => handleQuickAmount('all')}
              disabled={processing}
              className={`py-4 px-1 rounded-2xl font-space-grotesk font-600 text-[11px] sm:text-[13px] transition-all disabled:opacity-50 ${
                amount === remaining
                  ? 'text-white border border-transparent'
                  : 'bg-transparent text-[var(--imx-text-secondary)] border border-[var(--imx-border)] hover:border-[var(--imx-accent-light)]'
              }`}
              style={amount === remaining ? { background: 'var(--imx-accent)' } : undefined}
            >
              Tout
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[var(--imx-text-muted)] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-4">
            OPÉRATEUR
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['mtn', 'moov', 'celtiis'] as Operator[]).map((op) => {
              const opDot: Record<Operator, string> = {
                mtn: '#FBBF24',
                moov: '#3B82F6',
                celtiis: '#10B981',
              };
              const isSelected = selectedOperator === op;
              return (
                <button
                  key={op}
                  onClick={() => { haptics.light(); setSelectedOperator(op); }}
                  disabled={processing}
                  className="py-4 rounded-2xl flex flex-col items-center justify-center gap-2 font-space-grotesk font-700 text-[13px] transition-all disabled:opacity-50 hover:shadow-sm"
                  style={{
                    background: isSelected ? 'var(--imx-surface)' : 'var(--imx-surface-2)',
                    color: isSelected ? 'var(--imx-text-primary)' : 'var(--imx-text-secondary)',
                    border: isSelected ? '1.5px solid var(--imx-accent)' : '1.5px solid var(--imx-border)',
                    boxShadow: isSelected ? '0 4px 12px rgba(123, 63, 228, 0.15)' : 'none'
                  }}
                >
                  <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: opDot[op] }} />
                  {op === 'mtn' ? 'MTN' : op === 'moov' ? 'Moov' : 'Celtiis'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-[var(--imx-text-muted)] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-4">
            NUMÉRO MOBILE MONEY
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={processing}
            className="w-full bg-[var(--imx-surface-2)] text-[var(--imx-text-primary)] font-nunito font-800 text-[15px] py-4 px-5 rounded-2xl outline-none border border-[var(--imx-border)] focus:border-[var(--imx-accent-light)] transition-all"
            placeholder="Ex: 90 00 00 00"
          />
        </div>

        <div className="mt-auto">
          <div className="rounded-3xl p-5 mb-6" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[var(--imx-text-muted)] font-space-grotesk font-500 text-[12px]">Versement</span>
              <span className="text-[var(--imx-text-primary)] font-nunito font-700 text-[14px]">{new Intl.NumberFormat('fr-FR').format(amount)} FCFA</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-muted)] font-space-grotesk font-500 text-[12px]">Frais</span>
              <span className="text-[#5FD9A4] font-space-grotesk font-600 text-[12px]">Gratuit</span>
            </div>
            <div className="h-[1px] bg-[var(--imx-border)] w-full my-3.5"></div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-secondary)] font-space-grotesk font-600 text-[13px]">Solde après versement</span>
              <span className={`font-nunito font-900 text-[16px] ${remaining - amount === 0 ? 'text-[#5FD9A4]' : 'text-[var(--imx-accent-light)]'}`}>
                {new Intl.NumberFormat('fr-FR').format(Math.max(remaining - amount, 0))} FCFA
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-[#EF4444] bg-opacity-10 border border-[#EF4444] text-[#EF4444] p-4 rounded-2xl mb-4 text-sm text-center">
              {error}
            </div>
          )}

          <button
            onClick={() => { haptics.medium(); handlePay(); }}
            disabled={processing || amount < 100 || amount > remaining || amount > 2500000 || !selectedOperator}
            className="w-full text-white font-nunito font-900 text-[17px] rounded-3xl py-5 flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--imx-accent-light)' }}
          >
            {processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                {pollingPaymentId
                  ? 'En attente de confirmation...'
                  : 'Traitement en cours...'}
              </>
            ) : (
              <>
                Payer via Fedapay →
              </>
            )}
          </button>
          {pollingPaymentId && (
            <p className="text-[var(--imx-text-secondary)] text-[11px] font-space-grotesk text-center mt-3 animate-pulse">
              📲 Vérifiez votre téléphone et entrez votre code PIN Mobile Money
            </p>
          )}
        </div>
      </div>
    </div>
  );
}