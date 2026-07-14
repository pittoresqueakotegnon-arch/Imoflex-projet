import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, RentPeriod, Operator } from '../../lib/supabase';
import { initiatePayment } from '../../lib/fedapay';
import { useToast } from '../../components/Toast';
import { formatMontant, operatorColor } from '../../lib/utils';

export default function Payer() {
  const navigate = useNavigate();
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
  }, [profile?.id]);

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
      setError('Veuillez configurer votre numéro Mobile Money dans votre profil');
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
      <div className="flex items-center mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-[#1E1545] rounded-lg transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      </div>

      <div className="flex-1">
        {/* Amount Display */}
        <div className="mb-10 flex flex-col items-center">
          <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            MONTANT À VERSER
          </p>
          <div className="flex items-baseline justify-center gap-2 mb-2">
            <span className="text-[#A855F7] font-nunito font-900 text-2xl">FCFA</span>
            <span className="font-nunito font-900 text-[3.5rem] leading-none text-white">{amount}</span>
          </div>
          <p className="text-[#8B7BB5] text-[13px] font-space-grotesk">
            Solde restant : {new Intl.NumberFormat('fr-FR').format(remaining)} FCFA
          </p>
        </div>

        {/* Quick Amount Pills */}
        <div className="mb-8">
          <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            VERSEMENT RAPIDE
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[500, 5000, 10000].map((val) => (
              <button
                key={val}
                onClick={() => handleQuickAmount(val)}
                className={`py-3.5 px-1 rounded-[14px] font-space-grotesk font-600 text-[13px] transition-all ${
                  amount === val
                    ? 'bg-transparent text-[#A855F7] border border-[#A855F7]'
                    : 'bg-[#181135] text-[#E8E0FF] border border-transparent'
                }`}
              >
                {val}
              </button>
            ))}
            <button
              onClick={() => handleQuickAmount('all')}
              className={`py-3.5 px-1 rounded-[14px] font-space-grotesk font-600 text-[13px] transition-all ${
                amount === remaining
                  ? 'bg-transparent text-[#A855F7] border border-[#A855F7]'
                  : 'bg-[#181135] text-[#E8E0FF] border border-transparent'
              }`}
            >
              Tout
            </button>
          </div>
        </div>

        {/* Custom Amount Input */}
        <div className="mb-8">
          <label className="block text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            MONTANT PERSONNALISÉ
          </label>
          <input
            type="number"
            value={amount || ''}
            onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={processing}
            className="w-full bg-[#181135] text-white text-center font-nunito font-900 text-xl py-4 rounded-2xl outline-none"
            placeholder="0"
            min="100"
            max={remaining}
          />
        </div>

        {/* Operator Selection */}
        <div className="mb-8">
          <label className="block text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-widest mb-3">
            OPÉRATEUR
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['mtn', 'moov', 'celtiis'] as const).map((op) => (
              <button
                key={op}
                onClick={() => setSelectedOperator(op)}
                disabled={processing}
                className={`py-5 rounded-3xl flex flex-col items-center gap-3 font-nunito font-800 text-[13px] transition-all ${
                  selectedOperator === op
                    ? 'bg-transparent border border-[#A855F7] text-white'
                    : 'bg-[#181135] border border-transparent text-[#E8E0FF]'
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{
                    backgroundColor: op === 'mtn' ? '#FBBF24' : op === 'moov' ? '#3B82F6' : '#F97316',
                    boxShadow: selectedOperator === op ? `0 0 12px ${op === 'mtn' ? 'rgba(251,191,36,0.5)' : op === 'moov' ? 'rgba(59,130,246,0.5)' : 'rgba(249,115,22,0.5)'}` : 'none'
                  }}
                ></div>
                <span>{op === 'mtn' ? 'MTN' : op === 'moov' ? 'Moov' : 'Celtiis'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary Card */}
        <div className="bg-[#181135] border border-[rgba(255,255,255,0.03)] rounded-2xl p-5 mb-4 flex justify-between items-center">
          <span className="text-white font-nunito font-800 text-[15px]">Total débité</span>
          <span className="text-[#A855F7] font-nunito font-900 text-[15px]">{new Intl.NumberFormat('fr-FR').format(amount)} FCFA</span>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-[#EF4444] bg-opacity-10 border border-[#EF4444] text-[#EF4444] p-3 rounded-xl mb-4 text-sm text-center">
            {error}
          </div>
        )}

        {/* Pay Button */}
        <button
          onClick={handlePay}
          disabled={processing || amount < 100 || !selectedOperator}
          className="w-full text-[#E8E0FF] font-nunito font-800 text-[15px] rounded-2xl py-[18px] flex items-center justify-center gap-2 opacity-90 hover:opacity-100 transition-opacity"
          style={{ background: '#4A3D7A' }}
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
  );
}