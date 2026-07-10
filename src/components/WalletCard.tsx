import React from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from '../lib/supabase';
import { formatMontant } from '../lib/utils';

interface WalletCardProps {
  wallet: Wallet | null;
  loading?: boolean;
}

export const WalletCard: React.FC<WalletCardProps> = ({ wallet, loading = false }) => {
  if (loading) {
    return (
      <div
        className="rounded-[20px] p-6 animate-pulse space-y-4"
        style={{ border: '1px solid rgba(168,85,247,0.45)', background: 'rgba(48,28,100,0.85)' }}
      >
        <div className="h-3 bg-white/10 rounded w-28"></div>
        <div className="h-10 bg-white/10 rounded w-48"></div>
        <div className="h-3 bg-white/10 rounded w-64"></div>
        <div className="h-[52px] bg-white/10 rounded-2xl"></div>
        <div className="h-3 bg-white/10 rounded w-36 mx-auto"></div>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div
        className="rounded-[20px] p-6 text-[#8B7BB5]"
        style={{ border: '1px solid rgba(168,85,247,0.45)', background: 'rgba(48,28,100,0.85)' }}
      >
        <p className="text-sm">Aucun wallet disponible</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[20px] p-6 text-white relative overflow-hidden"
      style={{
        border: '1px solid rgba(168, 85, 247, 0.55)',
        background:
          'radial-gradient(ellipse 160% 120% at 105% -10%, rgba(168,85,247,0.50) 0%, rgba(110,50,200,0.30) 35%, rgba(36,20,80,0.98) 65%, rgba(26,15,64,1) 100%)',
        boxShadow: '0 4px 32px rgba(120, 60, 220, 0.22)',
      }}
    >
      {/* Subtle top-right glow orb */}
      <div
        className="absolute -top-6 -right-6 w-28 h-28 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)' }}
      />

      {/* Label */}
      <p
        className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2"
        style={{ color: '#B89FD8', fontFamily: 'Space Grotesk' }}
      >
        Solde disponible
      </p>

      {/* Amount */}
      <div className="mb-2">
        <span
          className="font-nunito font-black text-[2.6rem] leading-none"
          style={{ letterSpacing: '-0.5px' }}
        >
          {formatMontant(wallet.available_balance || 0)}
        </span>
      </div>

      {/* Caption */}
      <p
        className="text-[12px] leading-relaxed mb-6"
        style={{ color: '#9B8CC4', fontFamily: 'Space Grotesk', maxWidth: '220px' }}
      >
        Cumul de tous vos logements, retrait libre à tout moment
      </p>

      {/* Withdrawal Button */}
      <Link
        to="/pro/retrait"
        className="w-full flex items-center justify-center font-bold text-[15px] text-white rounded-2xl"
        style={{
          height: '52px',
          background: 'linear-gradient(135deg, #7B3FE4 0%, #A855F7 100%)',
          boxShadow: '0 4px 18px rgba(123, 63, 228, 0.5)',
          fontFamily: 'Nunito, sans-serif',
        }}
      >
        Retirer vers Mobile Money
      </Link>

      {/* Security note */}
      <div
        className="flex items-center gap-1.5 mt-4"
        style={{ color: '#9B8CC4', fontFamily: 'Space Grotesk', fontSize: '11px' }}
      >
        <span>🔒</span>
        <span>Sécurisé par Fedapay</span>
      </div>
    </div>
  );
};

export default WalletCard;
