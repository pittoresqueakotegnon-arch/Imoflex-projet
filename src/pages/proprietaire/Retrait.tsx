import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../hooks/useWallet';
import { requestWithdrawal } from '../../lib/fedapay';
import { formatMontant } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { BackButton } from '../../components/BackButton';
import { Operator } from '../../lib/supabase';
import { logAction } from '../../lib/audit';

const Retrait: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { wallet, ensureWallet } = useWallet(profile?.id);
  const { showToast } = useToast();

  const [amount, setAmount] = useState('');
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
    let cleanNumber = phoneNumber.replace(/\s+/g, '').replace(/^\+229/, '');
    if (cleanNumber.startsWith('229')) cleanNumber = cleanNumber.slice(3);
    if (cleanNumber.length === 8) cleanNumber = '01' + cleanNumber;

    if (cleanNumber.length >= 4 && cleanNumber.startsWith('01')) {
      const prefix = cleanNumber.substring(2, 4);
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
    <div className="min-h-screen bg-[var(--imx-bg-app)] text-[var(--imx-text-primary)] flex flex-col px-5 pt-6 pb-8">
      {/* Header */}
      <div className="mb-5">
        <BackButton />
      </div>
      <h1 className="text-[var(--imx-text-primary)] font-nunito font-black text-[22px] mb-8">Retirer des fonds</h1>

      <div className="flex-1 flex flex-col justify-between">
        <div className="space-y-6">
          {/* Amount Display */}
          <div
            className="text-center rounded-3xl py-8 px-4"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
          >
            <p className="text-[var(--imx-text-secondary)] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-2">MONTANT À RETIRER</p>
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="text-[var(--imx-accent-light)] text-xl font-bold font-space-grotesk">FCFA</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={loading}
                className="bg-transparent border-none outline-none font-nunito font-950 text-4xl text-[var(--imx-text-primary)] text-center w-48 disabled:opacity-50"
                placeholder="0"
                style={{ caretColor: 'var(--imx-accent-light)' }}
              />
            </div>
            <p className="text-[var(--imx-text-secondary)] text-xs mt-2" style={{ fontFamily: 'Space Grotesk' }}>
              Solde disponible : {formatMontant(availableBalance)}
            </p>
          </div>

          {/* Montants rapides — pourcentages du solde disponible */}
          {availableBalance > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {[0.25, 0.5, 0.75, 1].map((ratio) => {
                const quickValue = Math.floor(availableBalance * ratio);
                const isSelected = parsedAmt === quickValue && amount !== '';
                return (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAmount(String(quickValue))}
                    disabled={loading}
                    className={`py-4 px-1 rounded-2xl font-space-grotesk font-600 text-[11px] sm:text-[13px] transition-all disabled:opacity-50 ${
                      isSelected
                        ? 'text-white border border-transparent'
                        : 'bg-transparent text-[var(--imx-text-secondary)] border border-[var(--imx-border)] hover:border-[var(--imx-accent-light)]'
                    }`}
                    style={isSelected ? { background: 'var(--imx-accent)' } : undefined}
                  >
                    {ratio === 1 ? 'Tout' : `${ratio * 100}%`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Operator Selection matching mockup exactly */}
          <div>
            <label className="block text-[var(--imx-text-secondary)] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-3">
              OPÉRATEUR DE RÉCEPTION
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { id: 'mtn', title: 'MTN', dot: '#FBBF24' },
                { id: 'moov', title: 'Moov', dot: '#3B82F6' },
                { id: 'celtiis', title: 'Celtiis', dot: '#10B981' },
              ] as const).map((op) => {
                const isSelected = selectedOperator === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => !loading && setSelectedOperator(op.id)}
                    disabled={loading}
                    className="rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer py-4 font-space-grotesk font-700 text-[13px] disabled:opacity-50"
                    style={{
                      background: 'var(--imx-surface)',
                      color: isSelected ? 'var(--imx-text-primary)' : 'var(--imx-text-secondary)',
                      border: isSelected ? '1.5px solid var(--imx-accent)' : '1.5px solid transparent',
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: op.dot }} />
                    {op.title}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phone Input */}
          <div>
            <label className="block text-[var(--imx-text-secondary)] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-2">
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
          <div className="rounded-[20px] p-5 space-y-4" style={{ background: 'var(--imx-surface-2)' }}>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[var(--imx-text-secondary)] font-medium">Montant demandé</span>
              <span className="text-[var(--imx-text-primary)] font-black font-nunito text-[14px]">{formatMontant(parsedAmt)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[var(--imx-text-secondary)] font-medium">Frais de retrait</span>
              <span className="text-[#22C55E] font-black font-nunito text-[14px]">0 FCFA (Gratuit)</span>
            </div>
            <div className="h-[1px] bg-[var(--imx-border)] w-full"></div>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[var(--imx-text-secondary)] font-medium">Total prélevé</span>
              <span className="text-[var(--imx-accent-light)] font-black font-nunito text-[14px]">{formatMontant(parsedAmt)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] font-space-grotesk">
              <span className="text-[var(--imx-text-secondary)] font-medium">Délai estimé</span>
              <span className="text-[var(--imx-text-primary)] font-black font-nunito text-[14px]">3 jours ouvrés</span>
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
