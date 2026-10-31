import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard, AlertCircle, CheckCircle2, Clock, Building2,
  FileText, Home, Search, RefreshCw, KeyRound, X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../../../hooks/useAuth';
import { supabase, Payment } from '../../../lib/supabase';
import { formatMontant, daysUntilDeadline, formatDate } from '../../../lib/utils';
import { useToast } from '../../../components/Toast';

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

interface JoinedProperty {
  id: string;
  name: string;
  address: string;
  monthly_rent: number;
  payment_deadline_day: number;
  listing_id?: string;
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
  const { showToast } = useToast();

  const [leases, setLeases] = useState<LeaseWithPeriod[]>([]);
  const [recentPayments, setRecentPayments] = useState<(Payment & { propertyName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal Rejoindre un logement
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinStep, setJoinStep] = useState<'input' | 'confirm' | 'complete'>('input');
  const [accessCode, setAccessCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [previewProperty, setPreviewProperty] = useState<JoinedProperty | null>(null);

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

  const handleOpenJoinModal = () => {
    setAccessCode('');
    setJoinError(null);
    setPreviewProperty(null);
    setJoinStep('input');
    setJoinModalOpen(true);
  };

  const handleVerifyAccessCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = accessCode.trim().toUpperCase();
    if (!cleanCode) {
      setJoinError('Veuillez entrer un code d’accès.');
      return;
    }

    setJoinLoading(true);
    setJoinError(null);

    try {
      const { data, error } = await supabase
        .rpc('preview_property_by_access_code', { p_access_code: cleanCode })
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('Code d’accès invalide ou logement déjà occupé.');
      }

      setPreviewProperty(data as JoinedProperty);
      setJoinStep('confirm');
    } catch (err: any) {
      const msg = err?.message || 'Erreur lors de la vérification du code';
      setJoinError(msg);
      showToast(msg, 'error');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleConfirmJoin = async () => {
    if (!previewProperty || !profile?.id) return;

    setJoinLoading(true);
    setJoinError(null);

    try {
      const cleanCode = accessCode.trim().toUpperCase();
      const { error } = await supabase.rpc('join_property_with_access_code', {
        p_access_code: cleanCode,
      });

      if (error) throw error;

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });

      setJoinStep('complete');
      showToast('Logement rejoint avec succès !', 'success');
      fetchData();
    } catch (err: any) {
      let msg = 'Erreur lors de la liaison au logement.';
      if (err?.code === '23505' || err?.message?.includes('uniq_active_lease_per_property')) {
        msg = "Ce logement vient d'être attribué à un autre locataire.";
      } else if (err?.message) {
        msg = err.message;
      }
      setJoinError(msg);
      showToast(msg, 'error');
    } finally {
      setJoinLoading(false);
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
            Bonjour, {profile?.full_name?.split(' ')[0]}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--imx-text-muted)' }}>
            Voici un aperçu de votre situation locative
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenJoinModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: 'var(--imx-accent)' }}
          >
            <KeyRound size={15} />
            <span>Rejoindre un logement</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl transition-colors hover:bg-[var(--imx-surface-2)] border"
            style={{ color: 'var(--imx-text-muted)', borderColor: 'var(--imx-border)' }}
            title="Rafraîchir"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">

        {/* Retards */}
        <div
          className="web-kpi-card"
          style={countRetard > 0 ? { borderColor: '#FECACA' } : {}}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
            style={{ background: countRetard > 0 ? 'linear-gradient(90deg, #EF4444, #F87171)' : 'linear-gradient(90deg, #D1D5DB, #E5E7EB)' }}
          />
          <div className="flex items-start justify-between mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: countRetard > 0 ? '#FEF2F2' : 'var(--imx-surface-2)',
                color: countRetard > 0 ? '#EF4444' : 'var(--imx-text-muted)',
              }}
            >
              <AlertCircle size={19} strokeWidth={2} />
            </div>
            {countRetard > 0 && (
              <span className="web-badge web-badge-danger">Urgent</span>
            )}
          </div>
          <p
            className="text-3xl font-black mb-1"
            style={{ fontFamily: 'Sora, sans-serif', color: countRetard > 0 ? '#EF4444' : 'var(--imx-text-primary)' }}
          >
            {countRetard}
          </p>
          <p className="web-label">Loyer{countRetard > 1 ? 's' : ''} en retard</p>
        </div>

        {/* Logements actifs */}
        <div className="web-kpi-card accent">
          <div className="flex items-start justify-between mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}
            >
              <Building2 size={19} strokeWidth={2} />
            </div>
          </div>
          <p
            className="text-3xl font-black mb-1"
            style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
          >
            {leases.length}
          </p>
          <p className="web-label">Logement{leases.length > 1 ? 's' : ''} actif{leases.length > 1 ? 's' : ''}</p>
        </div>

        {/* Restant à payer */}
        <div
          className="web-kpi-card"
          style={{ borderColor: totalDue > 0 ? '#FDE68A' : '#A7F3D0' }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
            style={{ background: totalDue > 0 ? 'linear-gradient(90deg, #F59E0B, #FBBF24)' : 'linear-gradient(90deg, #10B981, #34D399)' }}
          />
          <div className="flex items-start justify-between mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: totalDue > 0 ? '#FFFBEB' : '#ECFDF5', color: totalDue > 0 ? '#D97706' : '#059669' }}
            >
              <CreditCard size={19} strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span
              className="text-2xl sm:text-3xl font-black"
              style={{ fontFamily: 'Sora, sans-serif', color: totalDue > 0 ? '#D97706' : '#059669' }}
            >
              {new Intl.NumberFormat('fr-FR').format(totalDue)}
            </span>
            <span className="text-xs font-bold" style={{ color: totalDue > 0 ? '#D97706' : '#059669' }}>
              FCFA
            </span>
          </div>
          <p className="web-label">Restant à payer ce mois</p>
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
          <p className="text-sm mb-6" style={{ color: 'var(--imx-text-muted)' }}>
            Vous n'avez pas encore de bail actif sur ImoFlex.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleOpenJoinModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
              style={{ background: 'var(--imx-accent)' }}
            >
              <KeyRound size={16} /> Rejoindre avec un code d'accès
            </button>
            <Link
              to="/web/annonces"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-[var(--imx-surface-2)]"
              style={{ borderColor: 'var(--imx-border)', color: 'var(--imx-text-primary)' }}
            >
              <Search size={16} /> Rechercher un logement
            </Link>
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="font-bold text-[15px] mb-4" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif' }}>
            Mes logements actifs
          </h2>
          <div className="space-y-4">
            {sortedLeases.map(lease => {
              const status = getLeaseStatus(lease);
              const cfg = STATUS_CONFIG[status];
              const remaining = lease.currentPeriod
                ? Math.max(0, lease.currentPeriod.amount_due - lease.currentPeriod.amount_paid)
                : 0;
              const progress = lease.currentPeriod
                ? Math.min(100, (lease.currentPeriod.amount_paid / lease.currentPeriod.amount_due) * 100)
                : 0;
              const daysLeft = lease.currentPeriod
                ? daysUntilDeadline(lease.currentPeriod.deadline_date)
                : null;

              return (
                <div
                  key={lease.leaseId}
                  className="web-card p-5"
                >
                  {/* Lease header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3
                        className="font-semibold text-base"
                        style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
                      >
                        {lease.propertyName}
                      </h3>
                      {lease.propertyAddress && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
                          {lease.propertyAddress}
                        </p>
                      )}
                    </div>
                    <span
                      className="web-badge flex-shrink-0"
                      style={{ background: cfg.bg, color: cfg.color }}
                    >
                      {cfg.label}
                    </span>
                  </div>

                  {/* Lease financials grid */}
                  {lease.currentPeriod && (
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div
                        className="rounded-xl p-3"
                        style={{ background: 'var(--imx-surface-2)' }}
                      >
                        <p className="web-label mb-1">Loyer du mois</p>
                        <div className="flex items-baseline gap-1">
                          <span
                            className="text-base font-bold"
                            style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif' }}
                          >
                            {new Intl.NumberFormat('fr-FR').format(lease.currentPeriod.amount_due)}
                          </span>
                          <span className="text-[11px] font-semibold text-[var(--imx-text-muted)]">FCFA</span>
                        </div>
                      </div>
                      <div
                        className="rounded-xl p-3"
                        style={{ background: '#ECFDF5' }}
                      >
                        <p className="web-label mb-1" style={{ color: '#059669' }}>Déjà payé</p>
                        <div className="flex items-baseline gap-1">
                          <span
                            className="text-base font-bold"
                            style={{ color: '#059669', fontFamily: 'Sora, sans-serif' }}
                          >
                            {new Intl.NumberFormat('fr-FR').format(lease.currentPeriod.amount_paid)}
                          </span>
                          <span className="text-[11px] font-semibold text-[#059669]/70">FCFA</span>
                        </div>
                      </div>
                      <div
                        className="rounded-xl p-3"
                        style={{ background: daysLeft !== null && daysLeft < 0 ? '#FEF2F2' : 'var(--imx-surface-2)' }}
                      >
                        <p className="web-label mb-1">Échéance</p>
                        <p
                          className="text-sm font-semibold"
                          style={{
                            color: daysLeft !== null && daysLeft < 0 ? '#EF4444' : 'var(--imx-text-primary)',
                            fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          {formatDate(lease.currentPeriod.deadline_date)}
                        </p>
                        {daysLeft !== null && (
                          <p className="text-xs mt-0.5" style={{ color: daysLeft < 0 ? '#EF4444' : 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}j de retard` : daysLeft === 0 ? "Aujourd'hui" : `Dans ${daysLeft}j`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Progress bar */}
                  {lease.currentPeriod && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="web-label">Progression du paiement</p>
                        <p className="text-xs font-semibold" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                          {Math.round(progress)}%
                        </p>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--imx-surface-2)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${progress}%`,
                            background: status === 'solde' ? 'linear-gradient(90deg, #10B981, #34D399)'
                              : status === 'retard' ? 'linear-gradient(90deg, #EF4444, #F87171)'
                              : 'linear-gradient(90deg, #F59E0B, #FBBF24)',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2.5">
                    {status !== 'solde' && remaining > 0 && (
                      <Link
                        to="/web/paiements"
                        className="web-btn web-btn-primary"
                        style={{ fontSize: '13px', padding: '8px 16px' }}
                      >
                        <CreditCard size={13} />
                        Payer {formatMontant(remaining)}
                      </Link>
                    )}
                    <Link
                      to="/web/documents"
                      className="web-btn web-btn-ghost"
                      style={{ fontSize: '13px', padding: '8px 16px' }}
                    >
                      <FileText size={13} />
                      Documents
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
            <h2 className="font-bold text-[15px]" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif' }}>
              Paiements récents
            </h2>
            <Link
              to="/web/paiements"
              className="text-sm font-medium"
              style={{ color: 'var(--imx-accent)' }}
            >
              Voir l'historique
            </Link>
          </div>
          <div
            className="web-card overflow-hidden"
          >
            <table className="web-table">
              <thead>
                <tr>
                  <th>Logement</th>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            background: p.status === 'valide' ? '#ECFDF5'
                              : p.status === 'echoue' ? '#FEF2F2'
                              : '#FFFBEB',
                            color: p.status === 'valide' ? '#059669'
                              : p.status === 'echoue' ? '#DC2626'
                              : '#D97706',
                          }}
                        >
                          <CreditCard size={14} />
                        </div>
                        <span className="font-medium text-sm" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}>
                          {p.propertyName ?? 'Logement'}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                      {new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <span className="font-bold" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif', fontSize: '14px' }}>
                        {formatMontant(p.amount)}
                      </span>
                    </td>
                    <td>
                      <span
                        className="web-badge"
                        style={{
                          background: p.status === 'valide' ? '#ECFDF5' : p.status === 'echoue' ? '#FEF2F2' : '#FFFBEB',
                          color: p.status === 'valide' ? '#059669' : p.status === 'echoue' ? '#DC2626' : '#D97706',
                        }}
                      >
                        {p.status === 'valide' ? 'Validé' : p.status === 'echoue' ? 'Échoué' : 'En attente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Modal Rejoindre un logement */}
      {joinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl bg-white border p-6 shadow-2xl relative"
            style={{ borderColor: 'var(--imx-border)' }}
          >
            <button
              onClick={() => setJoinModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:text-gray-700"
            >
              <X size={18} />
            </button>

            {joinStep === 'input' && (
              <div>
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}
                >
                  <KeyRound size={22} />
                </div>
                <h3 className="text-lg font-black text-center text-[#17132B] mb-1" style={{ fontFamily: 'Sora' }}>
                  Rejoindre un logement
                </h3>
                <p className="text-xs text-gray-500 text-center mb-5 leading-relaxed">
                  Entrez le code d’accès fourni par votre propriétaire ou votre agence pour activer votre bail.
                </p>

                {joinError && (
                  <div className="p-3 rounded-xl mb-4 text-xs bg-red-50 text-red-600 border border-red-200">
                    {joinError}
                  </div>
                )}

                <form onSubmit={handleVerifyAccessCode} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Code d’accès</label>
                    <input
                      type="text"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                      placeholder="EX: ABC123"
                      autoFocus
                      required
                      className="w-full px-4 py-3 rounded-xl border text-center text-lg font-mono tracking-widest uppercase font-bold outline-none"
                      style={{ borderColor: 'var(--imx-border)' }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={joinLoading || !accessCode.trim()}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    {joinLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      'Vérifier le code'
                    )}
                  </button>
                </form>
              </div>
            )}

            {joinStep === 'confirm' && previewProperty && (
              <div>
                <h3 className="text-lg font-black text-[#17132B] mb-1" style={{ fontFamily: 'Sora' }}>
                  Confirmer le logement
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Vérifiez que ce logement correspond bien à votre contrat de location.
                </p>

                {joinError && (
                  <div className="p-3 rounded-xl mb-4 text-xs bg-red-50 text-red-600 border border-red-200">
                    {joinError}
                  </div>
                )}

                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 mb-4 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-gray-500">Logement :</span>
                    <span className="font-bold text-gray-900 text-right">{previewProperty.name}</span>
                  </div>
                  {previewProperty.address && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500">Adresse :</span>
                      <span className="text-gray-700 text-right">{previewProperty.address}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Loyer mensuel :</span>
                    <span className="font-bold text-[#7B3FE4] text-sm">
                      {formatMontant(previewProperty.monthly_rent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Échéance mensuelle :</span>
                    <span className="text-gray-700 font-medium">
                      Le {previewProperty.payment_deadline_day} du mois
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-100 text-[11px] text-purple-900 mb-5 leading-relaxed">
                  En confirmant, ce logement sera rattaché à votre compte. Vous pourrez payer votre loyer et obtenir vos quittances en ligne.
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setJoinError(null); setJoinStep('input'); }}
                    className="w-1/3 py-3 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Retour
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmJoin}
                    disabled={joinLoading}
                    className="w-2/3 py-3 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    {joinLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      'Confirmer et rejoindre'
                    )}
                  </button>
                </div>
              </div>
            )}

            {joinStep === 'complete' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-lg font-black text-[#17132B] mb-2" style={{ fontFamily: 'Sora' }}>
                  Félicitations !
                </h3>
                <p className="text-xs text-gray-600 mb-6 leading-relaxed max-w-xs mx-auto">
                  Votre contrat de location a été activé avec succès. Vous pouvez dès maintenant gérer vos loyers et quittances.
                </p>
                <button
                  onClick={() => setJoinModalOpen(false)}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white shadow-md"
                  style={{ background: 'var(--imx-accent)' }}
                >
                  Accéder à mon tableau de bord
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
