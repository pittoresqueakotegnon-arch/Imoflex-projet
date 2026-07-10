import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../hooks/useWallet';
import { requestWithdrawal } from '../../lib/fedapay';
import { formatMontant } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { Operator } from '../../lib/supabase';
import { logAction } from '../../lib/audit';

const Retrait: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { wallet, ensureWallet } = useWallet(profile?.id);
  const { showToast } = useToast();

  const [amount, setAmount] = useState('30000');
  const [selectedOperator, setSelectedOperator] = useState<Operator>('mtn');
  const [phoneNumber, setPhoneNumber] = useState(profile?.mobile_money_number || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await ensureWallet();
      } catch (err) {
        console.error('Error ensuring wallet:', err);
        showToast('Erreur lors de l\'initialisation du wallet', 'error');
      }
    };
    init();
  }, [profile?.id, ensureWallet, showToast]);

  const validateForm = (): boolean => {
    setError(null);
    const parsedAmount = parseInt(amount);

    if (!amount || parsedAmount <= 0) {
      setError('Veuillez entrer un montant valide');
      return false;
    }

    if (!wallet) {
      setError('Wallet non trouvé');
      return false;
    }

    if (parsedAmount > wallet.available_balance) {
      setError(`Solde insuffisant. Disponible : ${formatMontant(wallet.available_balance)}`);
      return false;
    }

    if (!phoneNumber) {
      setError('Veuillez entrer un numéro de téléphone');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !wallet || !profile?.id) return;

    setLoading(true);
    try {
      await requestWithdrawal({
        wallet_id: wallet.id,
        amount: parseInt(amount),
        operator: selectedOperator,
        destination_phone: phoneNumber,
      });

      showToast('Retrait demandé avec succès !', 'success');

      logAction({
        userId: profile.id,
        action: 'retrait',
        entityType: 'withdrawals',
        details: {
          amount: parseInt(amount),
          operator: selectedOperator,
          phone: phoneNumber
        }
      });

      navigate('/pro/wallet');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la demande de retrait';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const availableBalance = wallet?.available_balance || 0;
  const parsedAmt = parseInt(amount) || 0;

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col px-5 pt-12 pb-8">
      {/* Header */}
      <button
        onClick={() => navigate('/pro/wallet')}
        className="flex items-center gap-1.5 text-[#A855F7] text-sm mb-8 w-fit"
        style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Retirer des fonds
      </button>

      <div className="flex-1 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Amount Display */}
          <div className="text-center">
            <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-2">MONTANT À RETIRER</p>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-[#A855F7] text-xl font-bold font-space-grotesk">FCFA</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-transparent border-none outline-none font-nunito font-950 text-4xl text-white text-center w-48"
                placeholder="0"
                style={{ caretColor: '#A855F7' }}
              />
            </div>
            <p className="text-[#8B7BB5] text-xs mt-2" style={{ fontFamily: 'Space Grotesk' }}>
              Solde disponible : {formatMontant(availableBalance)}
            </p>
          </div>

          {/* Operator Selection matching mockup exactly */}
          <div>
            <label className="block text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-3">
              OPÉRATEUR DE RÉCEPTION
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {([
                {
                  id: 'mtn',
                  title: 'MTN Money',
                  subtitle: 'Mobile Money',
                  color: '#F59E0B',
                  icon: (
                    <div className="w-10 h-10 bg-[#F59E0B] rounded-xl flex items-center justify-center font-nunito font-900 text-[10px] text-[#0D0720] shadow-sm">
                      MTN
                    </div>
                  )
                },
                {
                  id: 'moov',
                  title: 'Moov Money',
                  subtitle: 'Mobile Money',
                  color: '#0066CC',
                  icon: (
                    <div className="w-10 h-10 bg-[#0066CC] rounded-xl flex flex-col items-center justify-center text-[8px] text-white font-nunito font-900 leading-none shadow-sm">
                      <span>MOOV</span>
                      <span className="text-[6px] font-bold mt-0.5">MONEY</span>
                    </div>
                  )
                },
                {
                  id: 'celtiis',
                  title: 'Celtiis Cash',
                  subtitle: 'Mobile Money BJ',
                  color: '#8B5CF6',
                  icon: (
                    <div className="w-10 h-10 bg-[#8B5CF6] rounded-xl flex flex-col items-center justify-center text-[7px] text-white font-nunito font-bold leading-none shadow-sm p-0.5">
                      <div className="w-3 h-3 bg-white/20 rounded-full flex items-center justify-center text-[8px] font-black mb-0.5">c</div>
                      <span className="font-extrabold tracking-tighter">CELTIIS</span>
                    </div>
                  )
                }
              ] as const).map((op) => {
                const isSelected = selectedOperator === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedOperator(op.id)}
                    className="rounded-2xl border bg-[#1E1545] p-3 flex flex-col items-center text-center transition-all cursor-pointer min-h-[120px] justify-between"
                    style={{
                      borderColor: isSelected ? op.color : 'rgba(255, 255, 255, 0.08)',
                      boxShadow: isSelected ? `0 0 0 2.5px ${op.color}` : 'none',
                      background: isSelected ? `${op.color}12` : '#1E1545'
                    }}
                  >
                    {op.icon}

                    <div className="mt-2 flex flex-col items-center">
                      <span className="text-[10px] font-bold text-white leading-tight">
                        {op.title}
                      </span>
                      <span className="text-[8px] text-[#8B7BB5] font-space-grotesk mt-0.5 leading-none">
                        {op.subtitle}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phone Input */}
          <div>
            <label className="block text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-2">
              NUMÉRO DE RÉCEPTION
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              className="input-field"
              placeholder="+229 XX XX XX XX"
            />
          </div>

          {/* Recap Box */}
          <div className="card p-4 space-y-2 bg-[#1A1240]">
            <div className="flex justify-between text-xs font-space-grotesk text-[#8B7BB5]">
              <span>Montant demandé</span>
              <span className="text-white font-semibold">{formatMontant(parsedAmt)}</span>
            </div>
            <div className="h-px bg-[#261C55] my-1"></div>
            <div className="flex justify-between text-xs font-space-grotesk text-[#8B7BB5]">
              <span>Délai estimé</span>
              <span className="text-white font-semibold">3 jours ouvrés</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm font-space-grotesk">
              {error}
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || parsedAmt <= 0 || parsedAmt > availableBalance}
          className="btn-primary w-full mt-6"
        >
          {loading ? 'Traitement en cours...' : 'Confirmer le retrait'}
        </button>
      </div>
    </div>
  );
};

export default Retrait;
