import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard, AlertCircle, CheckCircle2, Clock, Building2,
  FileText, Home, Search, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase, Payment } from '../../../lib/supabase';
import { formatMontant, daysUntilDeadline, formatDate } from '../../../lib/utils';

/* ─────────────────────────────────────────────────────────────
   WebLocataireDashboard — Dashboard web locataire
   Réutilise exactement la même logique Supabase que la version mobile
───────────────────────────────────────────────────────────── */

interface LeaseWithPeriod {
  leaseId: string;
  propertyName: string;
  propertyAddress: string;
  currentPeriod: {
    id: string;
    amount_due: number;
    amount_paid: number;
    deadline_date: string;
  } | null;
}

type LeaseStatus = 'retard' | 'a_venir' | 'solde' | 'sans_periode';

function getLeaseStatus(lease: LeaseWithPeriod): LeaseStatus {
  if (!lease.currentPeriod) return 'sans_periode';
  const remaining = lease.currentPeriod.amount_due - lease.currentPeriod.amount_paid;
  if (remaining <= 0) return 'solde';
  const daysLeft = daysUntilDeadline(lease.currentPeriod.deadline_date);
  return daysLeft < 0 ? 'retard' : 'a_venir';
}

const STATUS_CONFIG = {
  retard:       { label: 'En retard', color: '#EF4444', bg: '#FEF2F2', icon: <AlertCircle size={16} /> },
  a_venir:      { label: 'À payer',   color: '#F59E0B', bg: '#FFFBEB', icon: <Clock size={16} /> },
  solde:        { label: 'Soldé',     color: '#10B981', bg: '#ECFDF5', icon: <CheckCircle2 size={16} /> },
  sans_periode: { label: 'En attente', color: '#6B7280', bg: '#F9FAFB', icon: <Clock size={16} /> },
};

