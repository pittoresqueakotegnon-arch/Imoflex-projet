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
      // Si le solde dépasse le plafond Fedapay (300 000 FCFA), on plafonne à 300 000
      setAmount(Math.min(remaining, 300000));
    } else {
      setAmount(Math.min(value, remaining));
    }
  };

  // Nouveau state pour le polling
  const [pollingPaymentId, setPollingPaymentId] = useState<string | null>(null);


  // Polling Realtime : écoute les changements de statut du paiement en DB
  useEffect(() => {
    if (!pollingPaymentId) return;

    let timeoutId: ReturnType<typeof setTimeout>;

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
    timeoutId = setTimeout(() => {
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
      <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentRentPeriod) {
    return (
      <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] p-6 flex flex-col">
        <div className="mb-6">
          <BackButton />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#8B7BB5]">Aucune période de loyer active pour ce logement</p>
        </div>
      </div>
    );
  }

  const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;
  const balanceAfter = Math.max(remaining - amount, 0);
  const isFullyPaid = amount > 0 && amount === remaining;

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col">
      {/* ── WRAPPER CENTRÉ RESPONSIVE ── */}
      <div className="w-full max-w-[600px] mx-auto flex flex-col flex-1">

        {/* ── HEADER ── */}
        <div className="px-5 pt-6 pb-4 flex items-start gap-3">
          <div className="flex-shrink-0 pt-0.5">
            <BackButton />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-nunito font-900 text-[18px] text-white leading-tight">Effectuer un versement</h1>
            {propertyName && (
              <p className="text-[#8B7BB5] text-[11px] font-space-grotesk mt-0.5 break-words">{propertyName}</p>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col px-5 pb-8 overflow-y-auto gap-5">

        {/* ── MONTANT PRINCIPAL ── */}
        <div className="bg-[#1A1240] rounded-2xl px-5 pt-5 pb-4 border border-white/5 overflow-hidden">
          <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            Montant à verser
          </p>
          <div className="flex items-baseline gap-3 mb-1">
            <span className="text-[#7B3FE4] font-nunito font-700 text-base flex-shrink-0">FCFA</span>
            <input
              inputMode="numeric"
              type="text"
              value={amount ? new Intl.NumberFormat('fr-FR').format(amount) : ''}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, '');
                const val = parseInt(raw) || 0;
                setUserHasInteracted(true);
                setAmount(Math.min(val, remaining));
              }}
              placeholder="0"
              disabled={processing}
              className={`font-nunito font-900 leading-none text-white bg-transparent border-b-2 border-[#7B3FE4] focus:border-[#A855F7] text-right min-w-0 w-full outline-none transition-colors disabled:opacity-50 ${
                amount >= 1000000 ? 'text-[1.8rem]' : amount >= 100000 ? 'text-[2.2rem]' : 'text-[2.8rem]'
              }`}
            />
          </div>

          {/* Feedback dynamique */}
          <div className="min-h-[20px] mt-2">
            {!userHasInteracted ? (
              <p className="text-[#645A8A] text-[11px] font-space-grotesk">
                Solde dû : <span className="text-white font-semibold">{new Intl.NumberFormat('fr-FR').format(remaining)} FCFA</span>
              </p>
            ) : isFullyPaid ? (
              <p className="text-[#22C55E] text-[11px] font-space-grotesk font-semibold flex items-center gap-1">
                <span>✨</span> Solde entièrement réglé après ce versement
              </p>
            ) : amount > remaining ? (
              <p className="text-red-400 text-[11px] font-space-grotesk font-semibold">
                ⚠️ Montant supérieur au solde ({new Intl.NumberFormat('fr-FR').format(remaining)} FCFA max)
              </p>
            ) : amount > 300000 ? (
              <p className="text-red-400 text-[11px] font-space-grotesk font-semibold">
                ⚠️ Plafond max 300 000 FCFA par transaction. Effectuez plusieurs versements.
              </p>
            ) : amount > 0 ? (
              <p className="text-[#645A8A] text-[11px] font-space-grotesk">
                Reste à régler : <span className="text-white font-semibold">{new Intl.NumberFormat('fr-FR').format(remaining - amount)} FCFA</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* ── BOUTONS MONTANTS RAPIDES ── */}
        <div className="grid grid-cols-4 gap-2">
          {([500, 5000, 10000] as const).map((val) => {
            const isActive = amount === val;
            return (
              <button
                key={val}
                onClick={() => { haptics.light(); handleQuickAmount(val); }}
                disabled={processing}
                className={`py-3 rounded-xl font-space-grotesk font-600 text-[12px] transition-all active:scale-95 disabled:opacity-40 ${
                  isActive
                    ? 'bg-[#7B3FE4]/20 text-[#A855F7] border border-[#7B3FE4]/60 shadow-sm'
                    : 'bg-[#1A1240] text-[#8B7BB5] border border-white/5 hover:bg-[#221650] hover:text-white'
                }`}
              >
                {new Intl.NumberFormat('fr-FR').format(val)}
              </button>
            );
          })}
          <button
            onClick={() => { haptics.light(); handleQuickAmount('all'); }}
            disabled={processing}
            className={`py-3 rounded-xl font-space-grotesk font-600 text-[12px] transition-all active:scale-95 disabled:opacity-40 ${
              amount === remaining && remaining > 0
                ? 'bg-[#7B3FE4]/20 text-[#A855F7] border border-[#7B3FE4]/60 shadow-sm'
                : 'bg-[#1A1240] text-[#8B7BB5] border border-white/5 hover:bg-[#221650] hover:text-white'
            }`}
          >
            Tout
          </button>
        </div>

        {/* ── SÉLECTEUR OPÉRATEUR ── */}
        <div>
          <label className="block text-[#645A8A] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            Opérateur Mobile Money
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {(['mtn', 'moov', 'celtiis'] as const).map((op) => {
              const opConfig = {
                mtn: { label: 'MTN', color: '#FBBF24', textDark: '#2D1A00' },
                moov: { label: 'Moov', color: '#3B82F6', textDark: '#001830' },
                celtiis: { label: 'Celtiis', color: '#10B981', textDark: '#002018' },
              };
              const cfg = opConfig[op];
              const isSelected = selectedOperator === op;
              return (
                <button
                  key={op}
                  onClick={() => { haptics.light(); setSelectedOperator(op); }}
                  disabled={processing}
                  className="py-4 rounded-xl font-nunito font-800 text-[13px] transition-all active:scale-95 disabled:opacity-40 relative overflow-hidden"
                  style={{
                    backgroundColor: isSelected ? cfg.color : 'rgba(255,255,255,0.04)',
                    color: isSelected ? cfg.textDark : '#8B7BB5',
                    border: isSelected ? `1.5px solid ${cfg.color}` : '1.5px solid rgba(255,255,255,0.06)',
                    boxShadow: isSelected ? `0 4px 16px ${cfg.color}33` : 'none',
                  }}
                >
                  {cfg.label}
                  {isSelected && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── NUMÉRO MOBILE MONEY ── */}
        <div>
          <label className="block text-[#645A8A] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-2.5">
            Numéro Mobile Money
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#645A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.82a19.79 19.79 0 01-3.07-8.65A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
              </svg>
            </div>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={processing}
              className="w-full bg-[#1A1240] text-white font-nunito font-700 text-[15px] py-3.5 pl-11 pr-5 rounded-xl outline-none border border-white/5 focus:border-[#7B3FE4] transition-all placeholder:text-[#3D3060] disabled:opacity-50"
              placeholder="Ex : 97 00 00 00"
            />
          </div>
        </div>

        {/* ── RÉCAPITULATIF ── */}
        <div className="bg-[#1A1240] rounded-2xl overflow-hidden border border-white/5">
          <div className="px-5 py-3.5 flex justify-between items-center">
            <span className="text-[#8B7BB5] text-[12px] font-space-grotesk">Versement</span>
            <span className="text-white font-nunito font-800 text-[14px]">
              {new Intl.NumberFormat('fr-FR').format(amount)} FCFA
            </span>
          </div>
          <div className="h-px bg-white/[0.04] mx-5" />
          <div className="px-5 py-3.5 flex justify-between items-center">
            <span className="text-[#8B7BB5] text-[12px] font-space-grotesk">Frais de transaction</span>
            <span className="text-[#22C55E] font-nunito font-800 text-[13px]">Gratuit</span>
          </div>
          <div className="h-px bg-white/[0.04] mx-5" />
          <div className="px-5 py-3.5 flex justify-between items-center">
            <span className="text-[#8B7BB5] text-[12px] font-space-grotesk">Total débité</span>
            <span className="text-[#A855F7] font-nunito font-900 text-[15px]">
              {new Intl.NumberFormat('fr-FR').format(amount)} FCFA
            </span>
          </div>
          <div className="h-px bg-[#7B3FE4]/20 mx-5" />
          <div className="px-5 py-3.5 flex justify-between items-center bg-white/[0.02]">
            <span className="text-[#8B7BB5] text-[12px] font-space-grotesk">Solde après versement</span>
            <span className={`font-nunito font-900 text-[15px] ${balanceAfter === 0 ? 'text-[#22C55E]' : 'text-white'}`}>
              {new Intl.NumberFormat('fr-FR').format(balanceAfter)} FCFA
              {balanceAfter === 0 && <span className="ml-1 text-[10px]">✓</span>}
            </span>
          </div>
        </div>

        {/* ── ERREUR ── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-[12px] font-space-grotesk text-center">
            {error}
          </div>
        )}

        {/* ── CTA PAYER ── */}
        <div>
          <button
            onClick={() => { haptics.medium(); handlePay(); }}
            disabled={processing || amount < 100 || amount > remaining || amount > 300000 || !selectedOperator}
            className="w-full text-white font-nunito font-900 text-[16px] rounded-2xl py-4 flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: processing || amount < 100 || amount > remaining || amount > 300000 || !selectedOperator
                ? 'rgba(123, 63, 228, 0.4)'
                : 'linear-gradient(135deg, #7B3FE4 0%, #A855F7 100%)',
              boxShadow: processing || amount < 100 ? 'none' : '0 4px 20px rgba(123, 63, 228, 0.35)',
            }}
          >
            {processing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{pollingPaymentId ? 'En attente de confirmation...' : 'Traitement...'}</span>
              </>
            ) : (
              <>
                <span>Payer via Fedapay</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>

          {pollingPaymentId && (
            <p className="text-[#8B7BB5] text-[11px] font-space-grotesk text-center mt-3 animate-pulse">
              📲 Vérifiez votre téléphone et entrez votre code PIN Mobile Money
            </p>
          )}
        </div>

        </div>
      </div>{/* end max-w wrapper */}
    </div>
  );
}