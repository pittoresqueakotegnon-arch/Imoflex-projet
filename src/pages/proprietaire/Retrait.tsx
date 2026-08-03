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
      <div className="flex items-center gap-4 mb-10 w-full">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-2xl flex items-center justify-center transition"
          style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <h1 className="text-white font-nunito font-black text-[22px]">Retirer des fonds</h1>
      </div>

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
                disabled={loading}
                className="bg-transparent border-none outline-none font-nunito font-950 text-4xl text-white text-center w-48 disabled:opacity-50"
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
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: 'mtn', title: 'MTN', bg: '#FBBF24', text: '#412402' },
                { id: 'moov', title: 'Moov', bg: '#3B82F6', text: '#042C53' },
                { id: 'celtiis', title: 'Celtiis', bg: '#10B981', text: '#04342C' },
              ] as const).map((op) => {
                const isSelected = selectedOperator === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => !loading && setSelectedOperator(op.id)}
                    disabled={loading}
                    className="rounded-[24px] flex items-center justify-center transition-all cursor-pointer min-h-[80px] font-nunito font-800 text-[14px] disabled:opacity-50"
                    style={{
                      backgroundColor: op.bg,
                      color: op.text,
                      boxShadow: isSelected ? '0 0 0 2px #A855F7, 0 0 0 5px rgba(168,85,247,0.25)' : 'none',
                    }}
                  >
                    {op.title}
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
              disabled={loading}
              className="input-field disabled:opacity-50"
              placeholder="+229 XX XX XX XX"
            />
          </div>

          {/* Recap Box */}
          <div className="rounded-[20px] p-5 space-y-4" style={{ background: '#18113B' }}>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[#8B7BB5] font-medium">Montant demandé</span>
              <span className="text-white font-black font-nunito text-[14px]">{formatMontant(parsedAmt)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[#8B7BB5] font-medium">Frais de retrait</span>
              <span className="text-[#22C55E] font-black font-nunito text-[14px]">0 FCFA (Gratuit)</span>
            </div>
            <div className="h-[1px] bg-[rgba(255,255,255,0.05)] w-full"></div>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[#8B7BB5] font-medium">Total prélevé</span>
              <span className="text-[#A855F7] font-black font-nunito text-[14px]">{formatMontant(parsedAmt)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[#8B7BB5] font-medium">Délai estimé</span>
              <span className="text-white font-black font-nunito text-[14px]">3 jours ouvrés</span>
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
          className="btn-primary w-full mt-6 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Traitement en cours...
            </>
          ) : (
            'Confirmer le retrait'
          )}
        </button>
      </div>
    </div>
  );
};

export default Retrait;
