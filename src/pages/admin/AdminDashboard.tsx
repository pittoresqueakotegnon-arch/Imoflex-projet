import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Home, CreditCard, TrendingUp, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle, AlertCircle, Wallet, Activity,
  Eye, ChevronRight, RefreshCw, Calendar, FileText,
  Zap, AlertTriangle, BarChart2, Minus,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useAdminMetrics, PeriodKey } from '../../hooks/useAdminMetrics';
import { formatMontant } from '../../lib/utils';

// ─── Helpers ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today',      label: "Aujourd'hui" },
  { key: '7d',         label: '7 jours'     },
  { key: '30d',        label: '30 jours'    },
  { key: 'month',      label: 'Ce mois'     },
  { key: 'prev_month', label: 'Mois préc.'  },
];

const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  connexion:            { icon: '🔐', label: 'Connexion',           color: '#6366f1' },
  inscription:          { icon: '🆕', label: 'Nouvelle inscription', color: '#10b981' },
  publication_annonce:  { icon: '📢', label: 'Annonce publiée',      color: '#A855F7' },
  paiement:             { icon: '💸', label: 'Paiement reçu',        color: '#14b8a6' },
  retrait_demande:      { icon: '💰', label: 'Retrait demandé',      color: '#f59e0b' },
  retrait_valide:       { icon: '✅', label: 'Retrait validé',       color: '#10b981' },
  moderation_approuve:  { icon: '✅', label: 'Annonce approuvée',    color: '#10b981' },
  moderation_rejete:    { icon: '❌', label: 'Annonce rejetée',      color: '#ef4444' },
  suspension:           { icon: '🚫', label: 'Compte suspendu',      color: '#f59e0b' },
  suppression_annonce:  { icon: '🗑️', label: 'Annonce supprimée',    color: '#ef4444' },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  delta?: number | null;
  link?: string;
  alert?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ label, value, sub, icon, gradient, delta, link, alert }) => {
  const inner = (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 border transition-all hover:scale-[1.01] hover:shadow-lg"
      style={{
        background: alert ? 'rgba(239,68,68,0.04)' : 'var(--adm-surface)',
        borderColor: alert ? 'rgba(239,68,68,0.3)' : 'var(--adm-border)',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-xl text-white" style={{ background: gradient }}>
          {icon}
        </div>
        {delta !== null && delta !== undefined && (
          <div className="flex items-center gap-1 text-xs font-semibold">
            {delta > 0  && <><ArrowUpRight   size={13} className="text-emerald-400" /><span className="text-emerald-400">+{delta}%</span></>}
            {delta < 0  && <><ArrowDownRight  size={13} className="text-red-400"     /><span className="text-red-400">{delta}%</span></>}
            {delta === 0 && <><Minus           size={13} className="text-slate-400"   /><span style={{ color: 'var(--adm-text-dim)' }}>stable</span></>}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>{label}</p>
        <p className="text-2xl font-bold" style={{ color: 'var(--adm-text)', fontFamily: 'Space Grotesk' }}>{value}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--adm-text-dim)' }}>{sub}</p>}
      </div>
    </div>
  );
  return link ? <Link to={link} className="block">{inner}</Link> : inner;
};

interface ChartTooltipProps { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }
const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }}>
      <p className="mb-1.5 font-medium" style={{ color: 'var(--adm-text-muted)' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-bold" style={{ color: p.name === 'revenue' ? '#A855F7' : '#14b8a6' }}>
          {p.name === 'revenue' ? 'Revenus : ' : 'Volume : '}{formatMontant(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

type ChartMode = 'revenue' | 'volume' | 'both';

const AdminDashboard: React.FC = () => {
  const {
    period, setPeriod,
    alerts, kpis, revenueChart,
    pendingListings, pendingWithdrawals, activity,
    systemHealth,
    loading, lastRefresh, refresh,
  } = useAdminMetrics();

  const [chartMode, setChartMode] = useState<ChartMode>('revenue');

  // Bandeau d'alertes
  const alertItems = [
    alerts.pendingWithdrawals > 0 && { label: `${alerts.pendingWithdrawals} retrait(s) en attente`,  color: '#f59e0b', icon: <Wallet size={12} />,       link: '/admin/transactions' },
    alerts.lateRentPeriods    > 0 && { label: `${alerts.lateRentPeriods} loyer(s) en retard`,        color: '#ef4444', icon: <AlertTriangle size={12} />, link: '/admin/transactions' },
    alerts.failedPayments     > 0 && { label: `${alerts.failedPayments} paiement(s) échoué(s)`,      color: '#ef4444', icon: <CreditCard size={12} />,    link: '/admin/transactions' },
  ].filter(Boolean) as { label: string; color: string; icon: React.ReactNode; link: string }[];

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse">
        <div className="h-8 bg-white/5 rounded-xl w-64" />
        <div className="h-10 bg-white/5 rounded-xl w-full" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-32 bg-white/5 rounded-2xl" />)}
        </div>
        <div className="h-64 bg-white/5 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-white/5 rounded-2xl" />
          <div className="h-64 bg-white/5 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Calcul des anomalies techniques
  // NB: thresholds différenciés par job — le daily ne tourne qu'une fois par 24h
  const CRON_THRESHOLDS_MINS: Record<string, number> = {
    'reconcile-payments-every-10-min':   20,       // 20 minutes
    'update-overdue-rent-periods-daily': 26 * 60,  // 26 heures
  };

  const isCronInactive = (jobName: string) => {
    const run = systemHealth?.cronHealth.find(c => c.jobname === jobName);
    if (!run) return true; // pas de run dans la fenêtre → stale
    const diffMins = (Date.now() - new Date(run.start_time).getTime()) / 60000;
    const maxMins = CRON_THRESHOLDS_MINS[jobName] ?? 30; // fallback 30 min
    return diffMins > maxMins || run.status !== 'succeeded';
  };

  const isReconcileBad    = isCronInactive('reconcile-payments-every-10-min');
  const isUpdateOverdueBad = isCronInactive('update-overdue-rent-periods-daily');

  const hasSystemAnomalies = systemHealth && (
    systemHealth.pendingPayments.length > 0 ||
    systemHealth.failedWithdrawals.length > 0 ||
    isReconcileBad || isUpdateOverdueBad
  );

  return (
    <div className="w-full space-y-5 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
            Tableau de bord
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--adm-text-muted)' }}>
            Actualisé à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtre de période */}
          <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface)' }}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: period === opt.key ? 'rgba(124,58,237,0.15)' : 'transparent',
                  color: period === opt.key ? 'var(--adm-accent)' : 'var(--adm-text-muted)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
            style={{ color: 'var(--adm-accent)', borderColor: 'var(--adm-border)', background: 'var(--adm-surface)' }}
          >
            <RefreshCw size={13} />
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Santé du Système ────────────────────────────────────────────────── */}
      {systemHealth && hasSystemAnomalies ? (
        <div
          className="flex flex-col gap-3 p-4 rounded-xl border text-sm"
          style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.3)' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className="text-red-400" />
            <h2 className="font-bold text-red-400">Santé du système : Anomalies techniques détectées</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Crons */}
            <div className="p-3 rounded-lg" style={{ background: 'var(--adm-surface-alt)' }}>
              <p className="font-bold mb-2" style={{ color: 'var(--adm-text)' }}>Tâches de fond (CRON)</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className={isReconcileBad ? 'text-red-400 font-medium' : 'text-emerald-400'}>Réconciliation paiements</span>
                  <span>{isReconcileBad ? '🔴 Échec/Retard' : '🟢 OK'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isUpdateOverdueBad ? 'text-red-400 font-medium' : 'text-emerald-400'}>Mise à jour retards loyers</span>
                  <span>{isUpdateOverdueBad ? '🔴 Échec/Retard' : '🟢 OK'}</span>
                </div>
              </div>
            </div>

            {/* Paiements bloqués */}
            <div className="p-3 rounded-lg" style={{ background: 'var(--adm-surface-alt)' }}>
              <p className="font-bold mb-2" style={{ color: 'var(--adm-text)' }}>Paiements suspects (&gt; 20m)</p>
              {systemHealth.pendingPayments.length === 0 ? (
                <p className="text-emerald-400 text-xs">🟢 Aucun paiement bloqué</p>
              ) : (
                <div className="space-y-1 text-xs">
                  {systemHealth.pendingPayments.slice(0, 3).map(p => (
                    <div key={p.id} className="flex justify-between items-center">
                      <span className="text-red-400 truncate max-w-[100px]">{p.tenant?.full_name || 'Inconnu'}</span>
                      <span style={{ color: 'var(--adm-text)' }}>{formatMontant(p.amount)}</span>
                    </div>
                  ))}
                  {systemHealth.pendingPayments.length > 3 && (
                    <p className="text-right italic" style={{ color: 'var(--adm-text-dim)' }}>+ {systemHealth.pendingPayments.length - 3} autre(s)</p>
                  )}
                </div>
              )}
            </div>

            {/* Retraits en échec/bloqués */}
            <div className="p-3 rounded-lg" style={{ background: 'var(--adm-surface-alt)' }}>
              <p className="font-bold mb-2" style={{ color: 'var(--adm-text)' }}>Retraits échoués/bloqués</p>
              {systemHealth.failedWithdrawals.length === 0 ? (
                <p className="text-emerald-400 text-xs">🟢 Aucun retrait bloqué</p>
              ) : (
                <div className="space-y-1 text-xs">
                  {systemHealth.failedWithdrawals.slice(0, 3).map(w => (
                    <div key={w.id} className="flex justify-between items-center">
                      <span className="text-red-400 truncate max-w-[100px]">{w.wallet?.owner?.full_name || 'Inconnu'}</span>
                      <span style={{ color: 'var(--adm-text)' }}>{formatMontant(w.amount)}</span>
                    </div>
                  ))}
                  {systemHealth.failedWithdrawals.length > 3 && (
                    <p className="text-right italic" style={{ color: 'var(--adm-text-dim)' }}>+ {systemHealth.failedWithdrawals.length - 3} autre(s)</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : systemHealth && !hasSystemAnomalies ? (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs"
          style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}
        >
          <Activity size={14} className="text-emerald-400" />
          <span className="font-semibold text-emerald-400">Santé du système :</span>
          <span style={{ color: 'var(--adm-text)' }}>Aucune anomalie technique détectée</span>
        </div>
      ) : null}

      {/* ── Bandeau d'alertes ───────────────────────────────────────────────── */}
      {alertItems.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl border text-xs"
          style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)' }}
        >
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          <span className="font-semibold text-red-400 mr-1">Alertes :</span>
          {alertItems.map((a, i) => (
            <Link key={i} to={a.link}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-opacity hover:opacity-80"
              style={{ background: `${a.color}18`, color: a.color, border: `1px solid ${a.color}35` }}
            >
              {a.icon}
              {a.label}
            </Link>
          ))}
        </div>
      )}

      {/* ── Bloc revenus highlight ──────────────────────────────────────────── */}
      <div
        className="rounded-xl p-6 border relative overflow-hidden"
        style={{ background: 'var(--adm-banner-bg)', borderColor: 'var(--adm-border-focus)' }}
      >
        <div className="absolute top-0 right-0 w-56 h-56 rounded-full opacity-5 blur-3xl"
          style={{ background: 'radial-gradient(circle, #7C3AED, transparent)' }} />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--adm-text-muted)' }}>
              💰 Revenus ImoFlex (commissions)
            </p>
            <div className="flex items-end gap-3">
              <p className="text-4xl font-bold" style={{ color: 'var(--adm-text)', fontFamily: 'Space Grotesk' }}>
                {formatMontant(kpis.revenueImoflex)}
              </p>
              {kpis.revenueDelta !== null && (
                <span className={`text-sm font-semibold mb-1 ${kpis.revenueDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {kpis.revenueDelta >= 0 ? '+' : ''}{kpis.revenueDelta}%
                </span>
              )}
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--adm-text-dim)' }}>
              {PERIOD_OPTIONS.find(p => p.key === period)?.label}
            </p>
          </div>
          <div className="flex gap-6 flex-wrap">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>Volume transité</p>
              <p className="text-sky-400 text-xl font-bold">{formatMontant(kpis.paymentsTotalVolume)}</p>
            </div>
            <div className="w-px hidden lg:block" style={{ background: 'var(--adm-border)' }} />
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>Transactions</p>
              <p className="text-violet-400 text-xl font-bold">{kpis.paymentsCount}</p>
            </div>
            <div className="w-px hidden lg:block" style={{ background: 'var(--adm-border)' }} />
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--adm-text-muted)' }}>Baux actifs</p>
              <p className="text-emerald-400 text-xl font-bold">{kpis.activeLeases}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid 8 cartes ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Utilisateurs" value={kpis.totalUsers} sub="inscrits"
          icon={<Users size={17} />} gradient="linear-gradient(135deg,#6366f1,#8b5cf6)"
          delta={kpis.usersDelta} link="/admin/utilisateurs" />

        <KPICard label="Annonces actives" value={kpis.activeListings} sub={`+ ${kpis.pendingListings} en attente`}
          icon={<Home size={17} />} gradient="linear-gradient(135deg,#0ea5e9,#6366f1)"
          link="/admin/annonces" />

        <KPICard label="Transactions" value={kpis.paymentsCount} sub="paiements validés"
          icon={<CreditCard size={17} />} gradient="linear-gradient(135deg,#10b981,#059669)"
          delta={null} link="/admin/transactions" />

        <KPICard label="Retraits en attente" value={kpis.pendingWithdrawals}
          sub={kpis.pendingWithdrawals > 0 ? 'à traiter' : 'Aucun en attente'}
          icon={<Wallet size={17} />} gradient="linear-gradient(135deg,#f59e0b,#d97706)"
          alert={kpis.pendingWithdrawals > 0} />

        <KPICard label="Baux actifs" value={kpis.activeLeases} sub="contrats en cours"
          icon={<FileText size={17} />} gradient="linear-gradient(135deg,#14b8a6,#0ea5e9)"
          />

        <KPICard label="Loyers en retard" value={kpis.lateRentPeriods}
          sub={kpis.lateRentPeriods > 0 ? 'périodes impayées' : 'Aucun retard'}
          icon={<AlertCircle size={17} />} gradient="linear-gradient(135deg,#ef4444,#dc2626)"
          alert={kpis.lateRentPeriods > 0} />

        <KPICard label="Demandes de visite" value={kpis.visitRequests}
          sub="contact_requests"
          icon={<Calendar size={17} />} gradient="linear-gradient(135deg,#8b5cf6,#7C3AED)"
          delta={kpis.visitsDelta} />

        <KPICard label="Annonces en attente" value={kpis.pendingListings}
          sub="à modérer"
          icon={<Clock size={17} />} gradient="linear-gradient(135deg,#f97316,#ea580c)"
          alert={kpis.pendingListings > 0} link="/admin/annonces" />
      </div>

      {/* ── Graphique financier ─────────────────────────────────────────────── */}
      <div className="rounded-xl p-6 border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-base" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
              Graphique Financier
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--adm-text-muted)' }}>
              {PERIOD_OPTIONS.find(p => p.key === period)?.label}
            </p>
          </div>
          {/* Mode du graphique */}
          <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface-alt)' }}>
            {([['revenue', 'Revenus', '#A855F7'], ['volume', 'Volume', '#14b8a6'], ['both', 'Les deux', '#6366f1']] as [ChartMode, string, string][]).map(([mode, lbl, color]) => (
              <button key={mode} onClick={() => setChartMode(mode)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-all"
                style={{ background: chartMode === mode ? `${color}20` : 'transparent', color: chartMode === mode ? color : 'var(--adm-text-muted)' }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          {chartMode === 'both' ? (
            <BarChart data={revenueChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: '#8B7BB5', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(revenueChart.length / 6)} />
              <YAxis tick={{ fill: '#8B7BB5', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${Math.round(v/1000)}k` : '0'} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="volume"  fill="#14b8a6" radius={[4,4,0,0]} opacity={0.7} />
              <Bar dataKey="revenue" fill="#A855F7" radius={[4,4,0,0]} />
            </BarChart>
          ) : (
            <AreaChart data={revenueChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={chartMode === 'revenue' ? '#A855F7' : '#14b8a6'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartMode === 'revenue' ? '#A855F7' : '#14b8a6'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: '#8B7BB5', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(revenueChart.length / 6)} />
              <YAxis tick={{ fill: '#8B7BB5', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${Math.round(v/1000)}k` : '0'} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey={chartMode} stroke={chartMode === 'revenue' ? '#A855F7' : '#14b8a6'} strokeWidth={2} fill="url(#grad1)" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ── Actions + Activités ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Annonces en attente */}
        <div className="rounded-xl p-5 border flex flex-col" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-500" />
              <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>Annonces à valider</h2>
              {kpis.pendingListings > 0 && <span className="bg-amber-500/15 text-amber-500 text-xs font-bold px-2 py-0.5 rounded-full">{kpis.pendingListings}</span>}
            </div>
            <Link to="/admin/annonces" className="text-xs flex items-center gap-1" style={{ color: 'var(--adm-accent)' }}>Tout voir <ChevronRight size={12} /></Link>
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
                <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Home size={13} className="text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--adm-text)' }}>{l.title}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--adm-text-dim)' }}>{l.ownerName} · {formatMontant(l.monthly_rent)}/mois</p>
                    </div>
                  </div>
                  <Link to="/admin/annonces" className="flex-shrink-0 ml-2 text-xs px-2.5 py-1 rounded-md text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors">
                    Modérer
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Retraits en attente */}
        <div className="rounded-xl p-5 border flex flex-col" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-sky-500" />
              <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>Retraits en attente</h2>
              {kpis.pendingWithdrawals > 0 && <span className="bg-sky-500/15 text-sky-500 text-xs font-bold px-2 py-0.5 rounded-full">{kpis.pendingWithdrawals}</span>}
            </div>
            <Link to="/admin/transactions" className="text-xs flex items-center gap-1" style={{ color: 'var(--adm-accent)' }}>Tout voir <ChevronRight size={12} /></Link>
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
                <div key={w.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                      <Wallet size={13} className="text-sky-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--adm-text)' }}>{formatMontant(w.amount)}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--adm-text-dim)' }}>{w.ownerName} · {w.operator.toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="flex-shrink-0 ml-2 text-xs px-2.5 py-1 rounded-md text-sky-400 bg-sky-500/10">En traitement</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Activités récentes + Santé plateforme ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Activités récentes (Realtime) */}
        <div className="lg:col-span-2 rounded-xl p-5 border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-violet-500" />
              <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>Activités récentes</h2>
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <Link to="/admin/logs" className="text-xs flex items-center gap-1" style={{ color: 'var(--adm-accent)' }}>Voir tous <ChevronRight size={12} /></Link>
          </div>

          {activity.length === 0 ? (
            <div className="text-center py-8">
              <Eye size={28} className="mx-auto mb-2" style={{ color: 'var(--adm-text-dim)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--adm-text-muted)' }}>Aucune activité enregistrée</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {activity.map(log => {
                const meta = ACTION_META[log.action] ?? { icon: '🔹', label: log.action, color: '#8B7BB5' };
                return (
                  <div key={log.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors hover:bg-white/[0.02]">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: `${meta.color}15` }}>
                      {meta.icon}
                    </span>
                    <p className="text-sm flex-1 truncate" style={{ color: 'var(--adm-text)' }}>{meta.label}</p>
                    <p className="text-xs flex-shrink-0" style={{ color: 'var(--adm-text-dim)' }}>{relativeTime(log.created_at)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Santé de la plateforme */}
        <div className="rounded-xl p-5 border flex flex-col gap-4" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-emerald-400" />
            <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>Santé plateforme</h2>
          </div>

          {[
            {
              label: 'API Supabase',
              ok: true,
              detail: 'Connecté',
              icon: <BarChart2 size={13} />,
              color: '#10b981',
            },
            {
              label: 'Paiements',
              ok: alerts.failedPayments === 0,
              detail: alerts.failedPayments > 0 ? `${alerts.failedPayments} échoué(s)` : 'Opérationnel',
              icon: <CreditCard size={13} />,
              color: alerts.failedPayments > 0 ? '#ef4444' : '#10b981',
            },
            {
              label: 'Retraits',
              ok: alerts.pendingWithdrawals === 0,
              detail: alerts.pendingWithdrawals > 0 ? `${alerts.pendingWithdrawals} en attente` : 'Aucun en attente',
              icon: <Wallet size={13} />,
              color: alerts.pendingWithdrawals > 0 ? '#f59e0b' : '#10b981',
            },
            {
              label: 'Loyers en retard',
              ok: alerts.lateRentPeriods === 0,
              detail: alerts.lateRentPeriods > 0 ? `${alerts.lateRentPeriods} périodes` : 'Tout à jour',
              icon: <AlertTriangle size={13} />,
              color: alerts.lateRentPeriods > 0 ? '#ef4444' : '#10b981',
            },
            {
              label: 'Modération',
              ok: kpis.pendingListings === 0,
              detail: kpis.pendingListings > 0 ? `${kpis.pendingListings} annonce(s)` : 'File vide',
              icon: <Home size={13} />,
              color: kpis.pendingListings > 0 ? '#f59e0b' : '#10b981',
            },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2" style={{ color: 'var(--adm-text-muted)' }}>
                {item.icon}
                <span className="text-xs">{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                <span className="text-xs font-medium" style={{ color: item.color }}>{item.detail}</span>
              </div>
            </div>
          ))}

          <div className="mt-auto pt-3 border-t" style={{ borderColor: 'var(--adm-border)' }}>
            <p className="text-xs text-center" style={{ color: 'var(--adm-text-dim)' }}>
              Données en temps réel · ImoFlex v1.0
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};

export default AdminDashboard;
