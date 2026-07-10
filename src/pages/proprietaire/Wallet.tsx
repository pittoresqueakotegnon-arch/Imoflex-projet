import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatMontant, formatDateShort } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../hooks/useWallet';
import BottomNav from '../../components/BottomNav';
import WalletCard from '../../components/WalletCard';
import { useToast } from '../../components/Toast';

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
      <div className="page-container">
        <div className="px-4 pt-6 space-y-6">
          {/* Pulsing WalletCard skeleton */}
          <div className="border border-[#A855F7]/20 bg-[#1E1545]/40 rounded-3xl p-6 animate-pulse space-y-4">
            <div className="h-4 bg-[#8B7BB5]/20 rounded w-28"></div>
            <div className="h-10 bg-white/10 rounded w-48"></div>
            <div className="h-3 bg-[#8B7BB5]/20 rounded w-64"></div>
            <div className="h-[54px] bg-[#A855F7]/20 rounded-xl"></div>
            <div className="h-4 bg-[#8B7BB5]/20 rounded w-36 mx-auto"></div>
          </div>
          {/* Pulsing History skeleton */}
          <div className="space-y-3">
            <div className="h-4 bg-[#8B7BB5]/20 rounded w-24 mb-1"></div>
            <div className="h-16 bg-[#1A1240]/40 rounded-xl animate-pulse"></div>
            <div className="h-16 bg-[#1A1240]/40 rounded-xl animate-pulse"></div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="sticky-header px-4 py-4">
        <h1 className="text-xl font-nunito font-black text-white">Mon Wallet</h1>
      </header>

      <div className="px-4 py-4 space-y-6 flex-1 pb-6">
        {/* Wallet Card */}
        <WalletCard wallet={wallet} loading={loading} />

        {/* Withdrawal History */}
        <div>
          <h2 className="font-nunito font-black text-white text-[15px] mb-3">
            Derniers retraits
          </h2>

          {withdrawals.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center text-[13px] text-[#8B7BB5]"
              style={{ background: 'rgba(30,21,69,0.5)', fontFamily: 'Space Grotesk' }}
            >
              Aucun retrait effectué
            </div>
          ) : (
            <div className="space-y-1">
              {withdrawals.map(withdrawal => {
                const opName = withdrawal.operator.charAt(0).toUpperCase() + withdrawal.operator.slice(1).toLowerCase();
                return (
                  <div key={withdrawal.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      {/* Blue download icon in a rounded square */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.25)' }}
                      >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <polyline points="19 12 12 19 5 12"/>
                        </svg>
                      </div>

                      <div>
                        <p className="text-[13.5px] font-semibold text-white leading-tight">
                          Retrait vers {opName}
                        </p>
                        <p className="text-[11px] text-[#8B7BB5] mt-0.5" style={{ fontFamily: 'Space Grotesk' }}>
                          {formatDateShort(withdrawal.created_at)} · 3j ouvrés
                        </p>
                      </div>
                    </div>

                    {/* Amount: plain number in bold green, no FCFA */}
                    <p className="font-bold text-[15px]" style={{ color: '#22C55E', fontFamily: 'Space Grotesk' }}>
                      {new Intl.NumberFormat('fr-FR').format(withdrawal.amount)}
                    </p>
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
