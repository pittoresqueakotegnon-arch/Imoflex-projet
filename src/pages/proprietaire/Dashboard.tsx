import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Building2, ArrowRight, Home, MessageCircle, MapPin, AlertTriangle, ArrowUpRight } from 'lucide-react';
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
  status: string; // 'retard' | 'en_cours'
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
  const navigate = useNavigate();
  
  // NOUVEAU: Wallet
  const { wallet } = useWallet(profile?.id);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const isLocataire = profile?.role === 'locataire';

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      // 1. Fetch properties
      const { data: propertiesData, error: propertiesError } = await supabase
        .from('properties')
        .select('id, name, monthly_rent')
        .eq('owner_id', profile.id)
        .eq('is_active', true);
      
      if (propertiesError) throw propertiesError;
      const properties = propertiesData || [];
      const propertyIds = properties.map(p => p.id);

      // 2. Fetch all raw listings (for onboarding check)
      const { count: listingsCount, error: listingsError } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', profile.id);

      // 3. Fetch active leases
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

      // Stats Properties
      const totalProps = properties.length;
      const occupiedProps = leases.length;
      const availableProps = totalProps - occupiedProps;

      // 4. Calculate months for chart (last 6 months including current)
      const { month: currMonthNum, year: currYear } = getCurrentMonth();
      
      // Generation des 6 derniers mois (ex: [5, 4, 3, 2, 1, 12])
      const chartMonths: {month: number, year: number, shortName: string, label: string}[] = [];
      for (let i = 5; i >= 0; i--) {
        let m = currMonthNum - i;
        let y = currYear;
        if (m <= 0) {
          m += 12;
          y -= 1;
        }
        const mName = getMonthName(m, y);
        chartMonths.push({
          month: m,
          year: y,
          shortName: mName.substring(0, 3).toUpperCase(),
          label: mName
        });
      }

      // 5. Fetch Rent Periods for the last 6 months
      let currentMonthExpected = 0;
      let currentMonthReceived = 0;
      const rawChartData: Record<string, number> = {};
      const alerts: AlertRent[] = [];

      chartMonths.forEach(cm => rawChartData[`${cm.year}-${cm.month}`] = 0);

      if (leaseIds.length > 0) {
        // Build OR query for the 6 months
        const orConditions = chartMonths.map(cm => `and(period_month.eq.${cm.month},period_year.eq.${cm.year})`).join(',');
        
        const { data: rentPeriods, error: rentError } = await supabase
          .from('rent_periods')
          .select('id, lease_id, period_month, period_year, amount_due, amount_paid, status')
          .in('lease_id', leaseIds)
          .or(orConditions);

        if (rentError) throw rentError;

        // Process rent periods
        (rentPeriods || []).forEach(rp => {
          const key = `${rp.period_year}-${rp.period_month}`;
          
          // Add to chart
          if (rawChartData[key] !== undefined) {
            rawChartData[key] += (rp.amount_paid || 0);
          }

          // Current month calculations
          if (rp.period_month === currMonthNum && rp.period_year === currYear) {
            currentMonthExpected += (rp.amount_due || 0);
            currentMonthReceived += (rp.amount_paid || 0);
          }

          // Alerts (retard or en_cours with pending amount)
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
                status: rp.status
              });
            }
          }
        });
      }

      // Format Chart Data
      const chartData: ChartData[] = chartMonths.map(cm => ({
        month: cm.label,
        shortName: cm.shortName,
        total: rawChartData[`${cm.year}-${cm.month}`] || 0
      }));

      setData({
        totalListingsRaw: listingsCount || 0,
        propertiesStats: {
          total: totalProps,
          occupied: occupiedProps,
          available: availableProps
        },
        currentMonth: {
          expected: currentMonthExpected,
          received: currentMonthReceived,
          pending: Math.max(0, currentMonthExpected - currentMonthReceived)
        },
        chartData,
        alerts
      });

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      showToast('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading && !isLocataire) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="w-32 h-6 bg-[var(--imx-surface-2)] rounded animate-pulse"></div>
            <div className="w-11 h-11 bg-[var(--imx-surface-2)] rounded-xl animate-pulse"></div>
          </div>
          <div className="h-48 bg-[#1A3A1A] rounded-3xl animate-pulse"></div>
          <div className="grid grid-cols-3 gap-3"><div className="h-20 bg-[var(--imx-surface-2)] rounded-2xl animate-pulse"></div><div className="h-20 bg-[var(--imx-surface-2)] rounded-2xl animate-pulse"></div><div className="h-20 bg-[var(--imx-surface-2)] rounded-2xl animate-pulse"></div></div>
          <div className="h-40 bg-[var(--imx-surface-2)] rounded-2xl animate-pulse"></div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const hasNoProperty = (data?.totalListingsRaw || 0) === 0 && (data?.propertiesStats.total || 0) === 0;

  // ── ONBOARDING NOUVEAU PROPRIO ──
  if (hasNoProperty) {
    return (
      <div className="page-container flex flex-col">
        {/* Onboarding Screen */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24 text-center">
          <div className="relative mb-8">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center" style={{ background: 'var(--imx-surface-2)', boxShadow: 'var(--imx-card-shadow-sm)', border: '1px solid var(--imx-border)' }}>
              <Building2 size={40} className="text-[var(--imx-accent-light)]" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl flex items-center justify-center bg-[#22C55E]">
              <Home size={16} className="text-white" />
            </div>
          </div>
          <h1 className="font-nunito font-900 text-[var(--imx-text-primary)] text-[24px] leading-tight mb-3">
            Vous louez un bien immobilier ?
          </h1>
          <p className="text-[var(--imx-text-secondary)] text-[14px] leading-relaxed mb-10 font-space-grotesk max-w-[320px]">
            Simplifiez vos encaissements MoMo, suivez vos locataires et sécurisez vos loyers sur ImoFlex.
          </p>

          {isLocataire ? (
            <a href="https://wa.me/22960000000?text=Bonjour%20ImoFlex%20!%20Je%20suis%20locataire%20et%20souhaite%20créer%20un%20compte%20Bailleur." target="_blank" rel="noopener noreferrer" className="w-full max-w-xs flex items-center justify-center gap-2 text-white font-nunito font-900 text-[16px] rounded-3xl py-4 mb-4 transition-all hover:opacity-90 active:scale-95 bg-green-500">
              <MessageCircle size={18} /> Demander un compte Bailleur
            </a>
          ) : (
            <Link to="/pro/publier" className="w-full max-w-xs flex items-center justify-center gap-2 text-white font-nunito font-900 text-[16px] rounded-3xl py-4 mb-4 transition-all hover:opacity-90 active:scale-95 shadow-md bg-[var(--imx-accent)]">
              <Plus size={20} /> Ajouter mon premier logement
            </Link>
          )}
          <Link to="/" className="flex items-center gap-1.5 text-[var(--imx-accent-light)] text-[13px] font-semibold hover:text-purple-300 transition-colors font-space-grotesk">
            Parcourir les annonces <ArrowRight size={14} />
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Helper render Chart
  const maxChartVal = Math.max(...(data?.chartData.map(d => d.total) || [0]), 10000); // 10k minimum pour echelle

  return (
    <div className="page-container flex flex-col bg-[#F8F7FF]">
      <PullToRefresh onRefresh={fetchData}>
        
      {/* ── HEADER & GREETING ── */}
      <div className="bg-white px-5 pt-6 pb-6 rounded-b-[32px] shadow-sm relative z-10" style={{ borderBottom: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <span className="text-gray-400 font-space-grotesk font-bold text-[12px] tracking-wide uppercase">
              {getGreeting()}
            </span>
            <h1 className="text-[22px] font-nunito font-black text-[#17132B] mt-0.5 leading-tight">
              {profile?.full_name?.split(' ')[0] || 'Propriétaire'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <HeaderSupport className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100" />
            <HeaderBell className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100" />
          </div>
        </div>

        {/* ── VOTRE ACTIVITÉ (CARTE HÉROS FINTECH) ── */}
        <div className="rounded-[24px] p-6 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #7B3FE4 0%, #4C1D95 100%)', boxShadow: '0 12px 32px rgba(123, 63, 228, 0.25)' }}>
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/20 rounded-full blur-xl -ml-10 -mb-10 pointer-events-none" />

          {/* Solde Wallet */}
          <div className="relative z-10 mb-6">
            <div className="flex items-center justify-between mb-1">
              <span className="font-space-grotesk text-[11px] font-bold uppercase tracking-widest text-white/70">Solde disponible</span>
              <Link to="/pro/wallet" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm active:bg-white/20">
                <ArrowUpRight size={16} className="text-white" />
              </Link>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-nunito font-black text-[32px] leading-none">{formatMontant(wallet?.available_balance || 0)}</span>
              <span className="font-space-grotesk font-semibold text-[14px] text-white/80">FCFA</span>
            </div>
          </div>

          <div className="w-full h-[1px] bg-white/10 mb-5" />

          {/* Loyers du mois */}
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="font-space-grotesk text-[11px] font-bold uppercase tracking-widest text-white/70">Loyers du mois</span>
              <span className="font-space-grotesk font-bold text-[12px] bg-white/15 px-2 py-0.5 rounded-full text-white">
                À recevoir : {formatMontant(data?.currentMonth.pending || 0)} F
              </span>
            </div>
            
            <div className="flex items-baseline justify-between mb-2">
              <span className="font-nunito font-bold text-[15px]">{formatMontant(data?.currentMonth.received || 0)} F</span>
              <span className="font-nunito font-bold text-[15px] text-white/50">{formatMontant(data?.currentMonth.expected || 0)} F</span>
            </div>

            {/* Jauge */}
            <div className="h-1.5 w-full bg-black/20 rounded-full overflow-hidden">
              <div className="h-full bg-[#10B981] rounded-full transition-all duration-700" 
                style={{ width: `${data?.currentMonth.expected ? Math.min((data.currentMonth.received / data.currentMonth.expected) * 100, 100) : 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 space-y-6 flex-1">
        
        {/* ── PARC IMMOBILIER (STATS RAPIDES) ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-[20px] p-4 flex flex-col items-center text-center shadow-sm border border-gray-100">
            <span className="font-space-grotesk text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Biens</span>
            <span className="font-nunito font-black text-[22px] text-[#17132B] leading-none">{data?.propertiesStats.total || 0}</span>
          </div>
          <div className="bg-white rounded-[20px] p-4 flex flex-col items-center text-center shadow-sm border border-gray-100">
            <span className="font-space-grotesk text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Occupés</span>
            <span className="font-nunito font-black text-[22px] text-[#10B981] leading-none">{data?.propertiesStats.occupied || 0}</span>
          </div>
          <div className="bg-white rounded-[20px] p-4 flex flex-col items-center text-center shadow-sm border border-gray-100">
            <span className="font-space-grotesk text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Libres</span>
            <span className="font-nunito font-black text-[22px] text-gray-300 leading-none">{data?.propertiesStats.available || 0}</span>
          </div>
        </div>

        {/* ── REVENUS DES 6 DERNIERS MOIS ── */}
        <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-nunito font-black text-[16px] text-[#17132B]">Revenus historiques</h3>
            <span className="font-space-grotesk text-[11px] font-bold text-gray-400">6 DERNIERS MOIS</span>
          </div>
          
          <div className="flex items-end justify-between h-[120px] gap-2">
            {data?.chartData.map((d, idx) => {
              const heightPct = Math.max((d.total / maxChartVal) * 100, 4); // min 4% for visibility
              const isCurrentMonth = idx === 5;
              return (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1 group">
                  {/* Tooltip on hover (desktop) / active (mobile) could be added here, for now just show amount in a tiny label if big enough */}
                  <div className="w-full relative flex flex-col justify-end" style={{ height: '100px' }}>
                    <div 
                      className={`w-full rounded-md transition-all duration-700 ${isCurrentMonth ? 'bg-[#7B3FE4]' : 'bg-[#E5E7EB]'}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`font-space-grotesk text-[10px] font-bold ${isCurrentMonth ? 'text-[#7B3FE4]' : 'text-gray-400'}`}>
                    {d.shortName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── LOYERS À SURVEILLER ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-nunito font-black text-[16px] text-[#17132B]">Loyers à surveiller</h3>
            {data?.alerts && data.alerts.length > 0 && (
              <span className="font-space-grotesk text-[10px] font-bold bg-amber-100 text-amber-600 px-2 py-0.5 rounded-md">
                {data.alerts.length} ACTION{data.alerts.length > 1 ? 'S' : ''}
              </span>
            )}
          </div>

          {data?.alerts && data.alerts.length > 0 ? (
            <div className="space-y-3">
              {data.alerts.map(alert => (
                <div key={alert.id} className="bg-white rounded-[20px] p-4 flex items-center justify-between shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${alert.status === 'retard' ? 'bg-red-50' : 'bg-amber-50'}`}>
                      <AlertTriangle size={18} className={alert.status === 'retard' ? 'text-red-500' : 'text-amber-500'} />
                    </div>
                    <div>
                      <h4 className="font-nunito font-bold text-[14px] text-[#17132B] truncate max-w-[120px]">{alert.propertyName}</h4>
                      <p className="font-space-grotesk text-[12px] font-semibold text-gray-500">{formatMontant(alert.amountDue)} F restants</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`font-space-grotesk text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${alert.status === 'retard' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                      {alert.status === 'retard' ? 'En retard' : 'À venir'}
                    </span>
                    <a href={`https://wa.me/?text=Bonjour,%20sauf%20erreur%20de%20ma%20part,%20le%20loyer%20de%20${alert.propertyName}%20n'a%20pas%20encore%20ete%20regle.`} target="_blank" rel="noopener noreferrer" 
                       className="text-[11px] font-space-grotesk font-bold text-[#7B3FE4] active:opacity-60 flex items-center gap-1">
                      Relancer <ArrowRight size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
             <div className="bg-white rounded-[20px] p-6 flex flex-col items-center text-center shadow-sm border border-gray-100">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mb-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <p className="font-nunito font-bold text-[14px] text-[#17132B]">Tout est à jour</p>
                <p className="font-space-grotesk text-[12px] text-gray-400 mt-1">Aucun retard de loyer à signaler.</p>
             </div>
          )}
        </div>

      </div>

      {/* FAB */}
      <Link
        to="/pro/publier"
        className="fixed flex items-center justify-center text-white active:scale-95 transition-transform"
        style={{
          bottom: '82px',
          right: '16px',
          width: '52px',
          height: '52px',
          borderRadius: '26px',
          background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)',
          boxShadow: '0 8px 24px rgba(123, 63, 228, 0.4)',
          zIndex: 45,
        }}
      >
        <Plus size={24} />
      </Link>
      </PullToRefresh>
      <BottomNav />
    </div>
  );
};

export default Dashboard;
