import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Payment } from '../../lib/supabase';
import { formatMontant, daysUntilDeadline, getMonthName, operatorLabel } from '../../lib/utils';
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
        {leases.length === 0 ? (
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
            {leases.length > 1 && (
              <div className="flex items-center justify-between mb-4 mt-1">
                <h2 className="font-nunito font-black text-white text-[15px]">
                  Mes logements ({leases.length})
                </h2>
                <button
                  onClick={() => navigate('/rejoindre')}
                  className="text-[#A855F7] text-[11px] font-semibold"
                  style={{ fontFamily: 'Space Grotesk' }}
                >
                  + Rejoindre un logement
                </button>
              </div>
            )}

            <div className="space-y-4 mb-6">
              {leases.map((lease) => {
                const period = lease.currentPeriod;
                const paid = period?.amount_paid || 0;
                const due = period?.amount_due || 0;
                const remaining = Math.max(due - paid, 0);
                const percentage = due > 0 ? Math.min((paid / due) * 100, 100) : 0;
                const daysUntil = period ? daysUntilDeadline(period.deadline_date) : 0;

                return (
                  <div
                    key={lease.leaseId}
                    className="rounded-3xl p-6 text-white relative overflow-hidden"
                    style={{ background: 'linear-gradient(135deg, #2D1B69 0%, #170E3D 100%)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div
                      className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
                      style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)' }}
                    />

                    <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-wider mb-1 relative z-10">
                      {lease.propertyName} — {getMonthName(now.getMonth() + 1, now.getFullYear()).toUpperCase()}
                    </p>
                    {lease.propertyAddress && (
                      <p className="text-[#645A8A] text-[10px] font-space-grotesk mb-3 relative z-10">{lease.propertyAddress}</p>
                    )}

                    {period ? (
                      <>
                        <div className="mb-5 relative z-10">
                          <p className="font-nunito font-black text-[2.2rem] amount leading-none">
                            {paid.toLocaleString('fr-FR')} <span className="text-[1.3rem] font-normal text-[#8B7BB5]">FCFA</span>
                          </p>
                          <p className="text-[#8B7BB5] text-xs mt-1" style={{ fontFamily: 'Space Grotesk' }}>
                            Payé sur {formatMontant(due)}
                          </p>
                        </div>

                        <div className="mb-4 relative z-10">
                          <div className="h-1.5 rounded-full w-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                            <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: '#A855F7' }} />
                          </div>
                          <div className="flex justify-between mt-2 text-[10px] font-bold" style={{ fontFamily: 'Space Grotesk' }}>
                            <span style={{ color: '#A855F7' }}>{Math.round(percentage)}% payé</span>
                            <span className="text-[#8B7BB5]">{Math.round(100 - percentage)}% restant</span>
                          </div>
                        </div>

                        {daysUntil > 0 && remaining > 0 && (
                          <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full relative z-10" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <span className="text-[11px]">⏳</span>
                            <span className="text-[10px] font-bold text-[#EF4444]" style={{ fontFamily: 'Space Grotesk' }}>Échéance dans {daysUntil} jours</span>
                          </div>
                        )}

                        <button
                          onClick={() => navigate(`/payer/${lease.leaseId}`)}
                          disabled={remaining === 0}
                          className="w-full text-white font-bold rounded-2xl py-4 flex items-center justify-center gap-2 relative z-10 disabled:opacity-50"
                          style={{ background: '#A855F7', fontFamily: 'Nunito', fontSize: '14px' }}
                        >
                          <span>💳</span> {remaining === 0 ? 'Loyer soldé ✓' : 'Effectuer un versement'}
                        </button>
                      </>
                    ) : (
                      <p className="text-[#8B7BB5] text-xs relative z-10" style={{ fontFamily: 'Space Grotesk' }}>
                        Aucune période de loyer en cours pour ce logement.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {leases.length === 1 && (
              <button
                onClick={() => navigate('/rejoindre')}
                className="w-full text-[#A855F7] font-bold rounded-2xl py-3.5 mb-8 text-[13px]"
                style={{ background: 'transparent', border: '1px solid rgba(168, 85, 247, 0.3)', fontFamily: 'Nunito' }}
              >
                + Rejoindre un autre logement
              </button>
            )}

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl p-4" style={{ background: 'rgba(38, 28, 85, 0.4)' }}>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold mb-1">Restant total</p>
                <p className="font-nunito font-black text-[18px]" style={{ color: '#A855F7' }}>
                  {new Intl.NumberFormat('fr-FR').format(
                    leases.reduce((sum, l) => sum + Math.max((l.currentPeriod?.amount_due || 0) - (l.currentPeriod?.amount_paid || 0), 0), 0)
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
                  {recentPayments.slice(0, 3).map((payment) => {
                    const operator = payment.operator || 'mtn';
                    return (
                      <div key={payment.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#1A1240' }}>
                            <div className="w-4 h-4 rounded-full" style={{ background: '#FBBF24' }}></div>
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-white mb-0.5 font-nunito">Versement {operatorLabel(operator)}</p>
                            <p className="text-[#8B7BB5] text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                              {payment.propertyName || 'Logement'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-black text-[15px] font-nunito">- {new Intl.NumberFormat('fr-FR').format(payment.amount)}</p>
                        </div>
                      </div>
                    );
                  })}
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