export default function WebLocataireDashboard() {
  const { profile, loading: authLoading } = useAuth();

  const [leases, setLeases] = useState<LeaseWithPeriod[]>([]);
  const [recentPayments, setRecentPayments] = useState<(Payment & { propertyName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    try {
      const { data: leasesData, error: leasesError } = await supabase
        .from('leases')
        .select('id, tenant_id, status, properties:property_id(id, name, address, monthly_rent, payment_deadline_day)')
        .eq('tenant_id', profile.id)
        .eq('status', 'actif')
        .order('created_at', { ascending: true });

      if (leasesError) throw leasesError;

      if (leasesData && leasesData.length > 0) {
        const leaseIds = leasesData.map(l => l.id);
        const now = new Date();

        const { data: periodsData } = await supabase
          .from('rent_periods')
          .select('id, lease_id, amount_due, amount_paid, deadline_date, status')
          .in('lease_id', leaseIds)
          .eq('period_month', now.getMonth() + 1)
          .eq('period_year', now.getFullYear());

        const periodsByLease = new Map((periodsData || []).map(p => [p.lease_id, p]));

        // Ensure current period exists
        for (const l of leasesData as any[]) {
          if (!periodsByLease.has(l.id) && l.properties?.monthly_rent) {
            const { data: newPeriod, error: insertError } = await supabase
              .rpc('ensure_current_rent_period', { p_lease_id: l.id });
            if (!insertError && newPeriod) periodsByLease.set(l.id, newPeriod);
          }
        }

        const merged: LeaseWithPeriod[] = leasesData.map((l: any) => {
          const period = periodsByLease.get(l.id);
          return {
            leaseId: l.id,
            propertyName: l.properties?.name || 'Logement',
            propertyAddress: l.properties?.address || '',
            currentPeriod: period
              ? { id: period.id, amount_due: period.amount_due, amount_paid: period.amount_paid, deadline_date: period.deadline_date }
              : null,
          };
        });
        setLeases(merged);

        const { data: paymentsData } = await supabase
          .from('payments')
          .select('id, amount, status, created_at, operator, fedapay_transaction_id, rent_period_id, rent_periods:rent_period_id(lease_id, leases:lease_id(properties:property_id(name)))')
          .eq('tenant_id', profile.id)
          .eq('is_test_data', false)
          .order('created_at', { ascending: false })
          .limit(5);

        setRecentPayments((paymentsData || []).map((p: any) => ({
          ...p, propertyName: p.rent_periods?.leases?.properties?.name,
        })));
      }
    } catch (err) {
      console.error('[WebLocataireDashboard] Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const sortedLeases = [...leases].sort((a, b) => {
    const rank: Record<LeaseStatus, number> = { retard: 0, a_venir: 1, sans_periode: 2, solde: 3 };
    return rank[getLeaseStatus(a)] - rank[getLeaseStatus(b)];
  });

  const countRetard = sortedLeases.filter(l => getLeaseStatus(l) === 'retard').length;
  const totalDue = sortedLeases.reduce((sum, l) => {
    if (!l.currentPeriod) return sum;
    const rem = l.currentPeriod.amount_due - l.currentPeriod.amount_paid;
    return sum + Math.max(0, rem);
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
            Bonjour, {profile?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--imx-text-muted)' }}>
            Voici un aperçu de votre situation locative
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2.5 rounded-xl transition-colors hover:bg-[var(--imx-surface-2)]"
          style={{ color: 'var(--imx-text-muted)' }}
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div
          className="p-5 rounded-2xl"
          style={{ background: countRetard > 0 ? '#FEF2F2' : 'var(--imx-surface)', border: `1px solid ${countRetard > 0 ? '#FECACA' : 'var(--imx-border)'}` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: countRetard > 0 ? '#EF4444' : 'var(--imx-surface-2)', color: countRetard > 0 ? '#fff' : 'var(--imx-text-muted)' }}>
              <AlertCircle size={20} />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--imx-text-secondary)' }}>Retards</span>
          </div>
          <p className="text-3xl font-black" style={{ color: countRetard > 0 ? '#EF4444' : 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
            {countRetard}
          </p>
        </div>

        <div className="p-5 rounded-2xl" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}>
              <Building2 size={20} />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--imx-text-secondary)' }}>Logements actifs</span>
          </div>
          <p className="text-3xl font-black" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
            {leases.length}
          </p>
        </div>

        <div
          className="p-5 rounded-2xl"
          style={{ background: totalDue > 0 ? '#FFFBEB' : '#ECFDF5', border: `1px solid ${totalDue > 0 ? '#FDE68A' : '#A7F3D0'}` }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: totalDue > 0 ? '#F59E0B' : '#10B981', color: '#fff' }}>
              <CreditCard size={20} />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--imx-text-secondary)' }}>Restant à payer</span>
          </div>
          <p className="text-xl font-black" style={{ color: totalDue > 0 ? '#D97706' : '#10B981', fontFamily: 'Sora' }}>
            {formatMontant(totalDue)}
          </p>
        </div>
      </div>

      {/* Leases */}
      {sortedLeases.length === 0 ? (
        <div
          className="text-center py-12 rounded-2xl mb-8"
          style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
        >
          <Home size={40} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--imx-text-muted)' }} />
          <p className="font-semibold mb-1" style={{ color: 'var(--imx-text-primary)' }}>
            Aucun logement actif
          </p>
          <p className="text-sm mb-5" style={{ color: 'var(--imx-text-muted)' }}>
            Vous n'avez pas encore de bail actif sur ImoFlex.
          </p>
          <Link
            to="/web/annonces"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Search size={15} /> Rechercher un logement
          </Link>
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="font-bold text-[15px] mb-4" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
            Mes logements actifs
          </h2>
          <div className="space-y-3">
            {sortedLeases.map(lease => {
              const status = getLeaseStatus(lease);
              const cfg = STATUS_CONFIG[status];
              const remaining = lease.currentPeriod
                ? Math.max(0, lease.currentPeriod.amount_due - lease.currentPeriod.amount_paid)
                : 0;
              const daysLeft = lease.currentPeriod
                ? daysUntilDeadline(lease.currentPeriod.deadline_date)
                : null;

              return (
                <div
                  key={lease.leaseId}
                  className="p-5 rounded-2xl transition-all"
                  style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-[15px]" style={{ color: 'var(--imx-text-primary)' }}>
                        {lease.propertyName}
                      </h3>
                      {lease.propertyAddress && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--imx-text-muted)' }}>{lease.propertyAddress}</p>
                      )}
                    </div>
                    <span
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0"
                      style={{ background: cfg.bg, color: cfg.color }}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </div>

                  {lease.currentPeriod && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--imx-text-muted)' }}>Loyer du mois</p>
                        <p className="font-bold" style={{ color: 'var(--imx-text-primary)' }}>
                          {formatMontant(lease.currentPeriod.amount_due)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--imx-text-muted)' }}>Déjà payé</p>
                        <p className="font-bold" style={{ color: '#10B981' }}>
                          {formatMontant(lease.currentPeriod.amount_paid)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--imx-text-muted)' }}>Échéance</p>
                        <p className="font-bold" style={{ color: daysLeft !== null && daysLeft < 0 ? '#EF4444' : 'var(--imx-text-primary)' }}>
                          {formatDate(lease.currentPeriod.deadline_date)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Progress bar */}
                  {lease.currentPeriod && (
                    <div className="mb-4">
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--imx-surface-2)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (lease.currentPeriod.amount_paid / lease.currentPeriod.amount_due) * 100)}%`,
                            background: status === 'solde' ? '#10B981' : status === 'retard' ? '#EF4444' : '#F59E0B',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {status !== 'solde' && remaining > 0 && (
                      <Link
                        to={`/payer/${lease.leaseId}`}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                        style={{ background: 'var(--imx-accent)' }}
                      >
                        <CreditCard size={14} />
                        Payer {formatMontant(remaining)}
                      </Link>
                    )}
                    <Link
                      to={`/logement/${lease.leaseId}`}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-[var(--imx-surface-2)]"
                      style={{ border: '1px solid var(--imx-border)', color: 'var(--imx-text-secondary)' }}
                    >
                      <FileText size={14} />
                      Voir le détail
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent payments */}
      {recentPayments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[15px]" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
              Paiements récents
            </h2>
            <Link
              to="/historique"
              className="text-sm font-medium"
              style={{ color: 'var(--imx-accent)' }}
            >
              Voir l'historique
            </Link>
          </div>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
          >
            {recentPayments.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-4 p-4"
                style={{ borderTop: i > 0 ? '1px solid var(--imx-border)' : 'none' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={
                    p.status === 'valide'
                      ? { background: '#ECFDF5', color: '#10B981' }
                      : p.status === 'echoue'
                      ? { background: '#FEF2F2', color: '#EF4444' }
                      : { background: '#FFFBEB', color: '#F59E0B' }
                  }
                >
                  <CreditCard size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--imx-text-primary)' }}>
                    {p.propertyName ?? 'Logement'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--imx-text-muted)' }}>
                    {new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm" style={{ color: 'var(--imx-text-primary)' }}>
                    {formatMontant(p.amount)}
                  </p>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={
                      p.status === 'valide'
                        ? { background: '#ECFDF5', color: '#10B981' }
                        : p.status === 'echoue'
                        ? { background: '#FEF2F2', color: '#EF4444' }
                        : { background: '#FFFBEB', color: '#F59E0B' }
                    }
                  >
                    {p.status === 'valide' ? 'Validé' : p.status === 'echoue' ? 'Échoué' : 'En attente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
