import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Lease, RentPeriod, Payment } from '../../lib/supabase';
import { formatMontant, formatDate, daysUntilDeadline, getMonthName, operatorColor, operatorLabel } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import ProgressBar from '../../components/ProgressBar';

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [activeLease, setActiveLease] = useState<Lease | null>(null);
  const [currentRentPeriod, setCurrentRentPeriod] = useState<RentPeriod | null>(null);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) return;

      try {
        // Fetch active lease
        const { data: leaseData, error: leaseError } = await supabase
          .from('leases')
          .select(`
            *,
            properties:property_id(*)
          `)
          .eq('tenant_id', profile.id)
          .eq('status', 'actif')
          .maybeSingle();

        if (leaseError) throw leaseError;

        if (leaseData) {
          setActiveLease(leaseData);

          // Fetch current month rent period
          const now = new Date();
          const { data: periodData, error: periodError } = await supabase
            .from('rent_periods')
            .select('*')
            .eq('lease_id', leaseData.id)
            .eq('period_month', now.getMonth() + 1)
            .eq('period_year', now.getFullYear())
            .maybeSingle();

          if (periodError && periodError.code !== 'PGRST116') throw periodError;
          if (periodData) setCurrentRentPeriod(periodData);

          // Fetch recent payments
          const { data: paymentsData, error: paymentsError } = await supabase
            .from('payments')
            .select('*')
            .eq('tenant_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(5);

          if (paymentsError) throw paymentsError;
          setRecentPayments(paymentsData || []);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id]);

  const firstName = profile?.full_name?.split(' ')[0] || 'Kofi';
  const lastName = profile?.full_name?.split(' ').slice(1).join(' ') || 'Mensah';
  const daysUntil = currentRentPeriod ? daysUntilDeadline(currentRentPeriod.deadline_date) : 0;

  const getDeadlineBadgeClass = () => {
    if (daysUntil < 5) return 'badge-solid-red';
    if (daysUntil < 10) return 'badge-solid-amber';
    return 'badge-solid-violet';
  };

  const getRentPaymentProgress = () => {
    if (!currentRentPeriod) return { percentage: 0, paid: 0, due: 0, remaining: 0 };
    const percentage = Math.min((currentRentPeriod.amount_paid / currentRentPeriod.amount_due) * 100, 100);
    return {
      percentage,
      paid: currentRentPeriod.amount_paid,
      due: currentRentPeriod.amount_due,
      remaining: Math.max(currentRentPeriod.amount_due - currentRentPeriod.amount_paid, 0),
    };
  };

  const now = new Date();
  const paymentsThisMonth = recentPayments.filter((p) => {
    const d = new Date(p.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const progress = getRentPaymentProgress();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="flex justify-between items-center px-4 pt-6 pb-4">
        <div>
          <span className="text-[#8B7BB5] text-xs font-space-grotesk">Bonjour ☀️</span>
          <h1 className="font-nunito font-900 text-xl text-white">{firstName} {lastName}</h1>
        </div>
        <Link to="/notifications" className="relative btn-icon">
          <Bell size={20} />
          {/* Notifications dot */}
          <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FBBF24] rounded-full"></div>
        </Link>
      </div>

      <div className="px-4 flex-1">
        {!activeLease ? (
          // No active lease state (État vide)
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

            {/* divider */}
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
          // Active lease state
          <>
            {/* Loyer Card with gradient and pattern */}
            <div
              className="rounded-3xl p-6 mb-5 text-white relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #2D1B69 0%, #170E3D 100%)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              {/* Subtle top-right glow */}
              <div
                className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)' }}
              />

              <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-wider mb-2 relative z-10">
                LOYER — {getMonthName(new Date().getMonth() + 1, new Date().getFullYear()).toUpperCase()} {new Date().getFullYear()}
              </p>

              <div className="mb-5 relative z-10">
                <p className="font-nunito font-black text-[2.5rem] amount leading-none">
                  {formatMontant(progress.paid)} <span className="text-[1.5rem] font-normal text-[#8B7BB5]">FCFA</span>
                </p>
                <p className="text-[#8B7BB5] text-xs mt-1" style={{ fontFamily: 'Space Grotesk' }}>
                  Payé sur {formatMontant(progress.due)} FCFA
                </p>
              </div>

              {/* Progress Bar */}
              <div className="mb-4 relative z-10">
                <div className="h-1.5 rounded-full w-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${progress.percentage}%`, background: '#A855F7' }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] font-bold" style={{ fontFamily: 'Space Grotesk' }}>
                  <span style={{ color: '#A855F7' }}>{Math.round(progress.percentage)}% payé</span>
                  <span className="text-[#8B7BB5]">{Math.round(100 - progress.percentage)}% restant</span>
                </div>
              </div>

              {/* Deadline Badge */}
              {daysUntil > 0 && (
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full relative z-10" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <span className="text-[11px]">⏳</span>
                  <span className="text-[10px] font-bold text-[#EF4444]" style={{ fontFamily: 'Space Grotesk' }}>Échéance dans {daysUntil} jours</span>
                </div>
              )}
            </div>

            {/* Mini Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-2xl p-4" style={{ background: 'rgba(38, 28, 85, 0.4)' }}>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold mb-1">Restant</p>
                <p className="font-nunito font-black text-[18px]" style={{ color: '#A855F7' }}>{new Intl.NumberFormat('fr-FR').format(progress.remaining)} F</p>
              </div>
              <div className="rounded-2xl p-4" style={{ background: 'rgba(38, 28, 85, 0.4)' }}>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold mb-1">Ce mois</p>
                <p className="font-nunito font-black text-[18px]" style={{ color: '#22C55E' }}>{paymentsThisMonth} versement{paymentsThisMonth !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Pay Button */}
            <button
              onClick={() => navigate('/payer')}
              className="w-full text-white font-bold rounded-2xl py-4 flex items-center justify-center gap-2 mb-8"
              style={{ background: '#A855F7', fontFamily: 'Nunito', fontSize: '15px' }}
            >
              <span>💳</span> Effectuer un versement
            </button>

            {/* Recent Payments */}
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
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: '#1A1240' }}
                          >
                            <div className="w-4 h-4 rounded-full" style={{ background: '#FBBF24' }}></div>
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-white mb-0.5 font-nunito">Versement {operatorLabel(operator)}</p>
                            <p className="text-[#8B7BB5] text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                              Aujourd'hui
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
