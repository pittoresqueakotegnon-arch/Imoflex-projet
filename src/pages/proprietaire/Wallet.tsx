import React, { useEffect } from 'react';
import { formatDateShort, formatMontant } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../hooks/useWallet';
import BottomNav from '../../components/BottomNav';
import WalletCard from '../../components/WalletCard';
import { useToast } from '../../components/Toast';
import { ArrowDownLeft, Clock, CheckCircle2, XCircle } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  complete: {
    label: 'Versé',
    color: '#22C55E',
    bg: 'rgba(34,197,94,0.10)',
    icon: <CheckCircle2 size={16} className="text-[#22C55E]" />,
  },
  en_traitement: {
    label: 'En cours',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.10)',
    icon: <Clock size={16} className="text-[#F59E0B]" />,
  },
  echoue: {
    label: 'Échoué',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.10)',
    icon: <XCircle size={16} className="text-[#EF4444]" />,
  },
};

const getStatusConfig = (status: string) =>
  STATUS_CONFIG[status] ?? STATUS_CONFIG['en_traitement'];


const OPERATOR_COLORS: Record<string, string> = {
  mtn: '#FBBF24',
  moov: '#3B82F6',
  celtiis: '#10B981',
};

const Wallet: React.FC = () => {
  const { profile } = useAuth();
  const { wallet, withdrawals, loading, ensureWallet } = useWallet(profile?.id);
  const { showToast } = useToast();

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

  if (loading) {
    return (
      <div className="page-container bg-[var(--imx-bg-app)]">
        <div className="px-5 space-y-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}>
          <div className="rounded-[28px] animate-pulse" style={{ height: 200, background: 'linear-gradient(135deg, #2D1B69 0%, #17132B 100%)' }} />
          <div className="space-y-3">
            <div className="h-4 bg-[var(--imx-text-secondary)]/20 rounded w-32" />
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-2xl bg-[var(--imx-surface-2)] animate-pulse" />
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const totalWithdrawn = withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  const completedCount = withdrawals.filter(w => w.status === 'complete').length;

  return (
    <div className="page-container bg-[var(--imx-bg-app)]">
      {/* Header */}
      <header
        className="sticky top-0 z-30 px-5 pb-3 bg-[var(--imx-bg-app)]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}
      >
        <h1 className="font-nunito font-black text-[22px] text-[var(--imx-text-primary)]">Mon Wallet</h1>
      </header>

      <div className="px-5 pb-32 space-y-6">
        {/* Hero card */}
        <WalletCard wallet={wallet} loading={loading} />

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[20px] p-4" style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}>
            <p className="text-[10px] font-space-grotesk font-bold uppercase tracking-wider text-[var(--imx-text-secondary)] mb-1.5">
              Total retiré
            </p>
            <p className="font-nunito font-black text-[18px] text-[var(--imx-text-primary)]">
              {formatMontant(totalWithdrawn)}
            </p>
          </div>
          <div className="rounded-[20px] p-4" style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}>
            <p className="text-[10px] font-space-grotesk font-bold uppercase tracking-wider text-[var(--imx-text-secondary)] mb-1.5">
              Retraits réussis
            </p>
            <p className="font-nunito font-black text-[18px] text-[var(--imx-text-primary)]">
              {completedCount} <span className="text-[13px] font-space-grotesk font-medium text-[var(--imx-text-secondary)]">/{withdrawals.length}</span>
            </p>
          </div>
        </div>

        {/* Withdrawal history */}
        <div>
          <h2 className="font-nunito font-black text-[18px] text-[var(--imx-text-primary)] mb-4">
            Historique
          </h2>

          {withdrawals.length === 0 ? (
            <div
              className="rounded-[20px] p-8 text-center"
              style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'var(--imx-surface)' }}>
                <ArrowDownLeft size={22} className="text-[var(--imx-text-secondary)]" />
              </div>
              <p className="font-nunito font-bold text-[15px] text-[var(--imx-text-primary)] mb-1">Aucun retrait</p>
              <p className="font-space-grotesk text-[12px] text-[var(--imx-text-secondary)]">
                Vos versements apparaîtront ici
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {withdrawals.map(withdrawal => {
                const opName = withdrawal.operator
                  ? withdrawal.operator.charAt(0).toUpperCase() + withdrawal.operator.slice(1).toLowerCase()
                  : 'Mobile Money';
                const opColor = OPERATOR_COLORS[withdrawal.operator?.toLowerCase()] || '#7B3FE4';
                const sc = getStatusConfig(withdrawal.status || 'pending');

                return (
                  <div
                    key={withdrawal.id}
                    className="flex items-center justify-between px-4 py-3.5 rounded-[18px]"
                    style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Operator dot icon */}
                      <div
                        className="w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0"
                        style={{ background: `${opColor}18`, border: `1.5px solid ${opColor}30` }}
                      >
                        <ArrowDownLeft size={18} style={{ color: opColor }} />
                      </div>

                      <div>
                        <p className="font-nunito font-bold text-[14px] text-[var(--imx-text-primary)] leading-tight">
                          {opName}
                        </p>
                        <p className="font-space-grotesk text-[11px] text-[var(--imx-text-secondary)] mt-0.5">
                          {formatDateShort(withdrawal.created_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <p
                        className="font-nunito font-black text-[15px]"
                        style={{ color: sc.color }}
                      >
                        -{new Intl.NumberFormat('fr-FR').format(withdrawal.amount)} F
                      </p>
                      <span
                        className="text-[9px] font-space-grotesk font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ color: sc.color, background: sc.bg }}
                      >
                        {sc.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Wallet;
