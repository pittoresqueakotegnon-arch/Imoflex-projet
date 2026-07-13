import React, { useState, useEffect } from 'react';
import { supabase, Payment } from '../../lib/supabase';
import { formatMontant, formatDate } from '../../lib/utils';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';

interface TransactionWithDetails extends Payment {
  tenantName?: string;
  propertyName?: string;
}

type FilterStatus = 'all' | 'valide' | 'en_attente' | 'echoue';

const AdminTransactions: React.FC = () => {
  const { showToast } = useToast();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');

  useEffect(() => {
    fetchTransactions();
  }, [filter]);

  const fetchTransactions = async () => {
    try {
      let query = supabase
        .from('payments')
        .select(`
          id, amount, status, operator, payment_method, created_at,
          rent_periods (
            leases (
              tenant:users!tenant_id (full_name),
              property:properties (name)
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Map the nested join data to flat enriched objects
      const enriched: TransactionWithDetails[] = (data || []).map((payment: any) => ({
        ...payment,
        tenantName: payment.rent_periods?.leases?.tenant?.full_name,
        propertyName: payment.rent_periods?.leases?.property?.name,
      }));

      setTransactions(enriched);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      showToast('Erreur lors du chargement des transactions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filters: Array<{ value: FilterStatus; label: string }> = [
    { value: 'all', label: 'Tous' },
    { value: 'valide', label: 'Validés' },
    { value: 'en_attente', label: 'En attente' },
    { value: 'echoue', label: 'Échoués' },
  ];

  if (loading) {
    return (
      <div className="w-full">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border h-20 animate-pulse" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-nunito font-900 mb-6" style={{ color: 'var(--adm-text)' }}>Transactions</h1>

        {/* Filter Pills */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {filters.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className="whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition border"
              style={{
                background: filter === f.value ? 'var(--adm-accent)' : 'var(--adm-surface)',
                color: filter === f.value ? '#ffffff' : 'var(--adm-text-dim)',
                borderColor: filter === f.value ? 'transparent' : 'var(--adm-border)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Transactions List */}
        {transactions.length === 0 ? (
          <EmptyState
            title="Aucune transaction"
            description="Aucune transaction ne correspond à ce filtre"
          />
        ) : (
          <div className="space-y-2">
            {transactions.map(transaction => (
              <div key={transaction.id} className="rounded-xl border p-4" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="amount text-lg" style={{ color: 'var(--adm-text)' }}>{formatMontant(transaction.amount)}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--adm-text-dim)' }}>
                      {transaction.tenantName} • {transaction.propertyName}
                    </p>
                  </div>
                  <StatusBadge status={transaction.status} />
                </div>

                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--adm-text-muted)' }}>
                  <span>{transaction.fedapay_transaction_id?.slice(0, 8)}...</span>
                  <span>{transaction.operator}</span>
                  <span>{formatDate(transaction.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTransactions;
