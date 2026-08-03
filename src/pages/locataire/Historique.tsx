import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownLeft, Calendar, FileText, Download, X, Printer } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Payment } from '../../lib/supabase';

type PaymentWithProperty = Payment & { propertyName?: string };
import { useToast } from '../../components/Toast';
import { formatMontant, formatDate, getMonthName, operatorColor, operatorLabel } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { BackButton } from '../../components/BackButton';

type FilterStatus = 'all' | 'valide' | 'echoue';

export default function Historique() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [payments, setPayments] = useState<PaymentWithProperty[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<(Payment & { propertyName?: string }) | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [selectedLeaseId, setSelectedLeaseId] = useState<string>('all');

  useEffect(() => {
    const fetchPayments = async () => {
      if (!profile?.id) return;

      try {
        // Fetch active leases for filter
        const { data: leasesData } = await supabase
          .from('leases')
          .select('id, properties:property_id(name)')
          .eq('tenant_id', profile.id)
          .eq('status', 'actif');
          
        setLeases(leasesData || []);

        let query = supabase
          .from('payments')
          .select(
            'id, created_at, operator, status, fedapay_transaction_id, amount, rent_periods:rent_period_id(lease_id, leases:lease_id(properties:property_id(name)))'
          )
          .eq('tenant_id', profile.id)
          .eq('is_test_data', false)
          .order('created_at', { ascending: false });

        if (filter !== 'all') {
          query = query.eq('status', filter);
        }
        
        if (selectedLeaseId !== 'all') {
          query = query.eq('rent_periods.lease_id', selectedLeaseId);
        }

        const { data, error } = await query;

        if (error) throw error;

        const withProperty: PaymentWithProperty[] = (data || []).map((p: any) => ({
          ...p,
          propertyName: p.rent_periods?.leases?.properties?.name,
        }));

        setPayments(withProperty);
      } catch (err) {
        console.error('Error fetching payments:', err);
        showToast('Erreur lors du chargement de l\'historique', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchPayments();
  }, [profile?.id, filter, selectedLeaseId]);

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
    {} as Record<string, { month: number; year: number; payments: PaymentWithProperty[] }>
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
        <BackButton />
        <h1 className="font-nunito font-800 text-lg text-white">Historique</h1>
      </header>

      <div className="px-4 py-4 flex-1">
        {/* Filters */}
        <div className="mb-5 space-y-3">
          {leases.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              <button
                onClick={() => setSelectedLeaseId('all')}
                className={`flex-shrink-0 px-4 py-2 rounded-2xl font-nunito font-700 text-sm transition-all whitespace-nowrap ${
                  selectedLeaseId === 'all'
                    ? 'bg-[#A855F7] text-white'
                    : 'bg-[#1A1240] text-[#8B7BB5] border border-[rgba(255,255,255,0.05)]'
                }`}
              >
                Tous les logements
              </button>
              {leases.map((lease) => (
                <button
                  key={lease.id}
                  onClick={() => setSelectedLeaseId(lease.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-2xl font-nunito font-700 text-sm transition-all whitespace-nowrap ${
                    selectedLeaseId === lease.id
                      ? 'bg-[#A855F7] text-white'
                      : 'bg-[#1A1240] text-[#8B7BB5] border border-[rgba(255,255,255,0.05)]'
                  }`}
                >
                  {lease.properties?.name || 'Logement'}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {(['all', 'valide', 'echoue'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`filter-pill ${filter === status ? 'active' : 'inactive'}`}
              >
                {status === 'all' ? 'Tous les statuts' : status === 'valide' ? 'Validés' : 'Échoués'}
              </button>
            ))}
          </div>
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
                              {payment.propertyName ? `${payment.propertyName} · ` : ''}Ref: {payment.fedapay_transaction_id?.substring(0, 8) || 'N/A'}
                            </p>
                          </div>
                        </div>

                        {/* Amount, Date & Download */}
                        <div className="flex flex-col items-end gap-1.5">
                          <p className={`font-bold text-sm ${isSuccess ? 'text-[#EF4444]' : 'text-[#8B7BB5]'}`}>
                            -{formatMontant(payment.amount)}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-[#8B7BB5] text-[10px]" style={{ fontFamily: 'Space Grotesk' }}>
                              {formatDate(payment.created_at)}
                            </p>
                            {isSuccess && (
                              <button
                                onClick={() => setSelectedReceipt(payment)}
                                className="p-1 rounded-full bg-[#1A1240] border border-white/10 text-[#A855F7] hover:bg-[#A855F7] hover:text-white transition-colors"
                              >
                                <Download size={14} />
                              </button>
                            )}
                          </div>
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

      {/* ── Modale Reçu de Paiement (PDF Print) ── */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white rounded-[24px] w-full max-w-sm overflow-hidden flex flex-col relative printable-receipt">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 z-10 no-print"
            >
              <X size={20} />
            </button>
            <div className="p-6 text-center border-b border-gray-100 bg-gray-50">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                <Printer size={20} />
              </div>
              <h2 className="font-nunito font-black text-xl text-gray-900">Reçu Officiel</h2>
              <p className="text-sm text-gray-500 font-space-grotesk mt-1">ImoFlex Paiments</p>
            </div>
            <div className="p-6 space-y-4 font-space-grotesk">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-900">{new Date(selectedReceipt.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Montant</span>
                <span className="font-bold text-gray-900 text-base">{formatMontant(selectedReceipt.amount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Logement</span>
                <span className="font-medium text-gray-900">{selectedReceipt.propertyName || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Référence</span>
                <span className="font-mono text-gray-900 text-xs bg-gray-100 px-2 py-1 rounded">{selectedReceipt.fedapay_transaction_id}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Opérateur</span>
                <span className="font-medium text-gray-900 capitalize">{selectedReceipt.operator}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Statut</span>
                <span className="font-bold text-emerald-600 uppercase tracking-wide text-xs">PAYÉ</span>
              </div>
            </div>
            <div className="p-6 bg-gray-50 border-t border-gray-100 no-print">
              <button
                onClick={() => window.print()}
                className="w-full bg-[#1A1240] hover:bg-[#2A1D5A] text-white font-bold py-3.5 rounded-xl transition-colors font-nunito flex items-center justify-center gap-2"
              >
                <Download size={18} />
                Imprimer / Sauvegarder PDF
              </button>
            </div>
          </div>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .printable-receipt, .printable-receipt * { visibility: visible; }
              .printable-receipt { position: absolute; left: 0; top: 0; width: 100%; border-radius: 0; box-shadow: none; }
              .no-print { display: none !important; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
