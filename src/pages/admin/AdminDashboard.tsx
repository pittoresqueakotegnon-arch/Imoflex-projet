import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Home, CreditCard, TrendingUp, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle, XCircle, AlertCircle, Wallet, Activity,
  Eye, ChevronRight, RefreshCw
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { formatMontant } from '../../lib/utils';
import { useToast } from '../../components/Toast';

// ─── Helpers ───────────────────────────────────────────────────────────────

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekStart() { return daysAgo(7); }
function monthStart() { return daysAgo(30); }

function fmtShortDate(isoStr: string) {
  const d = new Date(isoStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface KPIs {
  totalUsers: number;
  activeListings: number;
  pendingListings: number;
  pendingWithdrawals: number;
  paymentsToday: number;
  paymentsTodayVolume: number;
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  revenueTotal: number;
}

interface RevenueDataPoint {
  date: string;
  revenue: number;
  volume: number;
}

interface PendingListing {
  id: string;
  title: string;
  property_type: string;
  price: number;
  created_at: string;
  ownerName: string;
}

interface PendingWithdrawal {
  id: string;
  amount: number;
  created_at: string;
  ownerName: string;
  operator: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  user_id: string;
  details: Record<string, unknown>;
}

// ─── Sub-components ────────────────────────────────────────────────────────

const KPICard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  trend?: 'up' | 'down' | 'neutral';
  link?: string;
}> = ({ label, value, sub, icon, gradient, trend, link }) => {
  const inner = (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 border transition-all hover:scale-[1.01]"
      style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
    >
      <div className="flex items-start justify-between">
        <div
          className="p-2.5 rounded-xl text-white"
          style={{ background: gradient }}
        >
          {icon}
        </div>
        {trend === 'up' && <ArrowUpRight size={16} className="text-emerald-400 mt-1" />}
        {trend === 'down' && <ArrowDownRight size={16} className="text-red-400 mt-1" />}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>{label}</p>
        <p className="text-2xl font-bold" style={{ color: 'var(--adm-text)' }}>{value}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--adm-text-dim)' }}>{sub}</p>}
      </div>
    </div>
  );

  return link ? (
    <Link to={link} className="block">{inner}</Link>
  ) : (
    inner
  );
};

