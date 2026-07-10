import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, RentPeriod, Operator } from '../../lib/supabase';
import { initiatePayment } from '../../lib/fedapay';
import { useToast } from '../../components/Toast';
import { formatMontant, operatorColor } from '../../lib/utils';
import { logAction } from '../../lib/audit';

export default function Payer() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [currentRentPeriod, setCurrentRentPeriod] = useState<RentPeriod | null>(null);
  const [paymentPlan, setPaymentPlan] = useState<string>('unique');
  const [amount, setAmount] = useState(0);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

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
          setPaymentPlan(leaseData.payment_plan_type || 'unique');
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
        phone_number: profile?.mobile_money_number || profile?.phone || '',
      });

      if (selectedOperator === 'celtiis' && result.payment_url) {
        window.open(result.payment_url, '_blank');
        showToast('Finalisez le paiement dans l\'onglet Fedapay ouvert', 'success');
      } else {
        showToast('Versement initié, confirmez sur votre téléphone', 'success');
      }

      if (profile) {
        logAction({
          userId: profile.id,
          action: 'paiement',
          entityType: 'rent_periods',
          entityId: currentRentPeriod.id,
          details: {
            amount,
            operator: selectedOperator,
            status: 'initie'
          }
        });
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
        <div className="w-8 h-8 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin"></div>
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
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col px-5 pt-12 pb-8">
      {/* Header */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[#A855F7] text-sm mb-8 w-fit"
        style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Effectuer un versement
      </button>

      <div className="flex-1">
        {/* Amount Display */}
        <div className="mb-6 text-center">
          <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-2">MONTANT À VERSER</p>
          <p className="font-nunito font-950 text-4xl amount text-white mb-1.5">
            <span className="text-[#A855F7] text-xl font-bold mr-1">FCFA</span> {amount.toLocaleString('fr-FR')}
          </p>
          <p className="text-[#8B7BB5] text-xs" style={{ fontFamily: 'Space Grotesk' }}>
            Solde restant : {formatMontant(remaining)}
          </p>
        </div>

        {/* Quick Amount Pills */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider">
              VERSEMENT RAPIDE
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[500, 5000, 10000].map((val) => (
              <button
                key={val}
                onClick={() => handleQuickAmount(val)}
                className={`py-3 px-1 rounded-xl font-nunito font-semibold text-sm transition-all border ${
                  amount === val
                    ? 'bg-[#1E1545] border-[#A855F7] text-[#A855F7]'
                    : 'bg-[#1A1240] border-transparent text-[#E8E0FF] hover:border-[rgba(168,85,247,0.5)]'
                }`}
              >
                {new Intl.NumberFormat('fr-FR').format(val)}
              </button>
            ))}
            <button
              onClick={() => handleQuickAmount('all')}
              className={`py-3 px-1 rounded-xl font-nunito font-semibold text-sm transition-all border ${
                amount === remaining
                  ? 'bg-[#1E1545] border-[#A855F7] text-[#A855F7]'
                  : 'bg-[#1A1240] border-transparent text-[#E8E0FF] hover:border-[rgba(168,85,247,0.5)]'
              }`}
            >
              Tout
            </button>
          </div>
        </div>

        {/* Custom Amount Input */}
        <div className="mb-6">
          <label className="block text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-2">
            MONTANT PERSONNALISÉ
          </label>
          <input
            type="number"
            value={amount || ''}
            onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={processing}
            className="input-field w-full text-center font-nunito font-bold text-lg py-3"
            placeholder="Entrer le montant en FCFA"
            min="500"
            max={remaining}
          />
        </div>

        {/* Operator Selection matching mockup exactly */}
        <div className="mb-6">
          <label className="block text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-3">
            OPÉRATEUR
          </label>
          <div className="grid grid-cols-3 gap-3">
            {([
              {
                id: 'mtn',
                title: 'MTN',
                color: '#F59E0B',
              },
              {
                id: 'moov',
                title: 'Moov',
                color: '#3B82F6',
              },
              {
                id: 'celtiis',
                title: 'Celtiis',
                color: '#F97316',
              }
            ] as const).map((op) => {
              const isSelected = selectedOperator === op.id;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setSelectedOperator(op.id)}
                  disabled={processing}
                  className="rounded-[20px] border p-4 flex flex-col items-center text-center transition-all cursor-pointer justify-center"
                  style={{
                    background: isSelected ? 'rgba(30, 21, 69, 0.8)' : 'transparent',
                    borderColor: isSelected ? '#A855F7' : 'rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div 
                    className="w-5 h-5 rounded-full mb-3 shadow-[0_0_10px_rgba(0,0,0,0.5)]" 
                    style={{ 
                      background: `linear-gradient(135deg, ${op.color} 0%, ${op.color}dd 100%)`,
                      boxShadow: `0 2px 8px ${op.color}66`
                    }}
                  />
                  <span className="text-xs font-bold text-white font-nunito">
                    {op.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Card */}
        <div className="card p-4 mb-6 space-y-2 bg-[#1A1240]">
          <div className="flex justify-between text-sm font-space-grotesk">
            <span className="text-white font-semibold">Total débité</span>
            <span className="text-[#A855F7] font-nunito font-900 amount">{amount.toLocaleString('fr-FR')} FCFA</span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-6 font-space-grotesk">
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
              Traitement USSD...
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
