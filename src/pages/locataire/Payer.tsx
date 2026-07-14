import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, RentPeriod, Operator } from '../../lib/supabase';
import { initiatePayment } from '../../lib/fedapay';
import { useToast } from '../../components/Toast';
import { formatMontant, operatorColor } from '../../lib/utils';

export default function Payer() {
  const navigate = useNavigate();
  const { leaseId } = useParams();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [currentRentPeriod, setCurrentRentPeriod] = useState<RentPeriod | null>(null);
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

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) return;

      try {
        // Fetch active lease
        const { data: leaseData, error: leaseError } = await supabase
          .from('leases')
          .select('*')
          .eq('id', leaseId)
          .eq('tenant_id', profile.id)
          .eq('status', 'actif')
          .maybeSingle();

        if (leaseError) throw leaseError;

        if (!leaseData) {
          navigate('/dashboard');
          return;
        }

        // Fetch current month rent period
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
      // Le locataire paie EXACTEMENT le montant qu'il choisit.
      // La commission de 5% est prélevée plus tard sur la part reversée
      // au propriétaire — elle n'est jamais ajoutée à ce que paie le locataire.
      const result = await initiatePayment({
        amount,
        operator: selectedOperator,
        rent_period_id: currentRentPeriod.id,
        phone_number: cleanedPhone,
      });

      if (selectedOperator === 'celtiis' && result.payment_url) {
        // Celtiis Cash n'a pas de push USSD direct chez Fedapay :
        // on ouvre la page de paiement sécurisée Fedapay dans un nouvel onglet.
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
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-[#1E1545] rounded-lg transition-colors w-fit"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#8B7BB5]">Aucune période de loyer active</p>
        </div>
      </div>
    );
  }

  const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-10">
        <button
          onClick={() => navigate(-1)}
          className="p-3 bg-[#1E1545] hover:bg-[#2A1E5C] rounded-2xl transition-colors"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>
        <h1 className="font-nunito font-900 text-[22px] text-white">Effectuer un versement</h1>
      </div>

      <div className="flex-1 flex flex-col">
        {/* Amount Display */}
        <div className="mb-10 flex flex-col items-center">
          <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            MONTANT À VERSER
          </p>
          <div className="flex items-baseline justify-center gap-2 mb-2">
            <span className="text-[#A855F7] font-nunito font-900 text-xl">FCFA</span>
            <span className="font-nunito font-900 text-[3.5rem] leading-none text-white">{new Intl.NumberFormat('fr-FR').format(amount)}</span>
          </div>
          <p className="text-[#645A8A] text-[13px] font-space-grotesk">
            Solde restant : {new Intl.NumberFormat('fr-FR').format(remaining)} FCFA
          </p>
        </div>

        {/* Quick Amount Pills */}
        <div className="mb-8">
          <div className="grid grid-cols-4 gap-2">
            {[500, 5000, 10000].map((val) => (
              <button
                key={val}
                onClick={() => handleQuickAmount(val)}
                className={`py-4 px-1 rounded-2xl font-space-grotesk font-600 text-[13px] transition-all ${
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
              className={`py-4 px-1 rounded-2xl font-space-grotesk font-600 text-[13px] transition-all ${
                amount === remaining
                  ? 'bg-transparent text-[#A855F7] border border-[#A855F7]'
                  : 'bg-[#181135] text-[#8B7BB5] border border-transparent hover:bg-[#1E1545]'
              }`}
            >
              Tout
            </button>
          </div>
        </div>

        {/* Operator Selection */}
        <div className="mb-6">
          <label className="block text-[#645A8A] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-4">
            OPÉRATEUR
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['mtn', 'moov', 'celtiis'] as const).map((op) => (
              <button
                key={op}
                onClick={() => setSelectedOperator(op)}
                disabled={processing}
                className={`py-6 rounded-[24px] flex flex-col items-center gap-4 font-nunito font-800 text-[13px] transition-all ${
                  selectedOperator === op
                    ? 'bg-transparent border border-[#A855F7] text-[#FBBF24]'
                    : 'bg-[#181135] border border-transparent text-[#645A8A] hover:bg-[#1E1545]'
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full"
                  style={{
                    backgroundColor: op === 'mtn' ? '#FBBF24' : op === 'moov' ? '#3B82F6' : '#F97316',
                    boxShadow: selectedOperator === op ? `0 0 15px ${op === 'mtn' ? 'rgba(251,191,36,0.6)' : op === 'moov' ? 'rgba(59,130,246,0.6)' : 'rgba(249,115,22,0.6)'}` : 'none'
                  }}
                ></div>
                <span>{op === 'mtn' ? 'MTN' : op === 'moov' ? 'Moov' : 'Celtiis'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Numéro Mobile Money */}
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
          {/* Summary Card */}
          <div className="bg-[#181135] rounded-3xl p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[#645A8A] font-space-grotesk font-600 text-[13px]">Versement</span>
              <span className="text-white font-nunito font-900 text-[15px]">{new Intl.NumberFormat('fr-FR').format(amount)} FCFA</span>
            </div>
            <div className="h-[1px] bg-[rgba(255,255,255,0.05)] w-full my-4"></div>
            <div className="flex justify-between items-center">
              <span className="text-[#645A8A] font-space-grotesk font-600 text-[13px]">Total débité</span>
              <span className="text-[#A855F7] font-nunito font-900 text-[15px]">{new Intl.NumberFormat('fr-FR').format(amount)} FCFA</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[#EF4444] bg-opacity-10 border border-[#EF4444] text-[#EF4444] p-4 rounded-2xl mb-4 text-sm text-center">
              {error}
            </div>
          )}

          {/* Pay Button */}
          <button
            onClick={handlePay}
            disabled={processing || amount < 100 || !selectedOperator}
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