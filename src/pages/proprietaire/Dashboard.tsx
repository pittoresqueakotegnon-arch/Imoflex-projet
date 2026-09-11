import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, ArrowRight, Home, MessageCircle, AlertTriangle, ArrowUpRight, TrendingUp, Wallet as WalletIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useWallet } from '../../hooks/useWallet';
import { supabase } from '../../lib/supabase';
import { getCurrentMonth, getMonthName, formatMontant } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import { HeaderBell } from '../../components/HeaderBell';
import { HeaderSupport } from '../../components/HeaderSupport';
import { useToast } from '../../components/Toast';
import { getGreeting } from '../../utils/greeting';
import { PullToRefresh } from '../../components/PullToRefresh';

interface ChartData {
  month: string;
  shortName: string;
  total: number;
}

interface AlertRent {
  id: string;
  leaseId: string;
  propertyName: string;
  amountDue: number;
  status: string;
}

interface DashboardData {
  totalListingsRaw: number;
  propertiesStats: {
    total: number;
    occupied: number;
    available: number;
  };
  currentMonth: {
    expected: number;
    received: number;
    pending: number;
  };
  chartData: ChartData[];
  alerts: AlertRent[];
}

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const { wallet } = useWallet(profile?.id);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const isLocataire = profile?.role === 'locataire';

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('id, name, monthly_rent')
        .eq('owner_id', profile.id)
        .eq('is_active', true);

      if (propertiesError) throw propertiesError;
      const properties = propertiesData || [];
      const propertyIds = properties.map(p => p.id);

      const { count: listingsCount } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', profile.id);

      let leases: any[] = [];
      let leaseIds: string[] = [];
      if (propertyIds.length > 0) {
        const { data: activeLeases, error: leasesError } = await supabase
          .from('leases')
          .select('id, property_id')
          .in('property_id', propertyIds)
          .eq('status', 'actif');
        if (leasesError) throw leasesError;
        leases = activeLeases || [];
        leaseIds = leases.map(l => l.id);
      }

      const totalProps = properties.length;
      const occupiedProps = leases.length;
      const availableProps = totalProps - occupiedProps;

      const { month: currMonthNum, year: currYear } = getCurrentMonth();

      const chartMonths: { month: number; year: number; shortName: string; label: string }[] = [];
      for (let i = 5; i >= 0; i--) {
        let m = currMonthNum - i;
        let y = currYear;
        if (m <= 0) { m += 12; y -= 1; }
        const mName = getMonthName(m, y);
        chartMonths.push({ month: m, year: y, shortName: mName.substring(0, 3).toUpperCase(), label: mName });
      }

      let currentMonthExpected = 0;
      let currentMonthReceived = 0;
      const rawChartData: Record<string, number> = {};
      const alerts: AlertRent[] = [];

      chartMonths.forEach(cm => rawChartData[`${cm.year}-${cm.month}`] = 0);

      if (leaseIds.length > 0) {
        const orConditions = chartMonths.map(cm => `and(period_month.eq.${cm.month},period_year.eq.${cm.year})`).join(',');
        const { data: rentPeriods, error: rentError } = await supabase
          .from('rent_periods')
          .select('id, lease_id, period_month, period_year, amount_due, amount_paid, status')
          .in('lease_id', leaseIds)
          .or(orConditions);

        if (rentError) throw rentError;

        (rentPeriods || []).forEach(rp => {
          const key = `${rp.period_year}-${rp.period_month}`;
          if (rawChartData[key] !== undefined) rawChartData[key] += (rp.amount_paid || 0);

          if (rp.period_month === currMonthNum && rp.period_year === currYear) {
            currentMonthExpected += (rp.amount_due || 0);
            currentMonthReceived += (rp.amount_paid || 0);
          }

          const isCurrentOrPast = (rp.period_year < currYear) || (rp.period_year === currYear && rp.period_month <= currMonthNum);
          if (isCurrentOrPast && (rp.status === 'retard' || (rp.status === 'en_cours' && rp.amount_paid < rp.amount_due))) {
            const lease = leases.find(l => l.id === rp.lease_id);
            const prop = properties.find(p => p.id === lease?.property_id);
            if (prop) {
              alerts.push({
                id: rp.id,
                leaseId: rp.lease_id,
                propertyName: prop.name,
                amountDue: (rp.amount_due || 0) - (rp.amount_paid || 0),
                status: rp.status,
              });
            }
          }
        });
      }

      const chartData: ChartData[] = chartMonths.map(cm => ({
        month: cm.label,
        shortName: cm.shortName,
        total: rawChartData[`${cm.year}-${cm.month}`] || 0,
      }));

      setData({
        totalListingsRaw: listingsCount || 0,
        propertiesStats: { total: totalProps, occupied: occupiedProps, available: availableProps },
        currentMonth: { expected: currentMonthExpected, received: currentMonthReceived, pending: Math.max(0, currentMonthExpected - currentMonthReceived) },
        chartData,
        alerts,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      showToast('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── LOADING STATE ──
  if (loading && !isLocataire) {
    return (
      <div className="page-container" style={{ background: '#F5F4FB' }}>
        <div className="px-5 pt-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="w-36 h-7 bg-gray-200 rounded-lg animate-pulse" />
            <div className="flex gap-2">
              <div className="w-10 h-10 bg-gray-200 rounded-2xl animate-pulse" />
              <div className="w-10 h-10 bg-gray-200 rounded-2xl animate-pulse" />
            </div>
          </div>
          <div className="h-56 bg-purple-100 rounded-[28px] animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-[20px] animate-pulse" />)}
          </div>
          <div className="h-44 bg-gray-100 rounded-[24px] animate-pulse" />
        </div>
        <BottomNav />
      </div>
    );
  }

  const hasNoProperty = (data?.totalListingsRaw || 0) === 0 && (data?.propertiesStats.total || 0) === 0;

  // ── ONBOARDING ──
  if (hasNoProperty) {
    return (
      <div className="page-container flex flex-col" style={{ background: '#F5F4FB' }}>
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24 text-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center" style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}>
              <Building2 size={40} className="text-[var(--imx-accent-light)]" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl flex items-center justify-center bg-[#22C55E]">
              <Home size={16} className="text-white" />
            </div>
          </div>
          <h1 className="font-nunito font-black text-[#17132B] text-[24px] leading-tight mb-3">Vous louez un bien immobilier ?</h1>
          <p className="text-gray-500 text-[14px] leading-relaxed mb-10 font-space-grotesk max-w-[320px]">
            Simplifiez vos encaissements MoMo, suivez vos locataires et sécurisez vos loyers sur ImoFlex.
          </p>
          {isLocataire ? (
            <a href="https://wa.me/22960000000?text=Bonjour%20ImoFlex%20!%20Je%20suis%20locataire%20et%20souhaite%20créer%20un%20compte%20Bailleur." target="_blank" rel="noopener noreferrer"
              className="w-full max-w-xs flex items-center justify-center gap-2 text-white font-nunito font-black text-[16px] rounded-3xl py-4 mb-4 bg-green-500 active:scale-95 transition-transform">
              <MessageCircle size={18} /> Demander un compte Bailleur
            </a>
          ) : (
            <Link to="/pro/publier"
              className="w-full max-w-xs flex items-center justify-center gap-2 text-white font-nunito font-black text-[16px] rounded-3xl py-4 mb-4 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)' }}>
              <Plus size={20} /> Ajouter mon premier logement
            </Link>
          )}
          <Link to="/" className="flex items-center gap-1.5 text-[#7B3FE4] text-[13px] font-semibold font-space-grotesk">
            Parcourir les annonces <ArrowRight size={14} />
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  const maxChartVal = Math.max(...(data?.chartData.map(d => d.total) || [0]), 1);
  const collectionRate = data?.currentMonth.expected
    ? Math.round((data.currentMonth.received / data.currentMonth.expected) * 100)
    : 0;

  return (
    <div className="page-container flex flex-col" style={{ background: '#F5F4FB' }}>
      <PullToRefresh onRefresh={fetchData}>

        {/* ── HEADER ── */}
        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
          <div>
            <p className="text-gray-400 font-space-grotesk font-semibold text-[11px] uppercase tracking-widest">{getGreeting()}</p>
            <h1 className="text-[24px] font-nunito font-black text-[#17132B] mt-0.5 leading-tight">
              {profile?.full_name?.split(' ')[0] || 'Propriétaire'} 👋
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <HeaderSupport className="relative w-10 h-10 rounded-2xl bg-white flex items-center justify-center border border-gray-100 shadow-sm flex-shrink-0" />
            <HeaderBell className="relative w-10 h-10 rounded-2xl bg-white flex items-center justify-center border border-gray-100 shadow-sm flex-shrink-0" />
          </div>
        </div>

        {/* ── CARTE FINTECH PRINCIPALE ── */}
        <div className="mx-5 mb-5 rounded-[28px] relative overflow-hidden"
          style={{ background: 'linear-gradient(145deg, #7B3FE4 0%, #3D1884 100%)', boxShadow: '0 16px 40px rgba(123, 63, 228, 0.35)' }}>
          {/* Décors */}
          <div className="absolute pointer-events-none"
            style={{ top: '-30px', right: '-30px', width: '160px', height: '160px', background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }} />
          <div className="absolute pointer-events-none"
            style={{ bottom: '-20px', left: '-20px', width: '100px', height: '100px', background: 'rgba(255,255,255,0.04)', borderRadius: '50%' }} />

          <div className="relative p-6">
            {/* Solde disponible */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center">
                    <WalletIcon size={12} className="text-white" />
                  </div>
                  <span className="font-space-grotesk text-[11px] font-bold uppercase tracking-widest text-white/60">Solde disponible</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-nunito font-black text-[38px] leading-none text-white">
                    {formatMontant(wallet?.available_balance || 0)}
                  </span>
                </div>
              </div>
              <Link to="/pro/wallet"
                className="mt-1 flex items-center gap-1.5 rounded-2xl px-3 py-2 active:opacity-70 transition-opacity"
                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <span className="font-space-grotesk font-bold text-[12px] text-white">Retirer</span>
                <ArrowUpRight size={13} className="text-white" />
              </Link>
            </div>

            {/* Séparateur */}
            <div className="h-[1px] bg-white/10 mb-5" />

            {/* Loyers du mois */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-space-grotesk text-[11px] font-bold uppercase tracking-widest text-white/60">
                  Loyers — {new Date().toLocaleString('fr-FR', { month: 'long' })}
                </span>
                <span
                  className="font-space-grotesk text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: collectionRate >= 100 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.12)',
                    color: collectionRate >= 100 ? '#6EE7B7' : 'rgba(255,255,255,0.85)',
                  }}>
                  {collectionRate}% collecté
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.10)' }}>
                  <p className="font-space-grotesk text-[10px] text-white/50 font-bold uppercase mb-1.5">Reçus</p>
                  <p className="font-nunito font-black text-[16px] sm:text-[18px] text-white leading-none truncate" title={formatMontant(data?.currentMonth.received || 0)}>
                    {formatMontant(data?.currentMonth.received || 0)}
                  </p>
                </div>
                <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.10)' }}>
                  <p className="font-space-grotesk text-[10px] text-white/50 font-bold uppercase mb-1.5">À recevoir</p>
                  <p className="font-nunito font-black text-[16px] sm:text-[18px] leading-none truncate"
                    title={formatMontant(data?.currentMonth.pending || 0)}
                    style={{ color: (data?.currentMonth.pending || 0) > 0 ? '#FCA5A5' : '#6EE7B7' }}>
                    {formatMontant(data?.currentMonth.pending || 0)}
                  </p>
                </div>
              </div>

              {/* Barre progression */}
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.min(collectionRate, 100)}%`,
                    background: collectionRate >= 100 ? '#10B981' : collectionRate >= 50 ? '#F59E0B' : '#EF4444',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 pb-8 space-y-5">

          {/* ── PARC IMMOBILIER ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total biens', value: data?.propertiesStats.total || 0, color: '#17132B' },
              { label: 'Occupés', value: data?.propertiesStats.occupied || 0, color: '#10B981' },
              { label: 'Disponibles', value: data?.propertiesStats.available || 0, color: '#9CA3AF' },
            ].map((stat, i) => (
              <div key={i} className="bg-white rounded-[20px] p-4 flex flex-col items-center text-center shadow-sm border border-gray-100">
                <span className="font-nunito font-black text-[26px] leading-none mb-1" style={{ color: stat.color }}>{stat.value}</span>
                <span className="font-space-grotesk text-[10px] font-bold text-gray-400 uppercase tracking-wide leading-tight">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* ── REVENUS 6 MOIS ── */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-purple-50 flex items-center justify-center">
                  <TrendingUp size={14} className="text-[#7B3FE4]" />
                </div>
                <h3 className="font-nunito font-black text-[15px] text-[#17132B]">Revenus historiques</h3>
              </div>
              <span className="font-space-grotesk text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">6 MOIS</span>
            </div>

            <div className="flex items-end justify-between gap-2" style={{ height: '90px' }}>
              {data?.chartData.map((d, idx) => {
                const heightPct = Math.max((d.total / maxChartVal) * 100, 3);
                const isCurrentMonth = idx === 5;
                return (
                  <div key={idx} className="flex flex-col items-center gap-1.5 flex-1">
                    <div className="w-full flex flex-col justify-end" style={{ height: '70px' }}>
                      <div
                        className="w-full rounded-lg transition-all duration-700"
                        style={{
                          height: `${heightPct}%`,
                          background: isCurrentMonth
                            ? 'linear-gradient(180deg, #9B6FF4 0%, #7B3FE4 100%)'
                            : '#EDE9FE',
                        }}
                      />
                    </div>
                    <span className={`font-space-grotesk text-[9px] font-bold ${isCurrentMonth ? 'text-[#7B3FE4]' : 'text-gray-400'}`}>
                      {d.shortName}
                    </span>
                  </div>
                );
              })}
            </div>

            {data?.chartData[5] && data.chartData[5].total > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="font-space-grotesk text-[11px] text-gray-400 font-semibold">Ce mois</span>
                <span className="font-nunito font-black text-[14px] text-[#7B3FE4]">
                  {formatMontant(data.chartData[5].total)}
                </span>
              </div>
            )}
          </div>

          {/* ── LOYERS À SURVEILLER ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-nunito font-black text-[16px] text-[#17132B]">Loyers à surveiller</h3>
              {data?.alerts && data.alerts.length > 0 && (
                <span className="font-space-grotesk text-[10px] font-bold bg-red-50 text-red-500 px-2.5 py-1 rounded-full border border-red-100">
                  {data.alerts.length} alerte{data.alerts.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {data?.alerts && data.alerts.length > 0 ? (
              <div className="space-y-3">
                {data.alerts.map(alert => (
                  <div key={alert.id} className="bg-white rounded-[20px] p-4 flex items-center justify-between shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${alert.status === 'retard' ? 'bg-red-50' : 'bg-amber-50'}`}>
                        <AlertTriangle size={17} className={alert.status === 'retard' ? 'text-red-500' : 'text-amber-500'} />
                      </div>
                      <div>
                        <h4 className="font-nunito font-bold text-[14px] text-[#17132B] truncate max-w-[130px]">{alert.propertyName}</h4>
                        <p className="font-space-grotesk text-[11px] font-semibold text-gray-400 mt-0.5">
                          {formatMontant(alert.amountDue)} restants
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`font-space-grotesk text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${alert.status === 'retard' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                        {alert.status === 'retard' ? 'En retard' : 'À venir'}
                      </span>
                      <a
                        href={`https://wa.me/?text=Bonjour%2C%20je%20vous%20rappelle%20que%20le%20loyer%20de%20${encodeURIComponent(alert.propertyName)}%20est%20en%20attente%20de%20règlement.%20Merci.`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-space-grotesk font-bold text-[#7B3FE4] flex items-center gap-1 active:opacity-60"
                      >
                        Relancer <ArrowRight size={11} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-[20px] p-6 flex flex-col items-center text-center shadow-sm border border-gray-100">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-nunito font-black text-[15px] text-[#17132B]">Tout est à jour ✓</p>
                <p className="font-space-grotesk text-[12px] text-gray-400 mt-1">Aucun retard de loyer ce mois-ci.</p>
              </div>
            )}
          </div>

        </div>

      </PullToRefresh>



      <BottomNav />
    </div>
  );
};

export default Dashboard;
