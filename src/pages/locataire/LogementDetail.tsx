import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Payment } from '../../lib/supabase';
import { formatMontant, daysUntilDeadline, getMonthName, operatorLabel } from '../../lib/utils';

interface RentPeriodLite {
  id: string;
  amount_due: number;
  amount_paid: number;
  deadline_date: string;
}

export default function LogementDetail() {
  const navigate = useNavigate();
  const { leaseId } = useParams<{ leaseId: string }>();
  const { profile } = useAuth();

  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [currentPeriod, setCurrentPeriod] = useState<RentPeriodLite | null>(null);
  const [leasePayments, setLeasePayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id || !leaseId) return;

      try {
        const { data: leaseData, error: leaseError } = await supabase
          .from('leases')
          .select('id, tenant_id, status, properties:property_id(name, address)')
          .eq('id', leaseId)
          .eq('tenant_id', profile.id)
          .eq('status', 'actif')
          .maybeSingle();

        if (leaseError) throw leaseError;

        if (!leaseData) {
          setNotFound(true);
          return;
        }

        setPropertyName((leaseData as any).properties?.name || 'Logement');
        setPropertyAddress((leaseData as any).properties?.address || '');

        const now = new Date();
        const { data: periodData, error: periodError } = await supabase
          .from('rent_periods')
          .select('id, amount_due, amount_paid, deadline_date')
          .eq('lease_id', leaseId)
          .eq('period_month', now.getMonth() + 1)
          .eq('period_year', now.getFullYear())
          .maybeSingle();

        if (periodError && periodError.code !== 'PGRST116') throw periodError;
        setCurrentPeriod(periodData || null);

        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('id, amount, status, created_at, operator, fedapay_transaction_id, rent_periods!inner(lease_id)')
          .eq('tenant_id', profile.id)
          .eq('rent_periods.lease_id', leaseId)
          .order('created_at', { ascending: false })
          .limit(5);

        if (paymentsError) throw paymentsError;
        const cleaned: Payment[] = (paymentsData || []).map(({ rent_periods, ...rest }: any) => rest);
        setLeasePayments(cleaned);
      } catch (err) {
        console.error('[LogementDetail] Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id, leaseId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#120D2A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] p-6 flex flex-col">
        <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-[#1E1545] rounded-lg transition-colors w-fit">
          <ChevronLeft size={24} />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#8B7BB5]">Logement introuvable ou inactif</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const paid = currentPeriod?.amount_paid || 0;
  const due = currentPeriod?.amount_due || 0;
  const remaining = Math.max(due - paid, 0);
  const percentage = due > 0 ? Math.min((paid / due) * 100, 100) : 0;
  const daysUntil = currentPeriod ? daysUntilDeadline(currentPeriod.deadline_date) : 0;
  const isLate = daysUntil < 0 && remaining > 0;

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/dashboard')} className="p-3 bg-[#1E1545] hover:bg-[#2A1E5C] rounded-2xl transition-colors">
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div>
          <h1 className="font-nunito font-900 text-[19px] text-white leading-tight">{propertyName}</h1>
          {propertyAddress && (
            <p className="text-[#8B7BB5] text-[12px]" style={{ fontFamily: 'Space Grotesk' }}>{propertyAddress}</p>
          )}
        </div>
      </div>

      {currentPeriod ? (
        <>
          <div
            className="rounded-3xl p-6 text-white relative overflow-hidden mb-6"
            style={{ background: 'linear-gradient(135deg, #2D1B69 0%, #170E3D 100%)', border: isLate ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.05)' }}
          >
            <div
              className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)' }}
            />

            <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-bold uppercase tracking-wider mb-4 relative z-10">
              Loyer — {getMonthName(now.getMonth() + 1, now.getFullYear())}
            </p>

            <div className="mb-5 relative z-10">
              <p className="font-nunito font-black text-[2.2rem] leading-none">
                {paid.toLocaleString('fr-FR')} <span className="text-[1.3rem] font-normal text-[#8B7BB5]">FCFA</span>
              </p>
              <p className="text-[#8B7BB5] text-xs mt-1" style={{ fontFamily: 'Space Grotesk' }}>
                Payé sur {formatMontant(due)}
              </p>
            </div>

            <div className="mb-4 relative z-10">
              <div className="h-1.5 rounded-full w-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full" style={{ width: `${percentage}%`, background: isLate ? '#EF4444' : '#A855F7' }} />
              </div>
              <div className="flex justify-between mt-2 text-[10px] font-bold" style={{ fontFamily: 'Space Grotesk' }}>
                <span style={{ color: isLate ? '#EF4444' : '#A855F7' }}>{Math.round(percentage)}% payé</span>
                <span className="text-[#8B7BB5]">{Math.round(100 - percentage)}% restant</span>
              </div>
            </div>

            {remaining > 0 && (
              <div
                className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full relative z-10"
                style={{
                  background: isLate ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.15)',
                  border: `1px solid ${isLate ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.25)'}`,
                }}
              >
                <span className="text-[11px]">{isLate ? '⚠️' : '⏳'}</span>
                <span className="text-[10px] font-bold" style={{ color: isLate ? '#EF4444' : '#F59E0B', fontFamily: 'Space Grotesk' }}>
                  {isLate ? `En retard de ${Math.abs(daysUntil)} jours` : `Échéance dans ${daysUntil} jours`}
                </span>
              </div>
            )}

            <button
              onClick={() => navigate(`/payer/${leaseId}`)}
              disabled={remaining === 0}
              className="w-full text-white font-bold rounded-2xl py-4 flex items-center justify-center gap-2 relative z-10 disabled:opacity-50"
              style={{ background: '#A855F7', fontFamily: 'Nunito', fontSize: '14px' }}
            >
              <span>💳</span> {remaining === 0 ? 'Loyer soldé ✓' : 'Effectuer un versement'}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-3xl p-6 mb-6" style={{ background: '#1E1545' }}>
          <p className="text-[#8B7BB5] text-sm" style={{ fontFamily: 'Space Grotesk' }}>
            Aucune période de loyer en cours pour ce logement.
          </p>
        </div>
      )}

      <h2 className="font-nunito font-black text-white text-[15px] mb-4">Versements pour ce logement</h2>
      {leasePayments.length === 0 ? (
        <p className="text-[#8B7BB5] text-[13px]" style={{ fontFamily: 'Space Grotesk' }}>Aucun versement pour l'instant.</p>
      ) : (
        <div className="space-y-3">
          {leasePayments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#1A1240' }}>
                  <div className="w-4 h-4 rounded-full" style={{ background: '#FBBF24' }}></div>
                </div>
                <div>
                  <p className="text-[14px] font-bold text-white mb-0.5 font-nunito">Versement {operatorLabel(payment.operator || 'mtn')}</p>
                  <p className="text-[#8B7BB5] text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                    {new Date(payment.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              <p className="text-white font-black text-[15px] font-nunito">- {new Intl.NumberFormat('fr-FR').format(payment.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
