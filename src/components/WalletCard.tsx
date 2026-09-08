import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from '../lib/supabase';
import { formatMontant } from '../lib/utils';
import { Eye, EyeOff } from 'lucide-react';

interface WalletCardProps {
  wallet: Wallet | null;
  loading?: boolean;
}

export const WalletCard: React.FC<WalletCardProps> = ({ wallet, loading = false }) => {
  const [showBalance, setShowBalance] = useState(true);
  if (loading) {
    return (
      <div
        className="rounded-[24px] p-6 animate-pulse space-y-4"
        style={{ border: '1px solid var(--imx-border)', background: 'var(--imx-surface)' }}
      >
        <div className="h-3 bg-[var(--imx-text-muted)]/20 rounded w-28"></div>
        <div className="h-10 bg-[var(--imx-text-muted)]/20 rounded w-48"></div>
        <div className="h-3 bg-[var(--imx-text-muted)]/20 rounded w-64"></div>
        <div className="h-[52px] bg-[var(--imx-text-muted)]/20 rounded-2xl"></div>
        <div className="h-3 bg-[var(--imx-text-muted)]/20 rounded w-36 mx-auto"></div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div
        className="rounded-[24px] p-6 text-[var(--imx-text-secondary)]"
        style={{ border: '1px solid var(--imx-border)', background: 'var(--imx-surface)' }}
      >
        <p className="text-sm">Aucun wallet disponible</p>
      </div>
    );
  }

  return (
    <div
      className="encaisse-hero rounded-[24px] p-6 text-white relative shadow-lg"
      style={{
        border: '1px solid var(--imx-border)',
      }}
    >
      {/* Label */}
      <div className="flex items-center justify-between mb-2 relative z-10">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/80"
          style={{ fontFamily: 'Space Grotesk' }}
        >
          Solde disponible
        </p>
        <button 
          onClick={() => setShowBalance(!showBalance)}
          className="p-1 text-white/80 hover:text-white transition-colors"
        >
          {showBalance ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Amount */}
      <div className="mb-2 w-full flex items-baseline whitespace-nowrap relative z-10">
        <span
          className="font-nunito font-black leading-none text-white"
          style={{ letterSpacing: '-0.5px', fontSize: 'clamp(1.85rem, 8vw, 2.6rem)' }}
        >
          {showBalance ? formatMontant(wallet.available_balance || 0) : '••••••••'}
        </span>
      </div>

      {/* Caption */}
      <p
        className="text-[12px] leading-relaxed mb-6 text-white/80 relative z-10"
        style={{ fontFamily: 'Space Grotesk', maxWidth: '240px' }}
      >
        Cumul de tous vos logements, retrait libre à tout moment
      </p>

      {/* Withdrawal Button */}
      <Link
        to="/pro/retrait"
        className="w-full flex items-center justify-center font-bold text-[15px] text-white rounded-2xl relative z-10 transition-transform active:scale-[0.98] shadow-md hover:opacity-95"
        style={{
          height: '52px',
          background: 'var(--imx-accent)',
          fontFamily: 'Nunito, sans-serif',
        }}
      >
        Retirer vers Mobile Money
      </Link>

      {/* Security note */}
      <div
        className="flex items-center gap-1.5 mt-4 text-white/70 relative z-10"
        style={{ fontFamily: 'Space Grotesk', fontSize: '11px' }}
      >
        <span>🔒</span>
        <span>Sécurisé par Fedapay</span>
      </div>
    </div>
  );
};

export default WalletCard;
