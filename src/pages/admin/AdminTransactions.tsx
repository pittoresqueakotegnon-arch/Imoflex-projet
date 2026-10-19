import React, { useState, useEffect } from 'react';
import { supabase, Payment } from '../../lib/supabase';
import { formatMontant, formatDate } from '../../lib/utils';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import {
  CreditCard,
  ArrowUpRight,
  RotateCcw,
  CheckCircle2,
  Smartphone,
  ShieldAlert,
  FileText,
  X,
} from 'lucide-react';

interface TransactionWithDetails extends Payment {
  tenantName?: string;
  propertyName?: string;
}

interface WithdrawalWithDetails {
  id: string;
  amount: number;
  status: 'en_attente' | 'en_traitement' | 'complete' | 'echoue';
  operator: string;
  destination_phone: string;
  fedapay_payout_id?: string;
  created_at: string;
  completed_at?: string;
  ownerName?: string;
  ownerEmail?: string;
}

type MainTab = 'payments' | 'withdrawals';
type PaymentFilterStatus = 'all' | 'valide' | 'en_attente' | 'echoue';
type WithdrawalFilterStatus = 'all' | 'en_attente' | 'en_traitement' | 'complete' | 'echoue';

const AdminTransactions: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<MainTab>('payments');

  // Paiements state
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilterStatus>('all');
  const [loadingPayments, setLoadingPayments] = useState(true);

  // Retraits state
  const [withdrawals, setWithdrawals] = useState<WithdrawalWithDetails[]>([]);
  const [withdrawalFilter, setWithdrawalFilter] = useState<WithdrawalFilterStatus>('all');
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);

  // Modal Résolution Retrait
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalWithDetails | null>(null);
  const [resolutionAction, setResolutionAction] = useState<'refund' | 'complete'>('refund');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (activeTab === 'payments') {
      fetchTransactions();
    } else {
      fetchWithdrawals();
    }
  }, [activeTab, paymentFilter, withdrawalFilter]);

  const fetchTransactions = async () => {
    setLoadingPayments(true);
    try {
      let query = supabase
        .from('payments')
        .select(`
          id, amount, status, operator, payment_method, created_at, fedapay_transaction_id,
          rent_periods (
            leases (
              tenant:users!tenant_id (full_name),
              property:properties (name)
            )
          )
        `)
        .eq('is_test_data', false)
        .order('created_at', { ascending: false });

      if (paymentFilter !== 'all') {
        query = query.eq('status', paymentFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const enriched: TransactionWithDetails[] = (data || []).map((payment: any) => ({
        ...payment,
        tenantName: payment.rent_periods?.leases?.tenant?.full_name,
        propertyName: payment.rent_periods?.leases?.property?.name,
      }));

      setTransactions(enriched);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      showToast('Erreur lors du chargement des paiements', 'error');
    } finally {
      setLoadingPayments(false);
    }
  };

  const fetchWithdrawals = async () => {
    setLoadingWithdrawals(true);
    try {
      let query = supabase
        .from('withdrawals')
        .select(`
          id, amount, status, operator, destination_phone, fedapay_payout_id, created_at, completed_at,
          wallets (
            users:owner_id (full_name, email)
          )
        `)
        .order('created_at', { ascending: false });

      if (withdrawalFilter !== 'all') {
        query = query.eq('status', withdrawalFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const enriched: WithdrawalWithDetails[] = (data || []).map((w: any) => ({
        id: w.id,
        amount: w.amount,
        status: w.status,
        operator: w.operator,
        destination_phone: w.destination_phone,
        fedapay_payout_id: w.fedapay_payout_id,
        created_at: w.created_at,
        completed_at: w.completed_at,
        ownerName: w.wallets?.users?.full_name || 'Propriétaire inconnu',
        ownerEmail: w.wallets?.users?.email || '',
      }));

      setWithdrawals(enriched);
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
      showToast('Erreur lors du chargement des retraits', 'error');
    } finally {
      setLoadingWithdrawals(false);
    }
  };

  const handleApplyResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWithdrawal) return;

    const trimmedNote = resolutionNote.trim();
    if (trimmedNote.length < 10) {
      showToast('La note explicative doit comporter au moins 10 caractères.', 'error');
      return;
    }

    setResolving(true);
    try {
      const { data, error } = await supabase.rpc('admin_resolve_withdrawal', {
        p_withdrawal_id: selectedWithdrawal.id,
        p_action: resolutionAction,
        p_note: trimmedNote,
      });

      if (error) throw error;

      if (data === true) {
        showToast(
          resolutionAction === 'refund'
            ? 'Retrait annulé et portefeuille recrédité avec succès'
            : 'Retrait confirmé et marqué comme terminé',
          'success'
        );
        setSelectedWithdrawal(null);
        setResolutionNote('');
        fetchWithdrawals();
      } else {
        showToast("Impossible d'appliquer la résolution (statut non modifiable).", 'error');
      }
    } catch (err: unknown) {
      console.error('Erreur résolution retrait:', err);
      showToast(err instanceof Error ? err.message : 'Erreur lors de la résolution', 'error');
    } finally {
      setResolving(false);
    }
  };

  const paymentFilters: Array<{ value: PaymentFilterStatus; label: string }> = [
    { value: 'all', label: 'Tous' },
    { value: 'valide', label: 'Validés' },
    { value: 'en_attente', label: 'En attente' },
    { value: 'echoue', label: 'Échoués' },
  ];

  const withdrawalFilters: Array<{ value: WithdrawalFilterStatus; label: string }> = [
    { value: 'all', label: 'Tous' },
    { value: 'en_attente', label: 'En attente' },
    { value: 'en_traitement', label: 'En traitement' },
    { value: 'complete', label: 'Terminés' },
    { value: 'echoue', label: 'Échoués' },
  ];

  const isLoading = activeTab === 'payments' ? loadingPayments : loadingWithdrawals;

  return (
    <div className="w-full pb-16">
      <div className="px-4 pt-6 pb-4">
        {/* Titre & Sélecteur d'onglets principaux */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-nunito font-900" style={{ color: 'var(--adm-text)' }}>
              Transactions &amp; Flux Financiers
            </h1>
            <p className="text-xs text-[var(--adm-text-dim)] mt-0.5">
              Supervision des paiements de loyers et des retraits Mobile Money
            </p>
          </div>

          <div
            className="inline-flex rounded-xl p-1 border self-start sm:self-auto"
            style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
          >
            <button
              onClick={() => setActiveTab('payments')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'payments'
                  ? 'bg-[var(--adm-accent)] text-white shadow-sm'
                  : 'text-[var(--adm-text-dim)] hover:text-[var(--adm-text)]'
              }`}
            >
              <CreditCard size={15} />
              Paiements locataires
            </button>
            <button
              onClick={() => setActiveTab('withdrawals')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'withdrawals'
                  ? 'bg-[var(--adm-accent)] text-white shadow-sm'
                  : 'text-[var(--adm-text-dim)] hover:text-[var(--adm-text)]'
              }`}
            >
              <ArrowUpRight size={15} />
              Retraits propriétaires
            </button>
          </div>
        </div>

        {/* Filtres de la vue active */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {activeTab === 'payments'
            ? paymentFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setPaymentFilter(f.value)}
                  className="whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition border"
                  style={{
                    background: paymentFilter === f.value ? 'var(--adm-accent)' : 'var(--adm-surface)',
                    color: paymentFilter === f.value ? '#ffffff' : 'var(--adm-text-dim)',
                    borderColor: paymentFilter === f.value ? 'transparent' : 'var(--adm-border)',
                  }}
                >
                  {f.label}
                </button>
              ))
            : withdrawalFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setWithdrawalFilter(f.value)}
                  className="whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition border"
                  style={{
                    background: withdrawalFilter === f.value ? 'var(--adm-accent)' : 'var(--adm-surface)',
                    color: withdrawalFilter === f.value ? '#ffffff' : 'var(--adm-text-dim)',
                    borderColor: withdrawalFilter === f.value ? 'transparent' : 'var(--adm-border)',
                  }}
                >
                  {f.label}
                </button>
              ))}
        </div>

        {/* Chargement Skeleton */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl border h-24 animate-pulse"
                style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
              />
            ))}
          </div>
        ) : activeTab === 'payments' ? (
          /* Liste des paiements locataires */
          transactions.length === 0 ? (
            <EmptyState
              title="Aucun paiement"
              description="Aucun paiement ne correspond à ce filtre"
            />
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="rounded-xl border p-4 transition hover:border-[var(--adm-accent)]/50"
                  style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="amount text-lg font-bold" style={{ color: 'var(--adm-text)' }}>
                        {formatMontant(transaction.amount)}
                      </p>
                      <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--adm-text-dim)' }}>
                        {transaction.tenantName || 'Locataire'} • {transaction.propertyName || 'Bien'}
                      </p>
                    </div>
                    <StatusBadge status={transaction.status} />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--adm-border)]" style={{ color: 'var(--adm-text-muted)' }}>
                    <span className="font-mono">{transaction.fedapay_transaction_id ? `FedaPay #${transaction.fedapay_transaction_id.slice(0, 10)}` : 'Réf. interne'}</span>
                    <span className="uppercase font-semibold tracking-wider">{transaction.operator || transaction.payment_method}</span>
                    <span>{formatDate(transaction.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Liste des retraits propriétaires */
          withdrawals.length === 0 ? (
            <EmptyState
              title="Aucun retrait"
              description="Aucun retrait ne correspond à ce filtre"
            />
          ) : (
            <div className="space-y-3">
              {withdrawals.map((withdrawal) => {
                const canResolve = withdrawal.status === 'en_attente' || withdrawal.status === 'en_traitement';
                return (
                  <div
                    key={withdrawal.id}
                    className="rounded-xl border p-4 transition hover:border-[var(--adm-accent)]/50"
                    style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="amount text-lg font-bold" style={{ color: 'var(--adm-text)' }}>
                            {formatMontant(withdrawal.amount)}
                          </p>
                          <StatusBadge status={withdrawal.status} />
                        </div>
                        <p className="text-xs mt-1 font-semibold" style={{ color: 'var(--adm-text)' }}>
                          {withdrawal.ownerName}
                          {withdrawal.ownerEmail && (
                            <span className="font-normal text-[var(--adm-text-dim)]"> ({withdrawal.ownerEmail})</span>
                          )}
                        </p>
                      </div>

                      {canResolve && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWithdrawal(withdrawal);
                            setResolutionAction('refund');
                            setResolutionNote('');
                          }}
                          className="self-start sm:self-auto px-3 py-1.5 rounded-lg text-xs font-bold border transition flex items-center gap-1.5"
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            color: '#EF4444',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          <ShieldAlert size={14} />
                          Résoudre ce retrait
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2.5 border-t border-[var(--adm-border)]" style={{ color: 'var(--adm-text-muted)' }}>
                      <div className="flex items-center gap-2">
                        <Smartphone size={13} className="text-[var(--adm-accent)]" />
                        <span className="font-semibold uppercase tracking-wider">{withdrawal.operator}</span>
                        <span>{withdrawal.destination_phone}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-[11px]">
                          {withdrawal.fedapay_payout_id ? `Payout #${withdrawal.fedapay_payout_id}` : 'Non envoyé FedaPay'}
                        </span>
                        <span>{formatDate(withdrawal.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* MODAL DE RÉSOLUTION D'UN RETRAIT (admin_resolve_withdrawal) */}
      {selectedWithdrawal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div
            className="rounded-2xl border p-6 w-full max-w-lg relative shadow-2xl"
            style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
          >
            <button
              onClick={() => setSelectedWithdrawal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--adm-text-muted)] hover:text-[var(--adm-text)]"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
              >
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="font-nunito font-900 text-lg" style={{ color: 'var(--adm-text)' }}>
                  Résolution manuelle de retrait
                </h3>
                <p className="text-xs text-[var(--adm-text-dim)]">
                  Action réservée aux administrateurs (tracée dans les journaux d'audit)
                </p>
              </div>
            </div>

            {/* Récapitulatif du retrait */}
            <div
              className="rounded-xl p-3.5 mb-5 border text-xs space-y-1.5"
              style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}
            >
              <div className="flex justify-between">
                <span className="text-[var(--adm-text-dim)]">Propriétaire :</span>
                <span className="font-bold text-[var(--adm-text)]">{selectedWithdrawal.ownerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--adm-text-dim)]">Montant :</span>
                <span className="font-bold text-[var(--adm-text)]">{formatMontant(selectedWithdrawal.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--adm-text-dim)]">Destination :</span>
                <span className="font-mono text-[var(--adm-text)]">{selectedWithdrawal.operator.toUpperCase()} • {selectedWithdrawal.destination_phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--adm-text-dim)]">Statut actuel :</span>
                <StatusBadge status={selectedWithdrawal.status} />
              </div>
            </div>

            <form onSubmit={handleApplyResolution} className="space-y-4">
              {/* Choix de l'action */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[var(--adm-text-muted)] mb-2">
                  Action à appliquer
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResolutionAction('refund')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                      resolutionAction === 'refund'
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-[var(--adm-border)] bg-[var(--adm-surface-alt)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-red-500">
                      <RotateCcw size={14} />
                      Rembourser (refund)
                    </div>
                    <span className="text-[11px] text-[var(--adm-text-dim)] leading-tight">
                      Annule le retrait et recrédite immédiatement le portefeuille.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setResolutionAction('complete')}
                    className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                      resolutionAction === 'complete'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-[var(--adm-border)] bg-[var(--adm-surface-alt)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-500">
                      <CheckCircle2 size={14} />
                      Confirmer (complete)
                    </div>
                    <span className="text-[11px] text-[var(--adm-text-dim)] leading-tight">
                      Marque le retrait comme transféré après vérification chez FedaPay.
                    </span>
                  </button>
                </div>
              </div>

              {/* Note obligatoire */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="resolution-note" className="text-xs font-bold uppercase tracking-wider text-[var(--adm-text-muted)]">
                    Justification / Note d'audit (min. 10 car.)
                  </label>
                  <span className={`text-[10px] font-mono ${resolutionNote.trim().length >= 10 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {resolutionNote.trim().length}/10 min
                  </span>
                </div>
                <textarea
                  id="resolution-note"
                  rows={3}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Ex : Constaté payout échoué sur FedaPay, remboursement autorisé au client."
                  className="w-full rounded-xl border p-3 text-xs outline-none focus:border-[var(--adm-accent)]"
                  style={{
                    background: 'var(--adm-surface-alt)',
                    color: 'var(--adm-text)',
                    borderColor: 'var(--adm-border)',
                  }}
                  required
                />
              </div>

              {/* Boutons d'action */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedWithdrawal(null)}
                  disabled={resolving}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold border transition"
                  style={{
                    background: 'var(--adm-surface-alt)',
                    color: 'var(--adm-text-muted)',
                    borderColor: 'var(--adm-border)',
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={resolving || resolutionNote.trim().length < 10}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                  style={{
                    background: resolutionAction === 'refund' ? '#EF4444' : '#10B981',
                    color: '#ffffff',
                    opacity: resolving || resolutionNote.trim().length < 10 ? 0.5 : 1,
                  }}
                >
                  {resolving ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <FileText size={14} />
                      Appliquer la résolution
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTransactions;
