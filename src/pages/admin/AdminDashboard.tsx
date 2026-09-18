import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Home, CreditCard, ArrowUpRight, ArrowDownRight,
  Clock, CheckCircle, AlertCircle, Wallet, Activity,
  Eye, ChevronRight, RefreshCw, Calendar, FileText,
  Zap, AlertTriangle, Minus, CheckCircle2, Lock, UserPlus, Megaphone, Banknote, XCircle, Ban, Trash2,
  ChevronDown, ChevronUp, Shield,
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
  connexion:            { icon: <Lock size={16} />, label: 'Connexion',           color: 'var(--adm-accent)' },
  inscription:          { icon: <UserPlus size={16} />, label: 'Nouvelle inscription', color: 'var(--adm-accent)' },
  publication_annonce:  { icon: <Megaphone size={16} />, label: 'Annonce publiée',      color: 'var(--adm-accent)' },
  paiement:             { icon: <Banknote size={16} />, label: 'Paiement reçu',        color: '#10b981' },
  retrait_demande:      { icon: <Wallet size={16} />, label: 'Retrait demandé',      color: '#f59e0b' },
  retrait_valide:       { icon: <CheckCircle2 size={16} />, label: 'Retrait validé',       color: '#10b981' },
  moderation_approuve:  { icon: <CheckCircle2 size={16} />, label: 'Annonce approuvée',    color: '#10b981' },
  moderation_rejete:    { icon: <XCircle size={16} />, label: 'Annonce rejetée',      color: '#ef4444' },
  suspension:           { icon: <Ban size={16} />, label: 'Compte suspendu',      color: '#f59e0b' },
  suppression_annonce:  { icon: <Trash2 size={16} />, label: 'Annonce supprimée',    color: '#ef4444' },
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
        <p key={i} className="font-bold" style={{ color: p.name === 'revenue' ? 'var(--imx-accent-light)' : '#14b8a6' }}>
          {p.name === 'revenue' ? 'Revenus : ' : 'Volume : '}{formatMontant(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── AlertPanel ──────────────────────────────────────────────────────────────

interface AlertItem {
  label: string;
  color: string;
  icon: React.ReactNode;
  link: string;
  level: 'critical' | 'warning';
}

interface SystemAlert {
  label: string;
  ok: boolean;
}

interface AlertPanelProps {
  alertItems: AlertItem[];
  systemAlerts: SystemAlert[];
  hasAnomalies: boolean;
}

const STORAGE_KEY = 'imoflex_alerts_open';

const AlertPanel: React.FC<AlertPanelProps> = ({ alertItems, systemAlerts, hasAnomalies }) => {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Si des alertes existent et qu'on n'a pas de préférence stockée → ouvert par défaut
      if (stored === null) return alertItems.length > 0 || hasAnomalies;
      return stored === 'true';
    } catch { return true; }
  });

  const totalAlerts = alertItems.length + (hasAnomalies ? systemAlerts.filter(s => !s.ok).length : 0);
  const allClear = totalAlerts === 0;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
  };

  if (allClear) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs"
        style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.2)' }}
      >
        <CheckCircle2 size={14} className="text-emerald-400" />
        <span className="font-semibold text-emerald-400">Système opérationnel :</span>
        <span style={{ color: 'var(--adm-text)' }}>Aucune alerte ni anomalie détectée</span>
      </div>
    );
  }

  const criticalCount = alertItems.filter(a => a.level === 'critical').length;
  const warningCount  = alertItems.filter(a => a.level === 'warning').length + (hasAnomalies ? systemAlerts.filter(s => !s.ok).length : 0);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: criticalCount > 0 ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)' }}
    >
      {/* Header cliquable */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs transition-colors"
        style={{
          background: criticalCount > 0 ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.07)',
        }}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className={criticalCount > 0 ? 'text-red-400' : 'text-amber-400'} />
          <span className={`font-bold ${criticalCount > 0 ? 'text-red-400' : 'text-amber-400'}`}>
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
        <div className="flex items-center gap-1.5" style={{ color: 'var(--adm-text-muted)' }}>
          <span className="text-[11px]">{open ? 'Masquer' : 'Afficher'}</span>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </button>

      {/* Contenu dépliable */}
      {open && (
        <div className="px-4 py-3 flex flex-col gap-3" style={{ background: 'var(--adm-surface)' }}>

          {/* Alertes métier */}
          {alertItems.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--adm-text-muted)' }}>
                Alertes opérationnelles
              </p>
              <div className="flex flex-wrap gap-2">
                {alertItems.map((a, i) => (
                  <Link key={i} to={a.link}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-xs transition-opacity hover:opacity-80"
                    style={{ background: `${a.color}18`, color: a.color, border: `1px solid ${a.color}35` }}
                  >
                    {a.icon}
                    {a.label}
                    <ChevronRight size={10} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Anomalies système */}
          {hasAnomalies && systemAlerts.some(s => !s.ok) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--adm-text-muted)' }}>
                Anomalies système
              </p>
              <div className="flex flex-wrap gap-2">
                {systemAlerts.filter(s => !s.ok).map((s, i) => (
                  <span key={i}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-xs"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                  >
                    <Activity size={11} />
                    {s.label}
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

// ─── QuickActions ─────────────────────────────────────────────────────────────

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  link: string;
  badge?: number;
  color: string;
}

const QuickActionItem: React.FC<QuickActionProps> = ({ icon, label, description, link, badge, color }) => (
  <Link to={link}
    className="flex items-center justify-between p-3 rounded-lg border transition-all hover:scale-[1.01] hover:shadow-md group"
    style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}
  >
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors" style={{ background: `${color}15`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--adm-text)' }}>{label}</p>
        <p className="text-[11px] truncate" style={{ color: 'var(--adm-text-dim)' }}>{description}</p>
      </div>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
      {badge !== undefined && badge > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
          {badge}
        </span>
      )}
      <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--adm-text-dim)' }} />
    </div>
  </Link>
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
    alerts.pendingDeletionRequests > 0 && { label: `${alerts.pendingDeletionRequests} demande(s) de suppression`, color: '#f59e0b', icon: <Trash2 size={12} />, link: '/admin/suppressions', level: 'warning' as const },
  ].filter(Boolean) as AlertItem[];

  // Alertes système pour le panel
  const systemAlerts: SystemAlert[] = systemHealth ? [
    { label: 'Réconciliation paiements CRON',  ok: !isReconcileBad },
    { label: 'Mise à jour retards loyers CRON', ok: !isUpdateOverdueBad },
    ...systemHealth.pendingPayments.slice(0, 2).map(p => ({
      label: `Paiement bloqué : ${p.tenant?.full_name || 'Inconnu'} (${formatMontant(p.amount)})`,
      ok: false,
    })),
    ...systemHealth.failedWithdrawals.slice(0, 2).map(w => ({
      label: `Retrait échoué : ${w.wallet?.owner?.full_name || 'Inconnu'} (${formatMontant(w.amount)})`,
      ok: false,
    })),
  ] : [];

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

      {/* ── Panel d'alertes unifié ───────────────────────────────────────────── */}
      <AlertPanel
        alertItems={alertItems}
        systemAlerts={systemAlerts}
        hasAnomalies={hasSystemAnomalies}
      />

      {/* ── Bloc revenus ─────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{
          background: 'linear-gradient(135deg, #7C3AED 0%, #5B21B6 52%, #312E81 100%)',
          boxShadow: '0 14px 30px rgba(76, 29, 149, 0.28)',
        }}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/10 bg-gradient-to-br from-white/20 to-transparent" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full border border-white/5 bg-gradient-to-br from-transparent to-white/10" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/70">
              <Wallet size={14} /> Revenus ImoFlex (commissions)
            </p>
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="font-bold leading-none whitespace-nowrap tracking-[-0.035em] text-white" style={{ fontFamily: 'Space Grotesk', fontSize: 'clamp(1.75rem, 4vw, 2.25rem)' }} title={formatMontant(kpis.revenueImoflex)}>
                {formatMontant(kpis.revenueImoflex)}
              </p>
              {kpis.revenueDelta !== null && (
                <span className={`mb-0.5 text-sm font-semibold ${kpis.revenueDelta >= 0 ? 'text-white/90' : 'text-red-200'}`}>
                  {kpis.revenueDelta >= 0 ? '+' : ''}{kpis.revenueDelta}%
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-white/65">
              {PERIOD_OPTIONS.find(p => p.key === period)?.label}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="min-w-0 rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">Volume transité</p>
              <p className="font-bold leading-none whitespace-nowrap tracking-[-0.035em] text-white" style={{ fontSize: 'clamp(0.68rem, 1.35vw, 1rem)' }} title={formatMontant(kpis.paymentsTotalVolume)}>{formatMontant(kpis.paymentsTotalVolume)}</p>
            </div>
            <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">Transactions</p>
              <p className="text-xl font-bold leading-none text-white">{kpis.paymentsCount}</p>
            </div>
            <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/60">Baux actifs</p>
              <p className="text-xl font-bold leading-none text-white">{kpis.activeLeases}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Grid 8 cartes ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Utilisateurs" value={kpis.totalUsers} sub="inscrits"
          icon={<Users size={17} />} gradient="linear-gradient(135deg,#8B5CF6,#6D28D9)"
          delta={kpis.usersDelta} link="/admin/utilisateurs" />

        <KPICard label="Annonces actives" value={kpis.activeListings} sub={`+ ${kpis.pendingListings} en attente`}
          icon={<Home size={17} />} gradient="linear-gradient(135deg,#8B5CF6,#6D28D9)"
          link="/admin/annonces" />

        <KPICard label="Transactions" value={kpis.paymentsCount} sub="paiements validés"
          icon={<CreditCard size={17} />} gradient="linear-gradient(135deg,#8B5CF6,#6D28D9)"
          delta={null} link="/admin/transactions" />

        <KPICard label="Retraits en attente" value={kpis.pendingWithdrawals}
          sub={kpis.pendingWithdrawals > 0 ? 'à traiter' : 'Aucun en attente'}
          icon={<Wallet size={17} />} gradient="linear-gradient(135deg,#D97706,#B45309)"
          alert={kpis.pendingWithdrawals > 0} />

        <KPICard label="Baux actifs" value={kpis.activeLeases} sub="contrats en cours"
          icon={<FileText size={17} />} gradient="linear-gradient(135deg,#8B5CF6,#6D28D9)"
          />

        <KPICard label="Loyers en retard" value={kpis.lateRentPeriods}
          sub={kpis.lateRentPeriods > 0 ? 'périodes impayées' : 'Aucun retard'}
          icon={<AlertCircle size={17} />} gradient="linear-gradient(135deg,#ef4444,#dc2626)"
          alert={kpis.lateRentPeriods > 0} />

        <KPICard label="Demandes de visite" value={kpis.visitRequests}
          sub="contact_requests"
          icon={<Calendar size={17} />} gradient="linear-gradient(135deg,#8B5CF6,#6D28D9)"
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
            {([['revenue', 'Revenus', 'var(--imx-accent-light)'], ['volume', 'Volume', '#14b8a6'], ['both', 'Les deux', '#6366f1']] as [ChartMode, string, string][]).map(([mode, lbl, color]) => (
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--imx-border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--imx-text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(revenueChart.length / 6)} />
              <YAxis tick={{ fill: 'var(--imx-text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${Math.round(v/1000)}k` : '0'} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="volume"  fill="#14b8a6" radius={[4,4,0,0]} opacity={0.7} />
              <Bar dataKey="revenue" fill="var(--imx-accent-light)" radius={[4,4,0,0]} />
            </BarChart>
          ) : (
            <AreaChart data={revenueChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={chartMode === 'revenue' ? 'var(--imx-accent-light)' : '#14b8a6'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={chartMode === 'revenue' ? 'var(--imx-accent-light)' : '#14b8a6'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--imx-border)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--imx-text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} interval={Math.floor(revenueChart.length / 6)} />
              <YAxis tick={{ fill: 'var(--imx-text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `${Math.round(v/1000)}k` : '0'} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey={chartMode} stroke={chartMode === 'revenue' ? 'var(--imx-accent-light)' : '#14b8a6'} strokeWidth={2} fill="url(#grad1)" />
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

      {/* ── Activités récentes + Accès rapides ─────────────────────────────── */}
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
                const meta = ACTION_META[log.action] ?? { icon: <Activity size={16} />, label: log.action, color: 'var(--imx-text-secondary)' };
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

        {/* Accès rapides */}
        <div className="rounded-xl p-5 border flex flex-col gap-3" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={15} className="text-violet-400" />
            <h2 className="font-semibold text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>Accès rapides</h2>
          </div>

          <QuickActionItem
            icon={<Home size={14} />}
            label="Modérer les annonces"
            description="Approuver ou rejeter"
            link="/admin/annonces"
            badge={kpis.pendingListings}
            color="#f59e0b"
          />
          <QuickActionItem
            icon={<Wallet size={14} />}
            label="Valider les retraits"
            description="Traiter les demandes"
            link="/admin/transactions"
            badge={kpis.pendingWithdrawals}
            color="#0ea5e9"
          />
          <QuickActionItem
            icon={<Users size={14} />}
            label="Utilisateurs"
            description="Gérer les comptes"
            link="/admin/utilisateurs"
            color="#8b5cf6"
          />
          <QuickActionItem
            icon={<Trash2 size={14} />}
            label="Suppressions"
            description="Demandes en attente"
            link="/admin/suppressions"
            badge={alerts.pendingDeletionRequests}
            color="#ef4444"
          />
          <QuickActionItem
            icon={<Shield size={14} />}
            label="Support"
            description="Tickets et messages"
            link="/admin/support"
            color="#10b981"
          />

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
