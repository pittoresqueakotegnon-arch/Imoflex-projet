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
      <div className="flex items-center mb-8">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-[#1E1545] rounded-lg transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      </div>

      <h1 className="font-nunito font-900 text-3xl mb-2">Effectuer un versement</h1>
      <p className="text-[#8B7BB5] mb-8">Payez votre loyer via Fedapay</p>

      <div className="flex-1">
        {/* Amount Display */}
        <div className="mb-8">
          <p className="text-[#8B7BB5] text-xs font-space-grotesk font-600 mb-3">MONTANT À VERSER</p>
          <p className="font-nunito font-900 text-5xl amount text-[#A855F7] glow mb-2">
            {formatMontant(amount)}
          </p>
          <p className="text-[#8B7BB5] text-sm">
            Solde restant : {formatMontant(remaining)}
          </p>
        </div>

        {/* Quick Amount Pills */}
        <div className="mb-8">
          <div className="grid grid-cols-4 gap-2">
            {[500, 5000, 10000].map((val) => (
              <button
                key={val}
                onClick={() => handleQuickAmount(val)}
                className={`py-2 px-3 rounded-lg font-space-grotesk font-600 text-xs transition-all ${
                  amount === val
                    ? 'bg-[#7B3FE4] text-white'
                    : 'bg-[#261C55] text-[#E8E0FF] hover:bg-[#2A1E5C]'
                }`}
              >
                {val}
              </button>
            ))}
            <button
              onClick={() => handleQuickAmount('all')}
              className={`py-2 px-3 rounded-lg font-space-grotesk font-600 text-xs transition-all ${
                amount === remaining
                  ? 'bg-[#7B3FE4] text-white'
                  : 'bg-[#261C55] text-[#E8E0FF] hover:bg-[#2A1E5C]'
              }`}
            >
              Tout
            </button>
          </div>
        </div>

        {/* Custom Amount Input */}
        <div className="mb-8">
          <label className="block text-[#8B7BB5] text-xs font-space-grotesk font-600 mb-2">
            MONTANT PERSONNALISÉ
          </label>
          <input
            type="number"
            value={amount || ''}
            onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={processing}
            className="input-field w-full"
            placeholder="Entrer le montant en FCFA"
            min="100"
            max={remaining}
          />
        </div>

        {/* Operator Selection */}
        <div className="mb-8">
          <label className="block text-[#E8E0FF] font-space-grotesk font-500 mb-4">
            OPÉRATEUR
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['mtn', 'moov', 'celtiis'] as const).map((op) => (
              <button
                key={op}
                onClick={() => setSelectedOperator(op)}
                disabled={processing}
                className={`card py-3 flex flex-col items-center gap-2 font-space-grotesk font-600 transition-all ${
                  selectedOperator === op
                    ? 'ring-2'
                    : ''
                }`}
                style={{
                  backgroundColor: selectedOperator === op ? operatorColor(op) + '30' : '#261C55',
                  borderColor: operatorColor(op),
                  color: selectedOperator === op ? 'white' : '#E8E0FF',
                  ...(selectedOperator === op && { boxShadow: `0 0 0 2px ${operatorColor(op)}` }),
                }}
              >
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1.5">
                  <img src={`/assets/logo_${op}.png`} alt={op} className="w-full h-full object-contain" />
                </div>
                <span className="text-xs">{op === 'mtn' ? 'MTN' : op === 'moov' ? 'Moov' : 'Celtiis'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Numéro Mobile Money */}
        <div className="mb-8">
          <label className="block text-[#E8E0FF] font-space-grotesk font-500 mb-2">
            NUMÉRO MOBILE MONEY
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={processing}
            placeholder="Ex : 90 00 00 00"
            className="input-field w-full"
          />
          <p className="text-[#8B7BB5] text-xs mt-2">
            C'est ce numéro qui va recevoir la demande de confirmation. Modifiez-le si vous
            payez avec un autre numéro que celui de votre compte.
          </p>
        </div>

        {/* Summary Card */}
        <div className="card p-6 mb-8 bg-[#1E1545]">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[#8B7BB5]">Montant débité</span>
              <span className="font-nunito font-900 text-lg amount">{formatMontant(amount)}</span>
            </div>
            <p className="text-[#8B7BB5] text-xs pt-1">
              Vous payez exactement ce montant. La commission ImoFlex (5%) est prélevée sur la part reversée au propriétaire, elle ne s'ajoute jamais à votre versement.
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-[#EF4444] bg-opacity-10 border border-[#EF4444] text-[#EF4444] p-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Pay Button */}
        <button
          onClick={handlePay}
          disabled={processing || amount < 100 || !selectedOperator}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Traitement USSD en cours...
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