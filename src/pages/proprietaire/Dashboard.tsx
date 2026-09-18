import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, ArrowRight, Home, MessageCircle, AlertTriangle, ArrowUpRight, TrendingUp, Users, Wallet as WalletIcon } from 'lucide-react';
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
      <div className="page-container premium-page">
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
      <div className="page-container premium-page flex flex-col">
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
  const priorityAlerts = [...(data?.alerts || [])]
    .sort((a, b) => {
      const priority = (status: string) => status === 'retard' ? 0 : 1;
      return priority(a.status) - priority(b.status) || b.amountDue - a.amountDue;
    })
    .filter((alert, index, alerts) => alerts.findIndex((item) => item.leaseId === alert.leaseId) === index)
    .slice(0, 3);

  return (
    <div className="page-container premium-page flex flex-col">
      <PullToRefresh onRefresh={fetchData}>

        {/* ── HEADER ── */}
        <div className="premium-header px-5 pt-6 pb-4 flex items-center justify-between">
          <div>
            <p className="text-gray-400 font-space-grotesk font-semibold text-[11px] uppercase tracking-widest">{getGreeting()}</p>
            <h1 className="text-[24px] font-nunito font-black text-[#17132B] mt-0.5 leading-tight">
              {profile?.full_name?.split(' ')[0] || 'Propriétaire'} 👋
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <HeaderSupport />
            <HeaderBell />
          </div>
        </div>

        {/* ── SYNTHÈSE FINANCIÈRE ── */}
        <section className="relative mx-5 mb-5 overflow-hidden rounded-[24px] p-5"
          style={{
            background: 'linear-gradient(150deg, #8B5CF6 0%, #5B21B6 50%, #2E1065 100%)',
            boxShadow: '0 12px 30px rgba(76, 29, 149, 0.32)',
          }}>
          {/* Décor ton sur ton : la carte reste expressive sans introduire d'autres couleurs. */}
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border border-white/10 bg-gradient-to-br from-white/15 to-transparent rotate-[15deg]" />
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-56 w-56 rounded-full border border-white/5 bg-gradient-to-br from-transparent to-white/10" />
          <div className="relative z-10">
            {/* Solde disponible */}
            <div className="flex items-start justify-between mb-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.15)' }}>
                    <WalletIcon size={13} color="white" />
                  </div>
                  <span className="font-space-grotesk text-[10px] font-bold uppercase tracking-widest text-white/70">Solde disponible</span>
                </div>
                <p
                  className="font-nunito font-black leading-none whitespace-nowrap tracking-[-0.035em] text-white"
                  style={{ fontSize: 'clamp(1.45rem, 7vw, 2rem)' }}
                  title={formatMontant(wallet?.available_balance || 0)}>
                  {formatMontant(wallet?.available_balance || 0)}
                </p>
              </div>
              <Link to="/pro/wallet"
                className="mt-1 flex items-center gap-1.5 rounded-xl px-3 py-2 active:scale-[0.98] transition-transform"
                style={{ background: 'rgba(255, 255, 255, 0.14)', border: '1px solid rgba(255, 255, 255, 0.14)', color: 'white' }}>
                <span className="font-space-grotesk font-bold text-[11px]">Retirer</span>
                <ArrowUpRight size={13} />
              </Link>
            </div>

            {/* Séparateur */}
            <div className="h-[1px] mb-4 bg-white/15" />

            {/* Loyers du mois */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-space-grotesk text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Loyers — {new Date().toLocaleString('fr-FR', { month: 'long' })}
                </span>
                <span
                  className="font-space-grotesk text-[10px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(255, 255, 255, 0.14)', color: 'white' }}>
                  {collectionRate}% collecté
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="min-w-0 rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.12)' }}>
                  <p className="font-space-grotesk text-[9px] font-bold uppercase mb-1.5 text-white/65">Reçus</p>
                  <p className="font-nunito font-black leading-none whitespace-nowrap tracking-[-0.035em] text-white" style={{ fontSize: 'clamp(0.68rem, 3vw, 0.95rem)' }} title={formatMontant(data?.currentMonth.received || 0)}>
                    {formatMontant(data?.currentMonth.received || 0)}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl p-3" style={{ background: 'rgba(255, 255, 255, 0.12)' }}>
                  <p className="font-space-grotesk text-[9px] font-bold uppercase mb-1.5 text-white/65">À recevoir</p>
                  <p className="font-nunito font-black leading-none whitespace-nowrap tracking-[-0.035em] text-white" style={{ fontSize: 'clamp(0.68rem, 3vw, 0.95rem)' }}
                    title={formatMontant(data?.currentMonth.pending || 0)}>
                    {formatMontant(data?.currentMonth.pending || 0)}
                  </p>
                </div>
              </div>

              {/* Barre progression */}
              <div className="h-1.5 w-full rounded-full overflow-hidden bg-black/20">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${Math.min(collectionRate, 100)}%`,
                    background: '#C4B5FD',
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="px-5 pb-8 space-y-5">

          {/* ── PARC IMMOBILIER ── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total biens', value: data?.propertiesStats.total || 0 },
              { label: 'Occupés', value: data?.propertiesStats.occupied || 0 },
              { label: 'Disponibles', value: data?.propertiesStats.available || 0 },
            ].map((stat, i) => (
              <div key={i} className="rounded-[18px] p-3.5 flex flex-col items-center text-center" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
                <span className="font-nunito font-black text-[24px] leading-none mb-1" style={{ color: i === 0 ? 'var(--imx-text-primary)' : 'var(--imx-accent)' }}>{stat.value}</span>
                <span className="font-space-grotesk text-[9px] font-bold uppercase tracking-wide leading-tight" style={{ color: 'var(--imx-text-muted)' }}>{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Accès direct aux actions de gestion */}
          <section>
            <h2 className="font-nunito font-black text-[15px] mb-3 ml-1" style={{ color: 'var(--imx-text-primary)' }}>Accès rapides</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { to: '/pro/locataires', label: 'Locataires', icon: Users },
                { to: '/pro/demandes', label: 'Demandes', icon: MessageCircle },
                { to: '/pro/annonces', label: 'Annonces', icon: Building2 },
              ].map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="rounded-[18px] py-3 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--imx-accent-xlight)' }}>
                    <Icon size={17} color="var(--imx-accent)" />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>{label}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── REVENUS 6 MOIS ── */}
          <section className="rounded-[22px] p-5" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'var(--imx-accent-xlight)' }}>
                  <TrendingUp size={14} color="var(--imx-accent)" />
                </div>
                <h3 className="font-nunito font-black text-[15px] text-[var(--imx-text-primary)]">Revenus historiques</h3>
              </div>
              <span className="font-space-grotesk text-[10px] font-bold px-2 py-1 rounded-lg" style={{ color: 'var(--imx-text-muted)', background: 'var(--imx-surface-2)' }}>6 MOIS</span>
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
                          background: isCurrentMonth ? 'var(--imx-accent)' : 'var(--imx-border)',
                        }}
                      />
                    </div>
                    <span className="font-space-grotesk text-[9px] font-bold" style={{ color: isCurrentMonth ? 'var(--imx-accent)' : 'var(--imx-text-muted)' }}>
                      {d.shortName}
                    </span>
                  </div>
                );
              })}
            </div>

            {data?.chartData[5] && data.chartData[5].total > 0 && (
              <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--imx-border)' }}>
                <span className="font-space-grotesk text-[11px] font-semibold" style={{ color: 'var(--imx-text-secondary)' }}>Ce mois</span>
                <span className="font-nunito font-black text-[14px]" style={{ color: 'var(--imx-accent)' }}>
                  {formatMontant(data.chartData[5].total)}
                </span>
              </div>
            )}
          </section>

          {/* ── LOYERS À SURVEILLER ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-nunito font-black text-[16px] text-[var(--imx-text-primary)]">À traiter en priorité</h3>
              {data?.alerts && data.alerts.length > 0 && (
                <span className="font-space-grotesk text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ color: 'var(--imx-accent)', background: 'var(--imx-accent-xlight)' }}>
                  {data.alerts.length} à suivre
                </span>
              )}
            </div>

            {priorityAlerts.length > 0 ? (
              <div className="space-y-3">
                {priorityAlerts.map(alert => (
                  <Link key={alert.id} to={`/pro/bail/${alert.leaseId}`} className="rounded-[18px] p-4 flex items-center justify-between active:scale-[0.99] transition-transform" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: alert.status === 'retard' ? 'rgba(239, 68, 68, 0.10)' : 'var(--imx-accent-xlight)' }}>
                        <AlertTriangle size={17} color={alert.status === 'retard' ? '#EF4444' : 'var(--imx-accent)'} />
                      </div>
                      <div>
                        <h4 className="font-nunito font-bold text-[14px] text-[var(--imx-text-primary)] truncate max-w-[190px]">{alert.propertyName}</h4>
                        <p className="font-space-grotesk text-[11px] font-semibold mt-0.5" style={{ color: 'var(--imx-text-secondary)' }}>
                          {formatMontant(alert.amountDue)} restants
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="font-space-grotesk text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: alert.status === 'retard' ? 'rgba(239, 68, 68, 0.10)' : 'var(--imx-accent-xlight)', color: alert.status === 'retard' ? '#EF4444' : 'var(--imx-accent)' }}>
                        {alert.status === 'retard' ? 'En retard' : 'À suivre'}
                      </span>
                      <span className="text-[11px] font-space-grotesk font-bold flex items-center gap-1" style={{ color: 'var(--imx-accent)' }}>
                        Voir <ArrowRight size={11} />
                      </span>
                    </div>
                  </Link>
                ))}
                <Link to="/pro/locataires" className="flex items-center justify-center gap-1.5 text-[12px] font-bold pt-1" style={{ color: 'var(--imx-accent)' }}>
                  Voir les dossiers locataires <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              <div className="rounded-[20px] p-6 flex flex-col items-center text-center" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--imx-accent-xlight)' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--imx-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-nunito font-black text-[15px] text-[var(--imx-text-primary)]">Tout est à jour</p>
                <p className="font-space-grotesk text-[12px] mt-1" style={{ color: 'var(--imx-text-secondary)' }}>Aucun retard de loyer ce mois-ci.</p>
              </div>
            )}
          </section>

        </div>

      </PullToRefresh>



      <BottomNav />
    </div>
  );
};

export default Dashboard;
