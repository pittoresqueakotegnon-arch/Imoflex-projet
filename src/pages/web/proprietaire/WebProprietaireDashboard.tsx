import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Plus, Wallet, Users, AlertTriangle,
  ArrowUpRight, ClipboardList, RefreshCw, CheckCircle2,
  TrendingUp, Clock
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../../../hooks/useAuth';
import { useWallet } from '../../../hooks/useWallet';
import { supabase } from '../../../lib/supabase';
import { formatMontant, getCurrentMonth, getMonthName } from '../../../lib/utils';

/* ─────────────────────────────────────────────────────────────
   WebProprietaireDashboard — Dashboard web propriétaire
   KPIs + graphe loyers Recharts + alertes + actions rapides
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
        .eq('owner_id', profile.id)
        .eq('status', 'publiee');

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasNoData = !data || (data.totalListings === 0 && data.propertiesStats.total === 0);
  const collectionRate = data && data.currentMonth.expected > 0
    ? Math.round((data.currentMonth.received / data.currentMonth.expected) * 100)
    : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
              Espace Propriétaire
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
            Bonjour, {profile?.full_name?.split(' ')[0] || 'Propriétaire'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--imx-text-muted)' }}>
            Supervision de vos biens locatifs, encaissements et versements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); fetchData(); }}
            disabled={refreshing}
            title="Rafraîchir les données"
            className="p-2.5 rounded-xl border transition-colors hover:bg-[var(--imx-surface-2)]"
            style={{ borderColor: 'var(--imx-border)', color: 'var(--imx-text-muted)' }}
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link
            to="/web/pro/publier"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white shadow-md transition-all hover:opacity-95 hover:shadow-lg"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Plus size={16} /> Publier un bien
          </Link>
        </div>
      </div>

      {/* Onboarding si aucune annonce */}
      {hasNoData && (
        <div
          className="text-center py-12 px-6 rounded-2xl border"
          style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
        >
          <Building2 size={48} className="mx-auto mb-4 opacity-30 text-[var(--imx-accent)]" />
          <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--imx-text-primary)' }}>
            Commencez à gérer vos logements
          </h2>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--imx-text-muted)' }}>
            Publiez vos biens immobiliers sur ImoFlex pour trouver des locataires fiables, automatiser le suivi des loyers et percevoir vos versements par Mobile Money.
          </p>
          <Link
            to="/web/pro/publier"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white shadow-md transition-transform hover:-translate-y-0.5"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Plus size={16} /> Créer ma première annonce
          </Link>
        </div>
      )}

      {/* KPI grid & overview */}
      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Wallet card (large) */}
            <div
              className="p-6 rounded-2xl md:col-span-2 text-white shadow-sm flex flex-col justify-between relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #6D28D9 0%, #7B3FE4 50%, #9333EA 100%)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-white/90 text-xs font-bold uppercase tracking-wider">
                  <Wallet size={16} /> Portefeuille ImoFlex
                </div>
                <Link
                  to="/web/pro/wallet"
                  className="text-xs font-semibold px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex items-center gap-1 text-white"
                >
                  Gérer les retraits <ArrowUpRight size={13} />
                </Link>
              </div>

              <div>
                <p className="text-xs text-white/70 font-medium">Solde disponible au retrait</p>
                <div className="flex items-baseline flex-wrap gap-2 mt-1">
                  <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white" style={{ fontFamily: 'Sora' }}>
                    {wallet ? new Intl.NumberFormat('fr-FR').format(wallet.available_balance || 0) : '—'}
                  </span>
                  {wallet && <span className="text-sm font-bold text-white/80">FCFA</span>}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/15 flex items-center justify-between text-xs text-white/80">
                <span>Total encaissé historique :</span>
                <span className="font-bold text-white tracking-wide">
                  {wallet ? formatMontant(wallet.total_earned) : '—'}
                </span>
              </div>
            </div>

            {/* Total biens */}
            <div
              className="p-5 rounded-2xl border flex flex-col justify-between"
              style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                <span className="uppercase tracking-wider">Patrimoine</span>
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-[var(--imx-accent)] flex items-center justify-center">
                  <Building2 size={16} />
                </div>
              </div>
              <div className="my-2">
                <p className="text-3xl font-black" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                  {data.propertiesStats.total}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--imx-text-muted)' }}>
                  bien{data.propertiesStats.total > 1 ? 's' : ''} enregistré{data.propertiesStats.total > 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-xs pt-3 border-t flex justify-between font-medium" style={{ borderColor: 'var(--imx-border)' }}>
                <span className="text-emerald-600">{data.propertiesStats.occupied} occupé{data.propertiesStats.occupied > 1 ? 's' : ''}</span>
                <span className="text-gray-400">{data.propertiesStats.available} libre{data.propertiesStats.available > 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Retards */}
            <div
              className="p-5 rounded-2xl border flex flex-col justify-between"
              style={{
                background: data.alerts.length > 0 ? '#FEF2F2' : 'var(--imx-surface)',
                borderColor: data.alerts.length > 0 ? '#FECACA' : 'var(--imx-border)',
              }}
            >
              <div className="flex items-center justify-between text-xs font-semibold" style={{ color: data.alerts.length > 0 ? '#DC2626' : 'var(--imx-text-muted)' }}>
                <span className="uppercase tracking-wider">Loyers en retard</span>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: data.alerts.length > 0 ? '#FEE2E2' : 'var(--imx-surface-2)', color: data.alerts.length > 0 ? '#DC2626' : 'var(--imx-text-muted)' }}
                >
                  <AlertTriangle size={16} />
                </div>
              </div>
              <div className="my-2">
                <p className="text-3xl font-black" style={{ color: data.alerts.length > 0 ? '#DC2626' : 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                  {data.alerts.length}
                </p>
                <p className="text-xs mt-1" style={{ color: data.alerts.length > 0 ? '#991B1B' : 'var(--imx-text-muted)' }}>
                  {data.alerts.length === 0 ? 'Tous les loyers sont à jour' : 'Attention requise'}
                </p>
              </div>
              <div className="text-xs pt-3 border-t flex justify-between font-medium" style={{ borderColor: data.alerts.length > 0 ? '#FCA5A5' : 'var(--imx-border)' }}>
                <span style={{ color: data.alerts.length > 0 ? '#DC2626' : 'var(--imx-text-muted)' }}>
                  {data.alerts.length > 0 ? 'Paiements échus' : 'Zéro impayé'}
                </span>
                {data.alerts.length > 0 && (
                  <Link to="/web/pro/locataires?filter=retard" className="font-bold underline text-red-700">Détails</Link>
                )}
              </div>
            </div>
          </div>

          {/* Current month performance summary */}
          <div
            className="p-6 rounded-2xl border shadow-sm"
            style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-bold text-base text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
                  Recouvrement du mois en cours
                </h3>
                <p className="text-xs text-[var(--imx-text-muted)]">
                  Suivi des encaissements sur les baux actifs
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">
                  {collectionRate}% collecté
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-6">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(collectionRate, 100)}%`,
                  background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t" style={{ borderColor: 'var(--imx-border)' }}>
              <div>
                <p className="text-xs text-[var(--imx-text-muted)] font-medium mb-1">Montant total attendu</p>
                <p className="text-xl font-black text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
                  {formatMontant(data.currentMonth.expected)}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--imx-text-muted)] font-medium mb-1 flex items-center gap-1">
                  <CheckCircle2 size={13} className="text-emerald-500" /> Déjà encaissé
                </p>
                <p className="text-xl font-black text-emerald-600" style={{ fontFamily: 'Sora' }}>
                  {formatMontant(data.currentMonth.received)}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--imx-text-muted)] font-medium mb-1 flex items-center gap-1">
                  <Clock size={13} className="text-amber-500" /> Reste à recouvrer
                </p>
                <p
                  className="text-xl font-black"
                  style={{
                    color: data.currentMonth.pending > 0 ? '#D97706' : '#10B981',
                    fontFamily: 'Sora'
                  }}
                >
                  {formatMontant(data.currentMonth.pending)}
                </p>
              </div>
            </div>
          </div>

          {/* Graphe Recharts de rentrées des loyers */}
          <div
            className="p-6 rounded-2xl border shadow-sm"
            style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-base text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
                  Évolution des loyers encaissés
                </h3>
                <p className="text-xs text-[var(--imx-text-muted)]">
                  Total des montants réglés par vos locataires sur les 6 derniers mois
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-purple-600 font-semibold bg-purple-50 px-3 py-1 rounded-full">
                <TrendingUp size={14} /> Recettes régulières
              </div>
            </div>

            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--imx-border)" opacity={0.6} />
                  <XAxis
                    dataKey="shortName"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--imx-text-muted)', fontSize: 12, fontWeight: 500 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--imx-text-muted)', fontSize: 11 }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    width={45}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(123, 63, 228, 0.05)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white p-3 rounded-xl border shadow-lg text-xs" style={{ borderColor: 'var(--imx-border)' }}>
                            <p className="text-gray-500 font-medium mb-1">{payload[0].payload.shortName}</p>
                            <p className="text-sm font-black text-[var(--imx-accent)]" style={{ fontFamily: 'Sora' }}>
                              {formatMontant(payload[0].value as number)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="total"
                    fill="var(--imx-accent)"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Alertes loyers */}
          {data.alerts.length > 0 && (
            <div
              className="p-6 rounded-2xl border"
              style={{ background: '#FFF7ED', borderColor: '#FED7AA' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={18} className="text-amber-600" />
                <h3 className="font-bold text-sm text-amber-900" style={{ fontFamily: 'Sora' }}>
                  Loyers en attente de régularisation ({data.alerts.length})
                </h3>
              </div>
              <div className="space-y-2">
                {data.alerts.slice(0, 5).map(a => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-white/80 border border-amber-200"
                  >
                    <div>
                      <p className="font-bold text-sm text-gray-900">{a.propertyName}</p>
                      <p className="text-xs text-amber-700 font-medium mt-0.5">
                        Reliquat dû : <span className="font-bold">{formatMontant(a.amountDue)}</span>
                      </p>
                    </div>
                    <Link
                      to="/web/pro/locataires"
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors"
                    >
                      Voir le locataire
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick shortcuts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { to: '/web/pro/annonces', icon: <Building2 size={20} />, label: 'Mes annonces', count: data.totalListings, desc: 'Gérer les publications' },
              { to: '/web/pro/demandes', icon: <ClipboardList size={20} />, label: 'Demandes reçues', count: null, desc: 'Location & contacts' },
              { to: '/web/pro/locataires', icon: <Users size={20} />, label: 'Mes locataires', count: data.propertiesStats.occupied, desc: 'Baux & paiements' },
              { to: '/web/pro/wallet', icon: <Wallet size={20} />, label: 'Portefeuille', count: null, desc: 'Demander un retrait' },
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-col p-5 rounded-2xl border transition-all duration-200 hover:-translate-y-1 hover:shadow-md group"
                style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors group-hover:scale-105"
                    style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}
                  >
                    {item.icon}
                  </div>
                  {item.count !== null && (
                    <span className="text-lg font-black" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                      {item.count}
                    </span>
                  )}
                </div>
                <p className="font-bold text-sm text-[var(--imx-text-primary)]">{item.label}</p>
                <p className="text-xs text-[var(--imx-text-muted)] mt-0.5">{item.desc}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

