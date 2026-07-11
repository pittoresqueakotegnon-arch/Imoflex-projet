import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Payment } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { formatMontant, formatDate, getMonthName, operatorColor, operatorLabel } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';

type FilterStatus = 'all' | 'valide' | 'echoue';

export default function Historique() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');

  useEffect(() => {
    const fetchPayments = async () => {
      if (!profile?.id) return;

      try {
        let query = supabase
          .from('payments')
          .select('*')
          .eq('tenant_id', profile.id)
          .order('created_at', { ascending: false });

        if (filter !== 'all') {
          query = query.eq('status', filter);
        }

        const { data, error } = await query;

        if (error) throw error;
        setPayments(data || []);
      } catch (err) {
        console.error('Error fetching payments:', err);
        showToast('Erreur lors du chargement de l\'historique', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [profile?.id, filter]);

  const groupedPayments = payments.reduce(
    (acc, payment) => {
      const date = new Date(payment.created_at);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthKey = `${month}-${year}`;

      if (!acc[monthKey]) {
        acc[monthKey] = { month, year, payments: [] };
      }
      acc[monthKey].payments.push(payment);

      return acc;
    },
    {} as Record<string, { month: number; year: number; payments: Payment[] }>
  );

  const sortedMonths = Object.entries(groupedPayments).sort((a, b) => {
    const [keyA] = a;
    const [keyB] = b;
    const [monthA, yearA] = keyA.split('-').map(Number);
    const [monthB, yearB] = keyB.split('-').map(Number);
    return yearB - yearA || monthB - monthA;
  });

  const currentMonthPayments = payments.filter((p) => {
    const date = new Date(p.created_at);
    const now = new Date();
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear() &&
      p.status === 'valide'
    );
  });

  const currentMonthTotal = currentMonthPayments.reduce((sum, p) => sum + p.amount, 0);

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
      {/* Header */}
      <header className="sticky-header px-4 py-3.5 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-[#E8E0FF] hover:text-[#A855F7] transition-colors p-1 -ml-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 className="font-nunito font-800 text-lg text-white">Historique</h1>
      </header>

      <div className="px-4 py-4 flex-1">
        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5 pb-0.5">
          {(['all', 'valide', 'echoue'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`filter-pill ${filter === status ? 'active' : 'inactive'}`}
            >
              {status === 'all' ? 'Tout' : status === 'valide' ? 'Validés' : 'Échoués'}
            </button>
          ))}
        </div>

        {/* Monthly Summary Card */}
        {currentMonthTotal > 0 && (
          <div className="card p-4 mb-6 bg-[#1A1240]">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-1">
                  Total {getMonthName(new Date().getMonth() + 1, new Date().getFullYear())}
                </p>
                <p className="font-nunito font-900 text-2xl amount text-white">
                  {currentMonthTotal.toLocaleString('fr-FR')} <span className="text-xs font-normal text-[#8B7BB5]">FCFA</span>
                </p>
              </div>
              <div className="text-right">
                <span className="badge-new">
                  {currentMonthPayments.length} validé{currentMonthPayments.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Payments List */}
        {payments.length > 0 ? (
          <div className="space-y-6">
            {sortedMonths.map(([monthKey, monthData]) => (
              <div key={monthKey}>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-3">
                  {getMonthName(monthData.month, monthData.year).toUpperCase()} {monthData.year}
                </p>

                <div className="space-y-2.5">
                  {monthData.payments.map((payment) => {
                    const operator = payment.operator || 'mtn';
                    const color = operatorColor(operator);
                    const isSuccess = payment.status === 'valide';
                    return (
                      <div key={payment.id} className="card p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Operator Circle */}
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {operator.substring(0, 1).toUpperCase()}
                          </div>

                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold">{operatorLabel(operator)}</p>
                              {isSuccess && (
                                <span className="text-emerald-500 text-xs">✔</span>
                              )}
                            </div>
                            <p className="text-[#8B7BB5] text-[10px]" style={{ fontFamily: 'Space Grotesk' }}>
                              Ref: {payment.fedapay_transaction_id?.substring(0, 8) || 'N/A'}
                            </p>
                          </div>
                        </div>

                        {/* Amount & Date */}
                        <div className="text-right">
                          <p className={`font-bold text-sm ${isSuccess ? 'text-[#EF4444]' : 'text-[#8B7BB5]'}`}>
                            -{formatMontant(payment.amount)}
                          </p>
                          <p className="text-[#8B7BB5] text-[10px]" style={{ fontFamily: 'Space Grotesk' }}>
                            {formatDate(payment.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<span className="text-5xl">📄</span>}
            title="Aucun versement"
            description="Vous n'avez pas encore effectué de versement"
          />
        )}
      </div>

      <BottomNav />
    </div>
  );
}
