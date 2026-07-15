import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Payment } from '../../lib/supabase';
import { daysUntilDeadline } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';

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

function sortLeases(leases: LeaseWithPeriod[]): LeaseWithPeriod[] {
  const statusRank: Record<LeaseStatus, number> = { retard: 0, a_venir: 1, sans_periode: 2, solde: 3 };
  return [...leases].sort((a, b) => {
    const rankDiff = statusRank[getLeaseStatus(a)] - statusRank[getLeaseStatus(b)];
    if (rankDiff !== 0) return rankDiff;
    const daysA = a.currentPeriod ? daysUntilDeadline(a.currentPeriod.deadline_date) : 0;
    const daysB = b.currentPeriod ? daysUntilDeadline(b.currentPeriod.deadline_date) : 0;
    return daysA - daysB;
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile, loading: authLoading } = useAuth();

  const [leases, setLeases] = useState<LeaseWithPeriod[]>([]);
  const [recentPayments, setRecentPayments] = useState<(Payment & { propertyName?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const { data: leasesData, error: leasesError } = await supabase
          .from('leases')
          .select('id, tenant_id, status, properties:property_id(id, name, address)')
          .eq('tenant_id', profile.id)
          .eq('status', 'actif')
          .order('created_at', { ascending: true });

        if (leasesError) throw leasesError;

        if (leasesData && leasesData.length > 0) {
          const leaseIds = leasesData.map((l) => l.id);
          const now = new Date();

          const { data: periodsData, error: periodsError } = await supabase
            .from('rent_periods')
            .select('id, lease_id, amount_due, amount_paid, deadline_date, status')
            .in('lease_id', leaseIds)
            .eq('period_month', now.getMonth() + 1)
            .eq('period_year', now.getFullYear());

          if (periodsError) throw periodsError;

          const periodsByLease = new Map(
            (periodsData || []).map((p) => [p.lease_id, p])
          );

          const merged: LeaseWithPeriod[] = leasesData.map((l: any) => {
            const period = periodsByLease.get(l.id);
            return {
              leaseId: l.id,
              propertyName: l.properties?.name || 'Logement',
              propertyAddress: l.properties?.address || '',
              currentPeriod: period
                ? {
                    id: period.id,
                    amount_due: period.amount_due,
                    amount_paid: period.amount_paid,
                    deadline_date: period.deadline_date,
                  }
                : null,
            };
          });

          setLeases(merged);

          const { data: paymentsData, error: paymentsError } = await supabase
            .from('payments')
            .select(
              'id, amount, status, created_at, operator, fedapay_transaction_id, rent_period_id, rent_periods:rent_period_id(lease_id, leases:lease_id(properties:property_id(name)))'
            )
            .eq('tenant_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(5);

          if (paymentsError) throw paymentsError;

          const paymentsWithProperty = (paymentsData || []).map((p: any) => ({
            ...p,
            propertyName: p.rent_periods?.leases?.properties?.name,
          }));

          setRecentPayments(paymentsWithProperty);
        }
      } catch (err) {
        console.error('[Dashboard] Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id, authLoading]);

  const firstName = profile?.full_name?.split(' ')[0] || '';
  const lastName = profile?.full_name?.split(' ').slice(1).join(' ') || '';

  const now = new Date();
  const paymentsThisMonth = recentPayments.filter((p) => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const sortedLeases = sortLeases(leases);
  const countRetard = sortedLeases.filter((l) => getLeaseStatus(l) === 'retard').length;
  const countEnCours = sortedLeases.filter((l) => getLeaseStatus(l) === 'a_venir').length;
  const countSolde = sortedLeases.filter((l) => getLeaseStatus(l) === 'solde').length;

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="flex justify-between items-center px-4 pt-6 pb-4">
        <div>
          <span className="text-[#8B7BB5] text-xs font-space-grotesk">Bonjour ☀️</span>
          <h1 className="font-nunito font-900 text-xl text-white">{firstName} {lastName}</h1>
        </div>
        <Link to="/notifications" className="relative btn-icon">
          <Bell size={20} />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FBBF24] rounded-full"></div>
        </Link>
      </div>

      <div className="px-4 flex-1">
        {sortedLeases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <span className="text-6xl mb-6">🔑</span>
            <h2 className="font-nunito font-black text-[18px] text-white mb-3">Pas encore de logement actif</h2>
            <p className="text-[#8B7BB5] text-xs text-center max-w-[280px] leading-[1.6] mb-8" style={{ fontFamily: 'Space Grotesk' }}>
              Une fois votre logement trouvé sur la marketplace, rejoignez-le ici avec le code fourni par le propriétaire.
            </p>
            <button
              onClick={() => navigate('/rejoindre')}
              className="w-full text-white font-bold rounded-2xl py-[18px]"
              style={{ background: '#A855F7', fontFamily: 'Nunito', fontSize: '15px' }}
            >
              J'ai un code d'accès
            </button>

            <div className="w-full h-px bg-[rgba(255,255,255,0.05)] my-8"></div>

            <h3 className="text-white font-nunito font-black text-[15px] mb-5 self-start text-left w-full">En attendant, continuez votre recherche</h3>

            <button
              onClick={() => navigate('/')}
              className="w-full text-[#A855F7] font-bold rounded-2xl py-[18px]"
              style={{ background: 'transparent', border: '1px solid rgba(168, 85, 247, 0.4)', fontFamily: 'Nunito', fontSize: '15px' }}
            >
              Explorer la marketplace
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1 mt-1">
              <h2 className="font-nunito font-black text-white text-[15px]">
                Mes logements ({sortedLeases.length})
              </h2>
              <button
                onClick={() => navigate('/rejoindre')}
                className="text-[#A855F7] text-[11px] font-semibold"
                style={{ fontFamily: 'Space Grotesk' }}
              >
                + Rejoindre
              </button>
            </div>

            {sortedLeases.length > 1 && (
              <p className="text-[#8B7BB5] text-[11px] mb-4" style={{ fontFamily: 'Space Grotesk' }}>
                {countRetard > 0 && <span style={{ color: '#EF4444' }}>{countRetard} en retard</span>}
                {countRetard > 0 && (countEnCours > 0 || countSolde > 0) && ' · '}
                {countEnCours > 0 && <span>{countEnCours} en cours</span>}
                {countEnCours > 0 && countSolde > 0 && ' · '}
                {countSolde > 0 && <span>{countSolde} soldé{countSolde > 1 ? 's' : ''}</span>}
              </p>
            )}

            <div className="flex flex-col gap-2 mb-6">
              {sortedLeases.map((lease) => {
                const status = getLeaseStatus(lease);
                const period = lease.currentPeriod;
                const remaining = period ? Math.max(period.amount_due - period.amount_paid, 0) : 0;
                const daysLeft = period ? daysUntilDeadline(period.deadline_date) : 0;

                const statusIcon =
                  status === 'retard' ? (
                    <AlertCircle size={18} color="#EF4444" />
                  ) : status === 'solde' ? (
                    <CheckCircle2 size={18} color="#22C55E" />
                  ) : (
                    <Clock size={18} color="#F59E0B" />
                  );

                const statusText =
                  status === 'retard'
                    ? `En retard de ${Math.abs(daysLeft)} jour${Math.abs(daysLeft) > 1 ? 's' : ''}`
                    : status === 'solde'
                    ? 'Loyer soldé'
                    : status === 'sans_periode'
                    ? 'Aucune période en cours'
                    : `Échéance dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`;

                const statusColor = status === 'retard' ? '#EF4444' : status === 'solde' ? '#22C55E' : '#8B7BB5';

                return (
                  <button
                    key={lease.leaseId}
                    onClick={() => navigate(`/logement/${lease.leaseId}`)}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left w-full"
                    style={{
                      background: '#1E1545',
                      border: status === 'retard' ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(255,255,255,0.05)',
                      opacity: status === 'solde' ? 0.7 : 1,
                    }}
                  >
                    <div className="flex-shrink-0">{statusIcon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-nunito font-bold text-[14px] truncate">{lease.propertyName}</p>
                      <p className="text-[12px] truncate" style={{ color: statusColor, fontFamily: 'Space Grotesk' }}>
                        {statusText}
                      </p>
                    </div>
                    {period && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-white font-nunito font-bold text-[14px]">
                          {new Intl.NumberFormat('fr-FR').format(remaining)} F
                        </p>
                        <p className="text-[10px] text-[#645A8A]" style={{ fontFamily: 'Space Grotesk' }}>restant</p>
                      </div>
                    )}
                    <ChevronRight size={16} color="#645A8A" className="flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl p-4" style={{ background: 'rgba(38, 28, 85, 0.4)' }}>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold mb-1">Restant total</p>
                <p className="font-nunito font-black text-[18px]" style={{ color: '#A855F7' }}>
                  {new Intl.NumberFormat('fr-FR').format(
                    sortedLeases.reduce((sum, l) => sum + Math.max((l.currentPeriod?.amount_due || 0) - (l.currentPeriod?.amount_paid || 0), 0), 0)
                  )} F
                </p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: 'rgba(38, 28, 85, 0.4)' }}>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold mb-1">Ce mois</p>
                <p className="font-nunito font-black text-[18px]" style={{ color: '#22C55E' }}>{paymentsThisMonth} versement{paymentsThisMonth !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {recentPayments.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-nunito font-black text-white text-[15px]">Derniers versements</h2>
                  <Link to="/historique" className="text-[#A855F7] text-[11px] font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
                    Voir tout →
                  </Link>
                </div>

                <div className="space-y-3">
                  {recentPayments.slice(0, 3).map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#1A1240' }}>
                          <div className="w-4 h-4 rounded-full" style={{ background: '#FBBF24' }}></div>
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-white mb-0.5 font-nunito">{payment.propertyName || 'Logement'}</p>
                          <p className="text-[#8B7BB5] text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                            {new Date(payment.created_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-black text-[15px] font-nunito">- {new Intl.NumberFormat('fr-FR').format(payment.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
