import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, RentPeriod, Operator } from '../../lib/supabase';
import { initiatePayment } from '../../lib/fedapay';
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
  }, [profile?.id, leaseId]);

  const handleQuickAmount = (value: number | 'all') => {
    if (!currentRentPeriod) return;
    const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;
    if (value === 'all') {
      setAmount(remaining);
    } else {
      setAmount(Math.min(value, remaining));
    }
  };

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

    const cleanedPhone = phoneNumber.replace(/\s/g, '');
    if (!cleanedPhone || cleanedPhone.length < 8) {
      setError('Veuillez saisir un numéro Mobile Money valide');
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
        phone_number: cleanedPhone,
      });

      if (selectedOperator === 'celtiis' && result.payment_url) {
        window.open(result.payment_url, '_blank');
        showToast('Finalisez le paiement dans l\'onglet Fedapay ouvert', 'success');
      } else {
        showToast('Versement initié, confirmez sur votre téléphone', 'success');
      }

      navigate('/historique');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du traitement du paiement';
      setError(message);
      showToast(message, 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#7B3FE4] border-t-transparent rounded-full animate-spin"></div>
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

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col p-6">
      <div className="flex items-center gap-4 mb-2">
        <BackButton />
        <h1 className="font-nunito font-900 text-[22px] text-white">Effectuer un versement</h1>
      </div>
      {propertyName && (
        <p className="text-[#8B7BB5] text-[12px] ml-[60px] mb-8" style={{ fontFamily: 'Space Grotesk' }}>
          Pour : {propertyName}
        </p>
      )}

      <div className="flex-1 flex flex-col">
        <div className="mb-10 flex flex-col items-center">
          <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            MONTANT À VERSER
          </p>
          <div className="flex items-baseline justify-center gap-2 mb-2">
            <span className="text-[#A855F7] font-nunito font-900 text-xl">FCFA</span>
            <input
              inputMode="numeric"
              type="text"
              value={amount ? new Intl.NumberFormat('fr-FR').format(amount) : ''}
              onChange={(e) => {
                // Extraire uniquement les chiffres
                const raw = e.target.value.replace(/\D/g, '');
                const val = parseInt(raw) || 0;
                setAmount(Math.min(val, remaining));
              }}
              placeholder="0"
              disabled={processing}
              className={`font-nunito font-900 leading-none text-white bg-transparent border-b-2 border-[#A855F7] focus:border-[#FBBF24] text-center w-full max-w-[220px] outline-none transition-colors disabled:opacity-50 ${
                amount >= 1000000 ? 'text-[2rem]' : amount >= 100000 ? 'text-[2.5rem]' : 'text-[3rem]'
              }`}
            />
          </div>
          {/* Solde restant — mis à jour dynamiquement à chaque frappe */}
          {amount > 0 && amount === remaining ? (
            <p className="text-[#22C55E] text-[13px] font-space-grotesk font-bold flex items-center justify-center gap-1">
              ✨ Ce versement soldera l'intégralité de votre loyer (0 FCFA restant)
            </p>
          ) : amount > remaining ? (
            <p className="text-red-400 text-[13px] font-space-grotesk font-bold">
              ⚠️ Montant supérieur au solde dû ({new Intl.NumberFormat('fr-FR').format(remaining)} FCFA max)
            </p>
          ) : (
            <p className="text-[#645A8A] text-[13px] font-space-grotesk">
              {amount > 0
                ? <>À régler après versement : <strong className="text-white">{new Intl.NumberFormat('fr-FR').format(remaining - amount)} FCFA</strong></>
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
                    ? 'bg-transparent text-[#A855F7] border border-[#A855F7]'
                    : 'bg-[#181135] text-[#8B7BB5] border border-transparent hover:bg-[#1E1545]'
                }`}
              >
                {new Intl.NumberFormat('fr-FR').format(val)}
              </button>
            ))}
            <button
              onClick={() => handleQuickAmount('all')}
              disabled={processing}
              className={`py-4 px-1 rounded-2xl font-space-grotesk font-600 text-[11px] sm:text-[13px] transition-all disabled:opacity-50 ${
                amount === remaining
                  ? 'bg-transparent text-[#A855F7] border border-[#A855F7]'
                  : 'bg-[#181135] text-[#8B7BB5] border border-transparent hover:bg-[#1E1545]'
              }`}
            >
              Tout
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[#645A8A] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-4">
            OPÉRATEUR
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['mtn', 'moov', 'celtiis'] as Operator[]).map((op) => {
              const opColors: Record<Operator, { bg: string; text: string }> = {
                mtn: { bg: '#FBBF24', text: '#412402' },
                moov: { bg: '#3B82F6', text: '#042C53' },
                celtiis: { bg: '#10B981', text: '#04342C' },
              };
              const isSelected = selectedOperator === op;
              return (
                <button
                  key={op}
                  onClick={() => { haptics.light(); setSelectedOperator(op); }}
                  disabled={processing}
                  className="py-6 rounded-[24px] flex items-center justify-center font-nunito font-800 text-[14px] transition-all"
                  style={{
                    backgroundColor: opColors[op].bg,
                    color: opColors[op].text,
                    boxShadow: isSelected ? '0 0 0 2px #A855F7, 0 0 0 5px rgba(168,85,247,0.25)' : 'none',
                    opacity: processing && !isSelected ? 0.6 : 1,
                  }}
                >
                  {op === 'mtn' ? 'MTN' : op === 'moov' ? 'Moov' : 'Celtiis'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-[#645A8A] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-4">
            NUMÉRO MOBILE MONEY
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={processing}
            className="w-full bg-[#181135] text-white font-nunito font-800 text-[15px] py-4 px-5 rounded-2xl outline-none border border-transparent focus:border-[#A855F7] transition-all"
            placeholder="Ex: 90 00 00 00"
          />
        </div>

        <div className="mt-auto">
          <div className="bg-[#181135] rounded-3xl p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[#645A8A] font-space-grotesk font-600 text-[13px]">Versement</span>
              <span className="text-white font-nunito font-900 text-[15px]">{new Intl.NumberFormat('fr-FR').format(amount)} FCFA</span>
            </div>
            <div className="flex justify-between items-center mb-4">
              <span className="text-[#645A8A] font-space-grotesk font-600 text-[13px]">Frais de transaction</span>
              <span className="text-[#22C55E] font-nunito font-900 text-[15px]">0 FCFA (Gratuit)</span>
            </div>
            <div className="h-[1px] bg-[rgba(255,255,255,0.05)] w-full my-4"></div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[#645A8A] font-space-grotesk font-600 text-[13px]">Total débité</span>
              <span className="text-[#A855F7] font-nunito font-900 text-[15px]">{new Intl.NumberFormat('fr-FR').format(amount)} FCFA</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#645A8A] font-space-grotesk font-600 text-[13px]">Solde après versement</span>
              <span className={`font-nunito font-900 text-[15px] ${remaining - amount === 0 ? 'text-[#22C55E]' : 'text-white'}`}>
                {new Intl.NumberFormat('fr-FR').format(Math.max(remaining - amount, 0))} FCFA
                {remaining - amount === 0 && ' ✓'}
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
            disabled={processing || amount < 100 || amount > remaining || !selectedOperator}
            className="w-full text-white font-nunito font-900 text-[17px] rounded-3xl py-5 flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: '#A855F7' }}
          >
            {processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Traitement en cours...
              </>
            ) : (
              <>
                Payer via Fedapay →
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}