const CustomTooltip: React.FC<{ active?: boolean; payload?: Array<{ value: number }>; label?: string }> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-xl p-3 text-xs shadow-xl border"
        style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }}
      >
        <p style={{ color: 'var(--adm-text-muted)' }} className="mb-1">{label}</p>
        <p className="text-violet-500 font-bold">{formatMontant(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

const actionLabel: Record<string, string> = {
  connexion: '🔐 Connexion',
  inscription: '🆕 Inscription',
  publication_annonce: '📢 Annonce publiée',
  paiement: '💸 Paiement reçu',
  retrait_demande: '💰 Retrait demandé',
  moderation_approuve: '✅ Annonce approuvée',
  moderation_rejete: '❌ Annonce rejetée',
  suspension: '🚫 Compte suspendu',
};

// ─── Main Component ────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
  const { showToast } = useToast();

  const [kpis, setKpis] = useState<KPIs>({
    totalUsers: 0, activeListings: 0, pendingListings: 0,
    pendingWithdrawals: 0, paymentsToday: 0, paymentsTodayVolume: 0,
    revenueToday: 0, revenueWeek: 0, revenueMonth: 0, revenueTotal: 0,
  });

  const [revenueChart, setRevenueChart] = useState<RevenueDataPoint[]>([]);
  const [pendingListings, setPendingListings] = useState<PendingListing[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ── Parallel fetches ──
      const [
        usersRes,
        activeListingsRes,
        pendingListingsRes,
        withdrawalsRes,
        paymentsTodayRes,
        paymentsWeekRes,
        paymentsMonthRes,
        paymentsAllRes,
        pendingListingDetailRes,
        withdrawalDetailRes,
        auditRes,
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'publiee'),
        supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'en_attente'),
        supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'en_traitement'),
        supabase.from('payments').select('amount, commission_amount').eq('status', 'valide').gte('validated_at', todayStart()),
        supabase.from('payments').select('commission_amount').eq('status', 'valide').gte('validated_at', weekStart()),
        supabase.from('payments').select('commission_amount').eq('status', 'valide').gte('validated_at', monthStart()),
        supabase.from('payments').select('amount, commission_amount').eq('status', 'valide'),
        supabase.from('listings')
          .select('id, title, property_type, price, created_at, owner_id')
          .eq('status', 'en_attente')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('withdrawals')
          .select('id, amount, created_at, owner_id, operator')
          .eq('status', 'en_traitement')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('audit_logs')
          .select('id, action, entity_type, created_at, user_id, details')
          .order('created_at', { ascending: false })
          .limit(12),
      ]);

      // ── Process chart data (last 30 days) ──
      const last30 = paymentsAllRes.data?.filter(p =>
        new Date(p.validated_at || '') >= new Date(monthStart())
      ) || [];

      // Build daily buckets
      const bucketMap: Record<string, { revenue: number; volume: number }> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
        bucketMap[fmtShortDate(d.toISOString())] = { revenue: 0, volume: 0 };
      }
      (paymentsAllRes.data || []).forEach((p: { amount?: number; commission_amount?: number; validated_at?: string }) => {
        const key = fmtShortDate(p.validated_at || new Date().toISOString());
        if (bucketMap[key]) {
          bucketMap[key].revenue += p.commission_amount || 0;
          bucketMap[key].volume += p.amount || 0;
        }
      });
      setRevenueChart(Object.entries(bucketMap).map(([date, v]) => ({ date, ...v })));

      // ── KPIs ──
      const todayPayments = paymentsTodayRes.data || [];
      const weekPayments = paymentsWeekRes.data || [];
      const monthPayments = paymentsMonthRes.data || [];
      const allPayments = paymentsAllRes.data || [];

      setKpis({
        totalUsers: usersRes.count || 0,
        activeListings: activeListingsRes.count || 0,
        pendingListings: pendingListingsRes.count || 0,
        pendingWithdrawals: withdrawalsRes.count || 0,
        paymentsToday: todayPayments.length,
        paymentsTodayVolume: todayPayments.reduce((s: number, p: { amount?: number }) => s + (p.amount || 0), 0),
        revenueToday: todayPayments.reduce((s: number, p: { commission_amount?: number }) => s + (p.commission_amount || 0), 0),
        revenueWeek: weekPayments.reduce((s: number, p: { commission_amount?: number }) => s + (p.commission_amount || 0), 0),
        revenueMonth: monthPayments.reduce((s: number, p: { commission_amount?: number }) => s + (p.commission_amount || 0), 0),
        revenueTotal: allPayments.reduce((s: number, p: { commission_amount?: number }) => s + (p.commission_amount || 0), 0),
      });

      // ── Pending listings (fetch owner names) ──
      const plData = pendingListingDetailRes.data || [];
      const ownerIds = [...new Set(plData.map((l: { owner_id: string }) => l.owner_id).filter(Boolean))];
      let ownerMap: Record<string, string> = {};
      if (ownerIds.length > 0) {
        const { data: ownerData } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', ownerIds);
        ownerData?.forEach((u: { id: string; full_name: string }) => { ownerMap[u.id] = u.full_name; });
      }

      setPendingListings(plData.map((l: { id: string; title: string; property_type: string; price: number; created_at: string; owner_id: string }) => ({
        id: l.id,
        title: l.title,
        property_type: l.property_type,
        price: l.price,
        created_at: l.created_at,
        ownerName: ownerMap[l.owner_id] || 'Propriétaire',
      })));

      // ── Pending withdrawals (fetch owner names) ──
      const wData = withdrawalDetailRes.data || [];
      const wOwnerIds = [...new Set(wData.map((w: { owner_id: string }) => w.owner_id).filter(Boolean))];
      let wOwnerMap: Record<string, string> = {};
      if (wOwnerIds.length > 0) {
        const { data: wOwnerData } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', wOwnerIds);
        wOwnerData?.forEach((u: { id: string; full_name: string }) => { wOwnerMap[u.id] = u.full_name; });
      }

      setPendingWithdrawals(wData.map((w: { id: string; amount: number; created_at: string; owner_id: string; operator: string }) => ({
        id: w.id,
        amount: w.amount,
        created_at: w.created_at,
        ownerName: wOwnerMap[w.owner_id] || 'Propriétaire',
        operator: w.operator || 'N/A',
      })));

      setAuditLogs(auditRes.data || []);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      showToast('Erreur de chargement du tableau de bord', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { 
    fetchAll(); 

    // Écouter les changements en temps réel sur les tables clés
    const usersChannel = supabase
      .channel('dashboard-users')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchAll();
      })
      .subscribe();

    const listingsChannel = supabase
      .channel('dashboard-listings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        fetchAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(listingsChannel);
    };
  }, [fetchAll]);

  // ─── Skeleton ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-8 bg-white/5 rounded-xl w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-36 bg-white/5 rounded-2xl" />)}
        </div>
        <div className="h-56 bg-white/5 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-white/5 rounded-2xl" />
          <div className="h-64 bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
            Tableau de bord
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--adm-text-muted)' }}>
            Actualisé à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border"
          style={{ color: 'var(--adm-accent)', borderColor: 'var(--adm-border)', background: 'var(--adm-surface)' }}
        >
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {/* ── Revenue Highlight ───────────────────────────────────────────── */}
      <div
        className="rounded-xl p-6 border relative overflow-hidden"
        style={{ background: 'var(--adm-banner-bg)', borderColor: 'var(--adm-border-focus)' }}
      >
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5 blur-3xl"
          style={{ background: 'radial-gradient(circle, #7C3AED, transparent)' }} />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--adm-text-muted)' }}>
              💰 Revenus ImoFlex (commissions prélevées)
            </p>
            <p className="text-4xl font-bold mb-1" style={{ color: 'var(--adm-text)' }}>{formatMontant(kpis.revenueTotal)}</p>
            <p className="text-sm" style={{ color: 'var(--adm-text-dim)' }}>Depuis le lancement</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>Aujourd'hui</p>
              <p className="text-emerald-500 text-xl font-bold">{formatMontant(kpis.revenueToday)}</p>
            </div>
            <div className="w-px" style={{ background: 'var(--adm-border)' }} />
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>Cette semaine</p>
              <p className="text-violet-500 text-xl font-bold">{formatMontant(kpis.revenueWeek)}</p>
            </div>
            <div className="w-px" style={{ background: 'var(--adm-border)' }} />
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>Ce mois</p>
              <p className="text-sky-500 text-xl font-bold">{formatMontant(kpis.revenueMonth)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Utilisateurs"
          value={kpis.totalUsers.toString()}
          sub="inscrits"
          icon={<Users size={18} />}
          gradient="linear-gradient(135deg, #6366f1, #8b5cf6)"
          trend="up"
          link="/admin/utilisateurs"
        />
        <KPICard
          label="Annonces actives"
          value={kpis.activeListings.toString()}
          sub={`+ ${kpis.pendingListings} en attente`}
          icon={<Home size={18} />}
          gradient="linear-gradient(135deg, #0ea5e9, #6366f1)"
          trend="neutral"
          link="/admin/annonces"
        />
        <KPICard
          label="Paiements du jour"
          value={kpis.paymentsToday.toString()}
          sub={formatMontant(kpis.paymentsTodayVolume) + ' transités'}
          icon={<CreditCard size={18} />}
          gradient="linear-gradient(135deg, #10b981, #059669)"
          trend={kpis.paymentsToday > 0 ? 'up' : 'neutral'}
          link="/admin/transactions"
        />
        <KPICard
          label="Retraits en attente"
          value={kpis.pendingWithdrawals.toString()}
          sub={kpis.pendingWithdrawals > 0 ? 'à traiter' : 'Aucun en attente'}
          icon={<Wallet size={18} />}
          gradient="linear-gradient(135deg, #f59e0b, #d97706)"
          trend={kpis.pendingWithdrawals > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* ── Revenue Chart ────────────────────────────────────────────────── */}
      <div
        className="rounded-xl p-6 border"
        style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-semibold text-base" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
              Revenus ImoFlex — 30 derniers jours
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--adm-text-muted)' }}>Commissions prélevées par jour</p>
          </div>
          <TrendingUp size={18} className="text-violet-400" />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={revenueChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A855F7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#A855F7" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#8B7BB5', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fill: '#8B7BB5', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v > 0 ? `${Math.round(v / 1000)}k` : '0'}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#A855F7"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Actions + Activités ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Annonces en attente */}
        <div
          className="rounded-xl p-5 border flex flex-col"
          style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-500" />
              <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
                Annonces à valider
              </h2>
              {kpis.pendingListings > 0 && (
                <span className="bg-amber-500/15 text-amber-500 text-xs font-bold px-2 py-0.5 rounded-full">
                  {kpis.pendingListings}
                </span>
              )}
            </div>
            <Link to="/admin/annonces" className="text-xs flex items-center gap-1" style={{ color: 'var(--adm-accent)' }}>
              Tout voir <ChevronRight size={12} />
            </Link>
          </div>

          {pendingListings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle size={28} className="text-emerald-500 mb-2" />
              <p className="text-sm font-medium" style={{ color: 'var(--adm-text)' }}>Tout est à jour !</p>
              <p className="text-xs mt-1" style={{ color: 'var(--adm-text-dim)' }}>Aucune annonce en attente</p>
            </div>
          ) : (
            <div className="space-y-1.5 flex-1">
              {pendingListings.map(l => (
                <div
                  key={l.id}
                  className="flex items-center justify-between p-3 rounded-lg border transition-colors"
                  style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Home size={13} className="text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--adm-text)' }}>{l.title}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--adm-text-dim)' }}>{l.ownerName} · {formatMontant(l.price)}/mois</p>
                    </div>
                  </div>
                  <Link
                    to="/admin/annonces"
                    className="flex-shrink-0 ml-2 text-xs px-2.5 py-1 rounded-md text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                  >
                    Modérer
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Retraits en attente */}
        <div
          className="rounded-xl p-5 border flex flex-col"
          style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-sky-500" />
              <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
                Retraits en attente
              </h2>
              {kpis.pendingWithdrawals > 0 && (
                <span className="bg-sky-500/15 text-sky-500 text-xs font-bold px-2 py-0.5 rounded-full">
                  {kpis.pendingWithdrawals}
                </span>
              )}
            </div>
            <Link to="/admin/transactions" className="text-xs flex items-center gap-1" style={{ color: 'var(--adm-accent)' }}>
              Tout voir <ChevronRight size={12} />
            </Link>
          </div>

          {pendingWithdrawals.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle size={28} className="text-emerald-500 mb-2" />
              <p className="text-sm font-medium" style={{ color: 'var(--adm-text)' }}>Aucun retrait en attente</p>
              <p className="text-xs mt-1" style={{ color: 'var(--adm-text-dim)' }}>Tous les retraits ont été traités</p>
            </div>
          ) : (
            <div className="space-y-1.5 flex-1">
              {pendingWithdrawals.map(w => (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-3 rounded-lg border transition-colors"
                  style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                      <Wallet size={13} className="text-sky-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--adm-text)' }}>{formatMontant(w.amount)}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--adm-text-dim)' }}>{w.ownerName} · {w.operator?.toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="flex-shrink-0 ml-2 text-xs px-2.5 py-1 rounded-md text-sky-400 bg-sky-500/10">
                    En traitement
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Flux d'activités récentes ────────────────────────────────────── */}
      <div
        className="rounded-xl p-5 border"
        style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-violet-500" />
            <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
              Activités récentes
            </h2>
          </div>
          <Link to="/admin/logs" className="text-xs flex items-center gap-1" style={{ color: 'var(--adm-accent)' }}>
            Voir tous les logs <ChevronRight size={12} />
          </Link>
        </div>

        {auditLogs.length === 0 ? (
          <div className="text-center py-8">
            <Eye size={28} className="text-violet-300 mx-auto mb-2" style={{ opacity: 0.3 }} />
            <p className="text-sm" style={{ color: 'var(--adm-text-muted)' }}>Aucune activité enregistrée</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--adm-divider)' }}>
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 px-2 py-2.5 transition-colors"
                style={{ cursor: 'default' }}
              >
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--adm-accent)' }} />
                <p className="text-sm flex-1 truncate" style={{ color: 'var(--adm-text)' }}>
                  {actionLabel[log.action] || `🔹 ${log.action}`}
                </p>
                <p className="text-xs flex-shrink-0" style={{ color: 'var(--adm-text-dim)' }}>
                  {new Date(log.created_at).toLocaleString('fr-FR', {
                    month: 'short', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminDashboard;
