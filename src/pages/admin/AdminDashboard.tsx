import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Home, CreditCard, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle, AlertCircle, Wallet, Activity,
  Eye, ChevronRight, RefreshCw, Calendar, FileText,
  Zap, AlertTriangle, Minus, CheckCircle2, Lock, UserPlus,
  Megaphone, Banknote, XCircle, Ban, Trash2,
  ChevronDown, ChevronUp, Shield, ShieldCheck, TrendingUp, BarChart2, Bell,
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

const ACTION_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  connexion:            { icon: <Lock size={14} />,         label: 'Connexion',             color: '#8b5cf6' },
  inscription:          { icon: <UserPlus size={14} />,     label: 'Nouvelle inscription',  color: '#6366f1' },
  publication_annonce:  { icon: <Megaphone size={14} />,    label: 'Annonce publiée',        color: '#8b5cf6' },
  paiement:             { icon: <Banknote size={14} />,     label: 'Paiement reçu',          color: '#10b981' },
  retrait_demande:      { icon: <Wallet size={14} />,       label: 'Retrait demandé',        color: '#f59e0b' },
  retrait_valide:       { icon: <CheckCircle2 size={14} />, label: 'Retrait validé',         color: '#10b981' },
  moderation_approuve:  { icon: <CheckCircle2 size={14} />, label: 'Annonce approuvée',      color: '#10b981' },
  moderation_rejete:    { icon: <XCircle size={14} />,      label: 'Annonce rejetée',        color: '#ef4444' },
  suspension:           { icon: <Ban size={14} />,          label: 'Compte suspendu',        color: '#f97316' },
  suppression_annonce:  { icon: <Trash2 size={14} />,       label: 'Annonce supprimée',      color: '#ef4444' },
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

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  delta?: number | null;
  link?: string;
  alert?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ label, value, sub, icon, iconBg, iconColor, delta, link, alert }) => {
  const inner = (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 border transition-all duration-200 hover:shadow-md hover:-translate-y-px"
      style={{
        background: alert ? 'rgba(239,68,68,0.03)' : 'var(--adm-surface)',
        borderColor: alert ? 'rgba(239,68,68,0.25)' : 'var(--adm-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: iconBg, color: iconColor }}>
          {icon}
        </div>
        {delta !== null && delta !== undefined && (
          <div
            className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ background: delta > 0 ? 'rgba(16,185,129,0.1)' : delta < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)' }}
          >
            {delta > 0  && <><ArrowUpRight size={12} className="text-emerald-500" /><span className="text-emerald-500">+{delta}%</span></>}
            {delta < 0  && <><ArrowDownRight size={12} className="text-red-400" /><span className="text-red-400">{delta}%</span></>}
            {delta === 0 && <><Minus size={12} style={{ color: 'var(--adm-text-dim)' }} /><span style={{ color: 'var(--adm-text-dim)' }}>stable</span></>}
          </div>
        )}
        {alert && delta === undefined && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--adm-text-muted)' }}>{label}</p>
        <p className="text-3xl font-bold leading-none" style={{ color: alert ? '#ef4444' : 'var(--adm-text)', fontFamily: 'Space Grotesk' }}>{value}</p>
        {sub && <p className="text-xs mt-1.5" style={{ color: 'var(--adm-text-dim)' }}>{sub}</p>}
      </div>
    </div>
  );
  return link ? <Link to={link} className="block">{inner}</Link> : inner;
};

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

interface ChartTooltipProps { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }
const ChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-4 py-3 text-xs shadow-xl border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)', minWidth: '150px' }}>
      <p className="mb-2 font-semibold" style={{ color: 'var(--adm-text-muted)' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-bold flex justify-between gap-4" style={{ color: p.name === 'revenue' ? '#a78bfa' : '#14b8a6' }}>
          <span>{p.name === 'revenue' ? 'Revenus' : 'Volume'}</span>
          <span>{formatMontant(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Alert Panel ─────────────────────────────────────────────────────────────

interface AlertItem { label: string; color: string; icon: React.ReactNode; link: string; level: 'critical' | 'warning' }
interface SystemAlert { label: string; ok: boolean }
interface AlertPanelProps { alertItems: AlertItem[]; systemAlerts: SystemAlert[]; hasAnomalies: boolean }

const STORAGE_KEY = 'imoflex_alerts_open';

const AlertPanel: React.FC<AlertPanelProps> = ({ alertItems, systemAlerts, hasAnomalies }) => {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return alertItems.length > 0 || hasAnomalies;
      return stored === 'true';
    } catch { return true; }
  });

  const totalAlerts = alertItems.length + (hasAnomalies ? systemAlerts.filter(s => !s.ok).length : 0);
  const criticalCount = alertItems.filter(a => a.level === 'critical').length;
  const warningCount  = alertItems.filter(a => a.level === 'warning').length + (hasAnomalies ? systemAlerts.filter(s => !s.ok).length : 0);
  const allClear = totalAlerts === 0;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
  };

  if (allClear) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm"
        style={{ background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.2)' }}>
        <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={13} className="text-emerald-400" />
        </div>
        <span className="font-semibold text-emerald-400">Système opérationnel</span>
        <span className="text-xs" style={{ color: 'var(--adm-text-muted)' }}>Aucune alerte détectée</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: criticalCount > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)' }}>
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm transition-colors"
        style={{ background: criticalCount > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: criticalCount > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)' }}>
            <Bell size={12} className={criticalCount > 0 ? 'text-red-400' : 'text-amber-400'} />
          </div>
          <span className={`font-bold text-sm ${criticalCount > 0 ? 'text-red-400' : 'text-amber-400'}`}>
            {totalAlerts} alerte{totalAlerts > 1 ? 's' : ''} active{totalAlerts > 1 ? 's' : ''}
          </span>
          {criticalCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400">
              {criticalCount} critique{criticalCount > 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400">
              {warningCount} avertissement{warningCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--adm-text-dim)' }}>
          <span>{open ? 'Masquer' : 'Afficher'}</span>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 flex flex-col gap-3" style={{ background: 'var(--adm-surface)' }}>
          {alertItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--adm-text-dim)' }}>Alertes opérationnelles</p>
              <div className="flex flex-wrap gap-2">
                {alertItems.map((a, i) => (
                  <Link key={i} to={a.link}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-opacity hover:opacity-80"
                    style={{ background: `${a.color}12`, color: a.color, border: `1px solid ${a.color}30` }}>
                    {a.icon}{a.label}<ChevronRight size={10} />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {hasAnomalies && systemAlerts.some(s => !s.ok) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--adm-text-dim)' }}>Anomalies système</p>
              <div className="flex flex-wrap gap-2">
                {systemAlerts.filter(s => !s.ok).map((s, i) => (
                  <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <Activity size={11} />{s.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Quick Action ─────────────────────────────────────────────────────────────

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  link: string;
  badge?: number;
  color: string;
  iconBg: string;
}

const QuickActionItem: React.FC<QuickActionProps> = ({ icon, label, description, link, badge, color, iconBg }) => (
  <Link to={link}
    className="flex items-center justify-between p-3.5 rounded-xl border transition-all duration-150 hover:scale-[1.01] hover:shadow-md group"
    style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--adm-text)' }}>{label}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--adm-text-dim)' }}>{description}</p>
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>{badge}</span>
      )}
      <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--adm-text-dim)' }} />
    </div>
  </Link>
);

// ─── Section Header ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }> = ({ icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2.5">
      <span style={{ color: 'var(--adm-accent)' }}>{icon}</span>
      <div>
        <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>{title}</h2>
        {subtitle && <p className="text-[11px]" style={{ color: 'var(--adm-text-dim)' }}>{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

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

  // Calcul des anomalies techniques
  const CRON_THRESHOLDS_MINS: Record<string, number> = {
    'reconcile-payments-every-10-min':   20,
    'update-overdue-rent-periods-daily': 26 * 60,
  };

  const isCronInactive = (jobName: string) => {
    const run = systemHealth?.cronHealth.find(c => c.jobname === jobName);
    if (!run) return true;
    const diffMins = (Date.now() - new Date(run.start_time).getTime()) / 60000;
    const maxMins = CRON_THRESHOLDS_MINS[jobName] ?? 30;
    return diffMins > maxMins || run.status !== 'succeeded';
  };

  const isReconcileBad    = isCronInactive('reconcile-payments-every-10-min');
  const isUpdateOverdueBad = isCronInactive('update-overdue-rent-periods-daily');

  const hasSystemAnomalies = systemHealth != null && (
    systemHealth.pendingPayments.length > 0 ||
    systemHealth.failedWithdrawals.length > 0 ||
    isReconcileBad || isUpdateOverdueBad
  );

  // Alertes métier
  const alertItems: AlertItem[] = [
    alerts.lateRentPeriods    > 0 && { label: `${alerts.lateRentPeriods} loyer(s) en retard`,        color: '#ef4444', icon: <AlertTriangle size={12} />, link: '/admin/loyers-retard',  level: 'critical' as const },
    alerts.failedPayments     > 0 && { label: `${alerts.failedPayments} paiement(s) échoué(s)`,      color: '#ef4444', icon: <CreditCard size={12} />,    link: '/admin/transactions',    level: 'critical' as const },
    alerts.pendingWithdrawals > 0 && { label: `${alerts.pendingWithdrawals} retrait(s) en attente`,  color: '#f59e0b', icon: <Wallet size={12} />,       link: '/admin/transactions',    level: 'warning' as const  },
    alerts.pendingOwnerVerifications > 0 && { label: `${alerts.pendingOwnerVerifications} vérification(s) propriétaire`, color: '#7c3aed', icon: <ShieldCheck size={12} />, link: '/admin/verifications', level: 'warning' as const },
    alerts.pendingDeletionRequests > 0 && { label: `${alerts.pendingDeletionRequests} demande(s) de suppression`, color: '#f59e0b', icon: <Trash2 size={12} />, link: '/admin/suppressions', level: 'warning' as const },
  ].filter(Boolean) as AlertItem[];

  // Alertes système pour le panel
  const systemAlerts: SystemAlert[] = systemHealth ? [
    { label: 'Réconciliation paiements CRON',   ok: !isReconcileBad },
    { label: 'Mise à jour retards loyers CRON',  ok: !isUpdateOverdueBad },
    ...systemHealth.pendingPayments.slice(0, 2).map(p => ({ label: `Paiement bloqué : ${p.tenant?.full_name || 'Inconnu'} (${formatMontant(p.amount)})`, ok: false })),
    ...systemHealth.failedWithdrawals.slice(0, 2).map(w => ({ label: `Retrait échoué : ${w.wallet?.owner?.full_name || 'Inconnu'} (${formatMontant(w.amount)})`, ok: false })),
  ] : [];

  if (loading) {
    return (
      <div className="w-full space-y-6 animate-pulse pb-10">
        <div className="flex items-center justify-between">
          <div className="h-8 rounded-xl w-48" style={{ background: 'var(--adm-surface-alt)' }} />
          <div className="h-9 rounded-xl w-64" style={{ background: 'var(--adm-surface-alt)' }} />
        </div>
        <div className="h-12 rounded-xl w-full" style={{ background: 'var(--adm-surface-alt)' }} />
        <div className="h-36 rounded-2xl w-full" style={{ background: 'var(--adm-surface-alt)' }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-32 rounded-2xl" style={{ background: 'var(--adm-surface-alt)' }} />)}
        </div>
        <div className="h-64 rounded-2xl" style={{ background: 'var(--adm-surface-alt)' }} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-64 rounded-2xl" style={{ background: 'var(--adm-surface-alt)' }} />)}
        </div>
      </div>
    );
  }

  const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.label ?? '';

  return (
    <div className="w-full space-y-6 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>
            Tableau de bord
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--adm-text-muted)' }}>
            Actualisé à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ImoFlex Admin
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-xl border overflow-hidden" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface)' }}>
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setPeriod(opt.key)}
                className="px-3 py-2 text-xs transition-all"
                style={{
                  background: period === opt.key ? 'rgba(124,58,237,0.12)' : 'transparent',
                  color: period === opt.key ? 'var(--adm-accent)' : 'var(--adm-text-muted)',
                  fontWeight: period === opt.key ? 700 : 400,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={refresh}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-purple-500/10"
            style={{ color: 'var(--adm-accent)', borderColor: 'var(--adm-border)', background: 'var(--adm-surface)' }}>
            <RefreshCw size={13} />
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Alertes ─────────────────────────────────────────────────────────── */}
      <AlertPanel alertItems={alertItems} systemAlerts={systemAlerts} hasAnomalies={hasSystemAnomalies} />

      {/* ── Bannière Revenus ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 55%, #312E81 100%)', boxShadow: '0 12px 32px rgba(76,29,149,0.25)' }}>
        <div className="pointer-events-none absolute -right-20 -top-20 w-72 h-72 rounded-full border border-white/10"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)' }} />
        <div className="pointer-events-none absolute -bottom-16 -left-12 w-48 h-48 rounded-full border border-white/5"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />
        <div className="relative z-10 p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center">
                <TrendingUp size={14} className="text-white" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                Revenus ImoFlex · Commissions
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="font-bold leading-none text-white tracking-tight"
                style={{ fontFamily: 'Space Grotesk', fontSize: 'clamp(2rem, 4vw, 2.75rem)' }}>
                {formatMontant(kpis.revenueImoflex)}
              </p>
              {kpis.revenueDelta !== null && (
                <span className={`mb-1 text-sm font-bold px-2 py-0.5 rounded-lg ${kpis.revenueDelta >= 0 ? 'bg-white/15 text-white' : 'bg-red-500/25 text-red-200'}`}>
                  {kpis.revenueDelta >= 0 ? '+' : ''}{kpis.revenueDelta}%
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-white/55">{periodLabel}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:min-w-[320px]">
            {[
              { label: 'Volume transité', value: formatMontant(kpis.paymentsTotalVolume) },
              { label: 'Transactions',    value: String(kpis.paymentsCount) },
              { label: 'Baux actifs',     value: String(kpis.activeLeases) },
            ].map(item => (
              <div key={item.label} className="rounded-xl px-4 py-3 text-center" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/55">{item.label}</p>
                <p className="font-bold text-white leading-none" style={{ fontFamily: 'Space Grotesk', fontSize: 'clamp(0.75rem, 1.5vw, 1.1rem)' }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Utilisateurs" value={kpis.totalUsers} sub="inscrits"
          icon={<Users size={18} />} iconBg="rgba(139,92,246,0.12)" iconColor="#8b5cf6"
          delta={kpis.usersDelta} link="/admin/utilisateurs" />
        <KPICard
          label="Annonces actives" value={kpis.activeListings} sub={`+${kpis.pendingListings} en attente`}
          icon={<Home size={18} />} iconBg="rgba(16,185,129,0.12)" iconColor="#10b981"
          link="/admin/annonces" />
        <KPICard
          label="Transactions" value={kpis.paymentsCount} sub="paiements validés"
          icon={<CreditCard size={18} />} iconBg="rgba(99,102,241,0.12)" iconColor="#6366f1"
          delta={null} link="/admin/transactions" />
        <KPICard
          label="Retraits en attente" value={kpis.pendingWithdrawals}
          sub={kpis.pendingWithdrawals > 0 ? 'à traiter maintenant' : 'Aucun en attente'}
          icon={<Wallet size={18} />}
          iconBg={kpis.pendingWithdrawals > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.1)'}
          iconColor={kpis.pendingWithdrawals > 0 ? '#f59e0b' : 'var(--adm-text-dim)'}
          alert={kpis.pendingWithdrawals > 0} />
        <KPICard
          label="Baux actifs" value={kpis.activeLeases} sub="contrats en cours"
          icon={<FileText size={18} />} iconBg="rgba(14,165,233,0.12)" iconColor="#0ea5e9" />
        <KPICard
          label="Loyers en retard" value={kpis.lateRentPeriods}
          sub={kpis.lateRentPeriods > 0 ? 'périodes impayées' : 'Aucun retard'}
          icon={<AlertCircle size={18} />}
          iconBg={kpis.lateRentPeriods > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.1)'}
          iconColor={kpis.lateRentPeriods > 0 ? '#ef4444' : 'var(--adm-text-dim)'}
          alert={kpis.lateRentPeriods > 0} />
        <KPICard
          label="Demandes de visite" value={kpis.visitRequests} sub="demandes reçues"
          icon={<Calendar size={18} />} iconBg="rgba(236,72,153,0.12)" iconColor="#ec4899"
          delta={kpis.visitsDelta} />
        <KPICard
          label="Annonces en attente" value={kpis.pendingListings} sub="à modérer"
          icon={<Clock size={18} />}
          iconBg={kpis.pendingListings > 0 ? 'rgba(249,115,22,0.15)' : 'rgba(100,116,139,0.1)'}
          iconColor={kpis.pendingListings > 0 ? '#f97316' : 'var(--adm-text-dim)'}
          alert={kpis.pendingListings > 0} link="/admin/annonces" />
      </div>

      {/* ── Graphique Financier ──────────────────────────────────────────────── */}
      <div className="rounded-2xl p-6 border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(167,139,250,0.12)', color: 'var(--adm-accent)' }}>
              <BarChart2 size={15} />
            </div>
            <div>
              <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>Graphique Financier</h2>
              <p className="text-[11px]" style={{ color: 'var(--adm-text-dim)' }}>{periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface-alt)' }}>
            {([['revenue', 'Revenus', '#a78bfa'], ['volume', 'Volume', '#14b8a6'], ['both', 'Les deux', '#6366f1']] as [ChartMode, string, string][]).map(([mode, lbl, color]) => (
              <button key={mode} onClick={() => setChartMode(mode)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{ background: chartMode === mode ? `${color}18` : 'transparent', color: chartMode === mode ? color : 'var(--adm-text-muted)' }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          {chartMode === 'both' ? (
            <BarChart data={revenueChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--adm-divider)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--adm-text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(revenueChart.length / 6)} />
              <YAxis tick={{ fill: 'var(--adm-text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${Math.round(v/1000)}k` : '0'} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="volume"  fill="#14b8a6" radius={[4,4,0,0]} opacity={0.7} />
              <Bar dataKey="revenue" fill="#a78bfa"  radius={[4,4,0,0]} />
            </BarChart>
          ) : (
            <AreaChart data={revenueChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={chartMode === 'revenue' ? '#a78bfa' : '#14b8a6'} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={chartMode === 'revenue' ? '#a78bfa' : '#14b8a6'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--adm-divider)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--adm-text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(revenueChart.length / 6)} />
              <YAxis tick={{ fill: 'var(--adm-text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${Math.round(v/1000)}k` : '0'} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(167,139,250,0.3)', strokeWidth: 1 }} />
              <Area type="monotone" dataKey={chartMode} stroke={chartMode === 'revenue' ? '#a78bfa' : '#14b8a6'} strokeWidth={2.5} fill="url(#chartGrad)" dot={false} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ── File d'attente : Annonces + Retraits ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Annonces en attente */}
        <div className="rounded-2xl p-5 border flex flex-col" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <SectionHeader
            icon={<AlertCircle size={15} />}
            title="Annonces à valider"
            subtitle={`${kpis.pendingListings} en attente de modération`}
            action={
              <Link to="/admin/annonces" className="text-xs flex items-center gap-1 font-semibold hover:underline" style={{ color: 'var(--adm-accent)' }}>
                Tout voir <ChevronRight size={12} />
              </Link>
            }
          />
          {pendingListings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
                <CheckCircle size={22} className="text-emerald-500" />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--adm-text)' }}>Tout est à jour !</p>
              <p className="text-xs mt-1" style={{ color: 'var(--adm-text-dim)' }}>Aucune annonce en attente de modération</p>
            </div>
          ) : (
            <div className="space-y-2 flex-1">
              {pendingListings.map(l => (
                <div key={l.id} className="flex items-center justify-between p-3 rounded-xl border"
                  style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Home size={14} className="text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--adm-text)' }}>{l.title}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--adm-text-dim)' }}>{l.ownerName} · {formatMontant(l.monthly_rent)}/mois</p>
                    </div>
                  </div>
                  <Link to="/admin/annonces"
                    className="flex-shrink-0 ml-2 text-xs px-3 py-1.5 rounded-lg font-semibold text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 transition-colors">
                    Modérer
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Retraits en attente */}
        <div className="rounded-2xl p-5 border flex flex-col" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <SectionHeader
            icon={<Wallet size={15} />}
            title="Retraits en attente"
            subtitle={`${kpis.pendingWithdrawals} demande${kpis.pendingWithdrawals > 1 ? 's' : ''} à traiter`}
            action={
              <Link to="/admin/transactions" className="text-xs flex items-center gap-1 font-semibold hover:underline" style={{ color: 'var(--adm-accent)' }}>
                Tout voir <ChevronRight size={12} />
              </Link>
            }
          />
          {pendingWithdrawals.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
                <CheckCircle size={22} className="text-emerald-500" />
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--adm-text)' }}>Aucun retrait en attente</p>
              <p className="text-xs mt-1" style={{ color: 'var(--adm-text-dim)' }}>Tous les retraits ont été traités</p>
            </div>
          ) : (
            <div className="space-y-2 flex-1">
              {pendingWithdrawals.map(w => (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-xl border"
                  style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                      <Wallet size={14} className="text-sky-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--adm-text)' }}>{formatMontant(w.amount)}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--adm-text-dim)' }}>{w.ownerName} · {w.operator.toUpperCase()}</p>
                    </div>
                  </div>
                  <span className="flex-shrink-0 ml-2 text-xs px-3 py-1.5 rounded-lg font-semibold text-sky-400 bg-sky-500/10">
                    En traitement
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Activités + Accès rapides ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Activités récentes */}
        <div className="lg:col-span-2 rounded-2xl p-5 border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <SectionHeader
            icon={<Activity size={15} />}
            title="Activités récentes"
            action={
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Temps réel
                </span>
                <Link to="/admin/logs" className="text-xs flex items-center gap-1 font-semibold hover:underline" style={{ color: 'var(--adm-accent)' }}>
                  Voir tous <ChevronRight size={12} />
                </Link>
              </div>
            }
          />
          {activity.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--adm-surface-alt)' }}>
                <Eye size={20} style={{ color: 'var(--adm-text-dim)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--adm-text-muted)' }}>Aucune activité enregistrée</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {activity.map(log => {
                const meta = ACTION_META[log.action] ?? { icon: <Activity size={14} />, label: log.action, color: 'var(--adm-text-dim)' };
                return (
                  <div key={log.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-white/[0.02]">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${meta.color}12`, color: meta.color }}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--adm-text)' }}>{meta.label}</p>
                    </div>
                    <p className="text-[11px] flex-shrink-0" style={{ color: 'var(--adm-text-dim)' }}>{relativeTime(log.created_at)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accès rapides */}
        <div className="rounded-2xl p-5 border flex flex-col gap-2.5" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <SectionHeader icon={<Zap size={15} />} title="Accès rapides" />
          <QuickActionItem
            icon={<Home size={15} />} label="Modérer les annonces" description="Approuver ou rejeter"
            link="/admin/annonces" badge={kpis.pendingListings} color="#f59e0b" iconBg="rgba(245,158,11,0.12)" />
          <QuickActionItem
            icon={<Wallet size={15} />} label="Valider les retraits" description="Traiter les demandes"
            link="/admin/transactions" badge={kpis.pendingWithdrawals} color="#0ea5e9" iconBg="rgba(14,165,233,0.12)" />
          <QuickActionItem
            icon={<ShieldCheck size={15} />} label="Vérifier propriétaires" description="Contrôler les pièces"
            link="/admin/verifications" badge={alerts.pendingOwnerVerifications} color="#7c3aed" iconBg="rgba(124,58,237,0.12)" />
          <QuickActionItem
            icon={<Users size={15} />} label="Utilisateurs" description="Gérer les comptes"
            link="/admin/utilisateurs" color="#8b5cf6" iconBg="rgba(139,92,246,0.12)" />
          <QuickActionItem
            icon={<Trash2 size={15} />} label="Suppressions" description="Demandes en attente"
            link="/admin/suppressions" badge={alerts.pendingDeletionRequests} color="#ef4444" iconBg="rgba(239,68,68,0.1)" />
          <QuickActionItem
            icon={<Shield size={15} />} label="Support" description="Tickets et messages"
            link="/admin/support" color="#10b981" iconBg="rgba(16,185,129,0.12)" />
          <div className="mt-auto pt-3 border-t text-center" style={{ borderColor: 'var(--adm-border)' }}>
            <p className="text-[11px]" style={{ color: 'var(--adm-text-dim)' }}>Données en temps réel · ImoFlex v1.0</p>
          </div>
        </div>

      </div>

    </div>
  );
};

export default AdminDashboard;
