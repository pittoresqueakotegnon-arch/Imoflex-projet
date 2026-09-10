import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from '../lib/supabase';
import { formatMontant } from '../lib/utils';
import { Eye, EyeOff, ArrowUpRight, ShieldCheck } from 'lucide-react';

interface WalletCardProps {
  wallet: Wallet | null;
  loading?: boolean;
}

export const WalletCard: React.FC<WalletCardProps> = ({ wallet, loading = false }) => {
  const [showBalance, setShowBalance] = useState(true);

  if (loading) {
    return (
      <div className="rounded-[28px] overflow-hidden animate-pulse" style={{ height: 200, background: 'linear-gradient(135deg, #2D1B69 0%, #17132B 100%)' }}>
        <div className="p-6 h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div className="h-3 bg-white/20 rounded w-28" />
            <div className="w-8 h-8 bg-white/10 rounded-full" />
          </div>
          <div>
            <div className="h-10 bg-white/20 rounded w-48 mb-3" />
            <div className="h-3 bg-white/10 rounded w-40" />
          </div>
          <div className="h-[44px] bg-white/20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div
        className="rounded-[28px] p-6 text-white/70 flex items-center justify-center"
        style={{ height: 180, background: 'linear-gradient(135deg, #2D1B69 0%, #17132B 100%)' }}
      >
        <p className="text-sm font-space-grotesk">Aucun wallet disponible</p>
      </div>
    );
  }

  const walletShort = wallet.id ? `•••• ${wallet.id.slice(-4).toUpperCase()}` : '•••• ••••';

  return (
    <div
      className="rounded-[28px] overflow-hidden relative text-white shadow-[0_16px_40px_rgba(123,63,228,0.30)]"
      style={{ background: 'linear-gradient(135deg, #3B0E8C 0%, #17132B 55%, #0D0720 100%)' }}
    >
      {/* Decorative orbs */}
      <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(123,63,228,0.25), transparent 70%)' }} />
      <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.2), transparent 70%)' }} />

      <div className="relative z-10 p-6">
        {/* Top row: label + eye toggle */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] font-space-grotesk font-bold uppercase tracking-[0.15em] text-white/50 mb-1">
              Solde disponible
            </p>
            <span className="text-[11px] font-space-grotesk text-white/30 tracking-widest">{walletShort}</span>
          </div>
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95"
          >
            {showBalance ? <EyeOff size={15} className="text-white/60" /> : <Eye size={15} className="text-white/60" />}
          </button>
        </div>

        {/* Balance */}
        <div className="mb-6">
          <span
            className="font-nunito font-black text-white leading-none block"
            style={{ fontSize: 'clamp(2rem, 9vw, 2.8rem)', letterSpacing: '-1px' }}
          >
            {showBalance ? formatMontant(wallet.available_balance || 0) : '•••  •••'}
          </span>
        </div>

        {/* Bottom row: security note + retrait button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-white/35">
            <ShieldCheck size={12} />
            <span className="text-[10px] font-space-grotesk">Sécurisé par FedaPay</span>
          </div>
          <Link
            to="/pro/retrait"
            className="flex items-center gap-1.5 font-space-grotesk font-bold text-[13px] text-white px-4 py-2.5 rounded-xl active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
          >
            Retirer
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default WalletCard;


