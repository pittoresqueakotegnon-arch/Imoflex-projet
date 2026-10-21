import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Plus, Wallet, Users, AlertTriangle,
  ArrowUpRight, ClipboardList, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useWallet } from '../../../hooks/useWallet';
import { supabase } from '../../../lib/supabase';
import { formatMontant, getCurrentMonth, getMonthName } from '../../../lib/utils';

/* ─────────────────────────────────────────────────────────────
   WebProprietaireDashboard — Dashboard web propriétaire
   KPIs + graphe loyers + alertes + actions rapides
───────────────────────────────────────────────────────────── */

interface DashboardData {
  totalListings: number;
  propertiesStats: { total: number; occupied: number; available: number };
  currentMonth: { expected: number; received: number; pending: number };
  alerts: { id: string; leaseId: string; propertyName: string; amountDue: number }[];
  chartData: { shortName: string; total: number }[];
}

export default function WebProprietaireDashboard() {
  const { profile } = useAuth();
  const { wallet } = useWallet(profile?.id);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data: properties } = await supabase
        .from('properties')
        .select('id, name, monthly_rent')
        .eq('owner_id', profile.id)
        .eq('is_active', true);

      const { count: listingsCount } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', profile.id);

      const propertyIds = (properties || []).map(p => p.id);
      let leases: any[] = [];
      let leaseIds: string[] = [];

      if (propertyIds.length > 0) {
        const { data: activeLeases } = await supabase
          .from('leases')
          .select('id, property_id')
          .in('property_id', propertyIds)
          .eq('status', 'actif');
        leases = activeLeases || [];
        leaseIds = leases.map(l => l.id);
      }

      const { month: currM, year: currY } = getCurrentMonth();
      const chartMonths = Array.from({ length: 6 }, (_, i) => {
        let m = currM - (5 - i);
        let y = currY;
        if (m <= 0) { m += 12; y--; }
        return { month: m, year: y, shortName: getMonthName(m, y).substring(0, 3).toUpperCase() };
      });

      let currentMonthExpected = 0;
      let currentMonthReceived = 0;
      const rawChart: Record<string, number> = {};
      chartMonths.forEach(cm => rawChart[`${cm.year}-${cm.month}`] = 0);
      const alerts: DashboardData['alerts'] = [];

      if (leaseIds.length > 0) {
        const orConditions = chartMonths.map(cm => `and(period_month.eq.${cm.month},period_year.eq.${cm.year})`).join(',');
        const { data: rentPeriods } = await supabase
          .from('rent_periods')
          .select('id, lease_id, period_month, period_year, amount_due, amount_paid, status')
          .in('lease_id', leaseIds)
          .or(orConditions);

        (rentPeriods || []).forEach(rp => {
          const key = `${rp.period_year}-${rp.period_month}`;
          if (rawChart[key] !== undefined) rawChart[key] += rp.amount_paid || 0;
          if (rp.period_month === currM && rp.period_year === currY) {
            currentMonthExpected += rp.amount_due || 0;
            currentMonthReceived += rp.amount_paid || 0;
          }
          const isCurrentOrPast = rp.period_year < currY || (rp.period_year === currY && rp.period_month <= currM);
          if (isCurrentOrPast && (rp.status === 'retard' || (rp.status === 'en_cours' && rp.amount_paid < rp.amount_due))) {
            const lease = leases.find(l => l.id === rp.lease_id);
            const prop = (properties || []).find(p => p.id === lease?.property_id);
            if (prop) alerts.push({ id: rp.id, leaseId: rp.lease_id, propertyName: prop.name, amountDue: rp.amount_due - rp.amount_paid });
          }
        });
      }

      setData({
        totalListings: listingsCount || 0,
        propertiesStats: { total: propertyIds.length, occupied: leases.length, available: propertyIds.length - leases.length },
        currentMonth: { expected: currentMonthExpected, received: currentMonthReceived, pending: Math.max(0, currentMonthExpected - currentMonthReceived) },
        alerts,
        chartData: chartMonths.map(cm => ({ shortName: cm.shortName, total: rawChart[`${cm.year}-${cm.month}`] || 0 })),
      });
    } catch (err) {
      console.error('[WebProprietaireDashboard] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxChart = Math.max(...(data?.chartData.map(c => c.total) || [1]), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasNoData = !data || (data.totalListings === 0 && data.propertiesStats.total === 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
            Bonjour, {profile?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--imx-text-muted)' }}>
            Tableau de bord propriétaire
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); fetchData(); }}
            disabled={refreshing}
            className="p-2.5 rounded-xl transition-colors hover:bg-[var(--imx-surface-2)]"
            style={{ color: 'var(--imx-text-muted)' }}
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link
            to="/web/pro/publier"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Plus size={16} /> Nouvelle annonce
          </Link>
        </div>
      </div>

      {/* Onboarding */}
      {hasNoData && (
        <div
          className="text-center py-12 rounded-2xl mb-6"
          style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
        >
          <Building2 size={48} className="mx-auto mb-4 opacity-30" style={{ color: 'var(--imx-text-muted)' }} />
          <p className="font-bold text-[17px] mb-2" style={{ color: 'var(--imx-text-primary)' }}>
            Publiez votre première annonce
          </p>
          <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--imx-text-muted)' }}>
            Ajoutez votre bien sur ImoFlex pour commencer à recevoir des demandes et gérer vos loyers.
          </p>
          <Link
            to="/web/pro/publier"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Plus size={16} /> Publier un bien
          </Link>
        </div>
      )}

      {/* KPI grid */}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Wallet balance */}
            <div
              className="p-5 rounded-2xl col-span-2"
              style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)', color: '#fff' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white/80 text-sm">
                  <Wallet size={16} /> Solde disponible
                </div>
                <Link to="/web/pro/wallet" className="text-xs font-medium text-white/80 hover:text-white flex items-center gap-1">
                  Voir <ArrowUpRight size={12} />
                </Link>
              </div>
              <p className="text-3xl font-black" style={{ fontFamily: 'Sora' }}>
                {wallet ? formatMontant(wallet.available_balance) : '—'}
              </p>
              {wallet && (
                <p className="text-sm text-white/70 mt-1">
                  Total encaissé: {formatMontant(wallet.total_earned)}
                </p>
              )}
            </div>

            {/* Properties */}
            <div className="p-5 rounded-2xl" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
              <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--imx-text-muted)' }}>
                <Building2 size={16} />
                <span className="text-sm">Biens</span>
              </div>
              <p className="text-3xl font-black" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                {data.propertiesStats.total}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--imx-text-muted)' }}>
                {data.propertiesStats.occupied} occupé{data.propertiesStats.occupied > 1 ? 's' : ''} · {data.propertiesStats.available} libre{data.propertiesStats.available > 1 ? 's' : ''}
              </p>
            </div>

            {/* Alerts */}
            <div
              className="p-5 rounded-2xl"
              style={{
                background: data.alerts.length > 0 ? '#FEF2F2' : 'var(--imx-surface)',
                border: `1px solid ${data.alerts.length > 0 ? '#FECACA' : 'var(--imx-border)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-3" style={{ color: data.alerts.length > 0 ? '#EF4444' : 'var(--imx-text-muted)' }}>
                <AlertTriangle size={16} />
                <span className="text-sm">Loyers en retard</span>
              </div>
              <p className="text-3xl font-black" style={{ color: data.alerts.length > 0 ? '#EF4444' : 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                {data.alerts.length}
              </p>
            </div>
          </div>

          {/* Current month summary */}
          <div
            className="grid grid-cols-3 gap-4 p-5 rounded-2xl mb-6"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
          >
            <div className="text-center">
              <p className="text-xs mb-1" style={{ color: 'var(--imx-text-muted)' }}>Attendu ce mois</p>
              <p className="text-lg font-black" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                {formatMontant(data.currentMonth.expected)}
              </p>
            </div>
            <div className="text-center border-x" style={{ borderColor: 'var(--imx-border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--imx-text-muted)' }}>Reçu</p>
              <p className="text-lg font-black" style={{ color: '#10B981', fontFamily: 'Sora' }}>
                {formatMontant(data.currentMonth.received)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs mb-1" style={{ color: 'var(--imx-text-muted)' }}>Restant</p>
              <p className="text-lg font-black" style={{ color: data.currentMonth.pending > 0 ? '#F59E0B' : '#10B981', fontFamily: 'Sora' }}>
                {formatMontant(data.currentMonth.pending)}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div
            className="p-5 rounded-2xl mb-6"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
          >
            <h3 className="font-bold text-sm mb-4" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
              Loyers encaissés — 6 derniers mois
            </h3>
            <div className="flex items-end gap-2 h-32">
              {data.chartData.map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-lg transition-all duration-500"
                    style={{
                      height: `${maxChart > 0 ? (c.total / maxChart) * 100 : 0}%`,
                      minHeight: c.total > 0 ? '4px' : '0',
                      background: i === data.chartData.length - 1
                        ? 'var(--imx-accent)'
                        : 'rgba(123,63,228,0.3)',
                    }}
                  />
                  <span className="text-[10px]" style={{ color: 'var(--imx-text-muted)' }}>{c.shortName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          {data.alerts.length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold text-sm mb-3" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
                ⚠️ Loyers en attente
              </h3>
              <div className="space-y-2">
                {data.alerts.slice(0, 5).map(a => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
                  >
                    <div>
                      <p className="font-medium text-sm" style={{ color: '#991B1B' }}>{a.propertyName}</p>
                      <p className="text-xs" style={{ color: '#EF4444' }}>Impayé : {formatMontant(a.amountDue)}</p>
                    </div>
                    <Link to={`/pro/bail/${a.leaseId}`} className="text-xs font-medium" style={{ color: '#EF4444' }}>
                      Voir →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { to: '/web/pro/annonces', icon: <Building2 size={20} />, label: 'Mes annonces', count: data.totalListings },
              { to: '/web/pro/demandes', icon: <ClipboardList size={20} />, label: 'Demandes', count: null },
              { to: '/web/pro/locataires', icon: <Users size={20} />, label: 'Locataires', count: data.propertiesStats.occupied },
              { to: '/web/pro/wallet', icon: <Wallet size={20} />, label: 'Wallet', count: null },
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl text-center transition-all hover:-translate-y-0.5"
                style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}
                >
                  {item.icon}
                </div>
                <p className="text-xs font-medium" style={{ color: 'var(--imx-text-secondary)' }}>{item.label}</p>
                {item.count !== null && (
                  <span className="text-lg font-black" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                    {item.count}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
