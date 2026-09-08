import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, AlertTriangle, Smartphone } from 'lucide-react';

import { useAuth } from '../../hooks/useAuth';
import { supabase, RentPeriod, Operator } from '../../lib/supabase';
import { initiatePayment, normalizeBjPhone } from '../../lib/fedapay';
import { diagnoseAndShowError, showPaymentStatusError, showUssdTimeoutError } from '../../utils/errorDiagnostics';
import { useToast } from '../../components/Toast';
import { BackButton } from '../../components/BackButton';
import { PaymentSuccessModal } from '../../components/locataire/PaymentSuccessModal';
import { haptics } from '../../lib/haptics';

export default function Payer() {
  const navigate = useNavigate();
  const { leaseId } = useParams<{ leaseId: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [currentRentPeriod, setCurrentRentPeriod] = useState<RentPeriod | null>(null);
  const [propertyName, setPropertyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [amount, setAmount] = useState(0);
  const [userHasInteracted, setUserHasInteracted] = useState(false); // true dès qu'il tape ou clique un quick amount
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  // Données pour l'écran de succès de paiement
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successPaymentData, setSuccessPaymentData] = useState<{
    amount: number;
    recipientName: string;
    propertyName?: string;
    transactionId?: string;
    date?: string;
  } | null>(null);


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
          .select('id, tenant_id, status, properties:property_id(name, owner_id)')
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

        const prop = (leaseData as any).properties;
        setPropertyName(prop?.name || '');

        if (prop?.owner_id) {
          const { data: ownerData } = await supabase
            .from('users')
            .select('full_name')
            .eq('id', prop.owner_id)
            .maybeSingle();
          if (ownerData?.full_name) {
            setOwnerName(ownerData.full_name);
          }
        }

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
            setSuccessPaymentData({
              amount: updated.amount || amount,
              recipientName: ownerName || 'Propriétaire',
              propertyName: propertyName,
              transactionId: updated.fedapay_transaction_id || updated.id,
              date: updated.created_at || new Date().toISOString(),
            });
            setShowSuccessModal(true);
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
    <div
      className="min-h-screen bg-[var(--imx-bg-app)] text-[var(--imx-text-primary)] flex flex-col"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
    >
      <div
        className="px-6 flex-1 flex flex-col"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}
      >
        <div className="mb-5">
          <BackButton />
        </div>
        <h1 className="font-nunito font-900 text-[22px] text-[var(--imx-text-primary)] mb-1">Effectuer un versement</h1>
        {propertyName ? (
          <p className="text-[var(--imx-text-secondary)] text-[12px] mb-7" style={{ fontFamily: 'Space Grotesk' }}>
            Pour : {propertyName}
          </p>
        ) : (
          <div className="mb-7" />
        )}

        <div className="flex-1 flex flex-col">
          <div
            className="mb-6 flex flex-col items-center rounded-3xl py-8 px-4 shadow-sm relative overflow-hidden"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: 'var(--imx-card-shadow-sm)' }}
          >
            <div
              className="absolute inset-x-0 top-0 h-[3px]"
              style={{ background: 'linear-gradient(90deg, var(--imx-accent) 0%, var(--imx-accent-light) 100%)' }}
            />
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[var(--imx-text-muted)] text-[10px] font-space-grotesk font-bold uppercase tracking-widest">
                MONTANT DU VERSEMENT
              </span>
            </div>

            <div className="flex items-center justify-center gap-2 mb-3 w-full px-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold font-nunito bg-[var(--imx-surface-2)] text-[var(--imx-accent-light)] border border-[var(--imx-border)] flex-shrink-0">
                FCFA
              </span>
              {(() => {
                const displayValue = amount ? new Intl.NumberFormat('fr-FR').format(amount) : '';
                return (
                  <input
                    inputMode="numeric"
                    type="text"
                    value={displayValue}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      const val = parseInt(raw) || 0;
                      setUserHasInteracted(true);
                      setAmount(Math.min(val, remaining));
                    }}
                    placeholder="0"
                    disabled={processing}
                    // Largeur explicite en `ch` calée sur le nombre de caractères affichés :
                    // un <input> sans attribut `size` ni classe `w-*` prend une largeur par
                    // défaut du navigateur (~20 caractères), bien plus large que "500" par
                    // exemple, ce qui poussait toute la ligne centrée hors du cadre et coupait
                    // le badge FCFA à gauche. On la borne aussi à 100% pour ne jamais déborder
                    // sur les très grands montants (7 chiffres).
                    style={{ width: `${Math.min(Math.max(displayValue.length, 1) + 0.5, 10)}ch`, maxWidth: '100%' }}
                    className={`font-nunito font-black leading-none text-[var(--imx-text-primary)] bg-transparent text-center outline-none transition-colors disabled:opacity-50 tabular-nums min-w-0 ${
                      amount >= 1000000 ? 'text-[2rem]' : amount >= 100000 ? 'text-[2.4rem]' : 'text-[2.8rem]'
                    }`}
                  />
                );
              })()}
            </div>

          {/* Solde restant */}
          {!userHasInteracted ? (
            <p className="text-[var(--imx-text-muted)] text-[12px] font-space-grotesk">
              Solde restant : <strong className="text-[var(--imx-text-primary)]">{new Intl.NumberFormat('fr-FR').format(remaining)} FCFA</strong>
            </p>
          ) : amount > 0 && amount === remaining ? (
            <p className="text-[#22C55E] text-[12px] font-space-grotesk font-bold flex items-center justify-center gap-1">
              <Sparkles size={12} /> Ce versement soldera l'intégralité de votre loyer
            </p>
          ) : amount > remaining ? (
            <p className="text-red-500 text-[12px] font-space-grotesk font-bold flex items-center gap-1">
              <AlertTriangle size={12} /> Montant supérieur au solde dû ({new Intl.NumberFormat('fr-FR').format(remaining)} FCFA max)
            </p>
          ) : amount > 300000 ? (
            <p className="text-red-500 text-[12px] font-space-grotesk font-bold text-center mt-1 max-w-[280px] flex items-center justify-center gap-1">
              <AlertTriangle size={12} /> Plafond maximal de 300 000 FCFA par transaction.
            </p>
          ) : (
            <p className="text-[var(--imx-text-muted)] text-[12px] font-space-grotesk">
              {amount > 0
                ? <>À régler après versement : <strong className="text-[var(--imx-text-primary)]">{new Intl.NumberFormat('fr-FR').format(remaining - amount)} FCFA</strong></>
                : <>Solde restant : <strong>{new Intl.NumberFormat('fr-FR').format(remaining)} FCFA</strong></>}
            </p>
          )}
        </div>

        <div className="mb-6">
          <div className="grid grid-cols-4 gap-2">
            {[500, 5000, 10000].map((val) => (
              <button
                key={val}
                onClick={() => handleQuickAmount(val)}
                disabled={processing}
                className={`py-3.5 px-1 rounded-2xl font-space-grotesk font-bold text-[12px] transition-all disabled:opacity-50 active:scale-95 ${
                  amount === val
                    ? 'text-white shadow-sm'
                    : 'bg-[var(--imx-surface)] text-[var(--imx-text-secondary)] border border-[var(--imx-border)] hover:border-[var(--imx-accent-light)]'
                }`}
                style={amount === val ? { background: 'var(--imx-accent)' } : undefined}
              >
                {new Intl.NumberFormat('fr-FR').format(val)}
              </button>
            ))}
            <button
              onClick={() => handleQuickAmount('all')}
              disabled={processing}
              className={`py-3.5 px-1 rounded-2xl font-space-grotesk font-bold text-[12px] transition-all disabled:opacity-50 active:scale-95 ${
                amount === remaining
                  ? 'text-white shadow-sm'
                  : 'bg-[var(--imx-surface)] text-[var(--imx-text-secondary)] border border-[var(--imx-border)] hover:border-[var(--imx-accent-light)]'
              }`}
              style={amount === remaining ? { background: 'var(--imx-accent)' } : undefined}
            >
              Tout
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[var(--imx-text-muted)] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
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
                  className="py-3.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 font-space-grotesk font-bold text-[13px] transition-all disabled:opacity-50 active:scale-95"
                  style={{
                    background: isSelected ? 'var(--imx-surface)' : 'var(--imx-surface-2)',
                    color: isSelected ? 'var(--imx-text-primary)' : 'var(--imx-text-secondary)',
                    border: isSelected ? '2px solid var(--imx-accent)' : '1px solid var(--imx-border)',
                    boxShadow: isSelected ? 'var(--imx-card-shadow-sm)' : 'none'
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full shadow-xs" style={{ background: opDot[op] }} />
                  {op === 'mtn' ? 'MTN' : op === 'moov' ? 'Moov' : 'Celtiis'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[var(--imx-text-muted)] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            NUMÉRO MOBILE MONEY
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={processing}
            className="w-full bg-[var(--imx-surface)] text-[var(--imx-text-primary)] font-nunito font-bold text-[15px] py-4 px-5 rounded-2xl outline-none border border-[var(--imx-border)] focus:border-[var(--imx-accent)] transition-all"
            placeholder="Ex: 90 00 00 00"
          />
        </div>

        <div className="mt-auto">
          <div className="rounded-3xl p-5 mb-5" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: 'var(--imx-card-shadow-sm)' }}>
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[var(--imx-text-muted)] font-space-grotesk font-medium text-[12px]">Versement</span>
              <span className="text-[var(--imx-text-primary)] font-nunito font-bold text-[14px]">{new Intl.NumberFormat('fr-FR').format(amount)} FCFA</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-muted)] font-space-grotesk font-medium text-[12px]">Frais de transaction</span>
              <span className="text-[#10B981] font-space-grotesk font-bold text-[12px]">Gratuit</span>
            </div>
            <div className="h-[1px] bg-[var(--imx-border)] w-full my-3"></div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-secondary)] font-space-grotesk font-semibold text-[13px]">Solde après versement</span>
              <span className={`font-nunito font-900 text-[16px] ${remaining - amount === 0 ? 'text-[#10B981]' : 'text-[var(--imx-accent-light)]'}`}>
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
            className="w-full text-white font-nunito font-900 text-[16px] rounded-2xl py-4 flex items-center justify-center gap-2 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50 shadow-md"
            style={{ background: 'var(--imx-accent)' }}
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
            <p className="text-[var(--imx-text-secondary)] text-[11px] font-space-grotesk text-center mt-3 animate-pulse flex items-center justify-center gap-1.5">
              <Smartphone size={13} /> Vérifiez votre téléphone et entrez votre code PIN Mobile Money
            </p>
          )}
        </div>
      </div>

      {/* Modale Succès de paiement */}
      {successPaymentData && (
        <PaymentSuccessModal
          isOpen={showSuccessModal}
          onClose={() => {
            setShowSuccessModal(false);
            navigate('/dashboard');
          }}
          onViewReceipt={() => {
            setShowSuccessModal(false);
            navigate('/historique');
          }}
          amount={successPaymentData.amount}
          recipientName={successPaymentData.recipientName}
          propertyName={successPaymentData.propertyName}
          transactionId={successPaymentData.transactionId}
          date={successPaymentData.date}
        />
      )}
      </div>
    </div>
  );
}