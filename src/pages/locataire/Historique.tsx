import { useState, useEffect } from 'react';
import { Download, X, FileText, Share2, CheckCircle, CheckCircle2 } from 'lucide-react';
import { Share } from '@capacitor/share';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Payment } from '../../lib/supabase';

type PaymentWithProperty = Payment & { propertyName?: string };
import { useToast } from '../../components/Toast';
import { formatMontant, formatDate, getMonthName, operatorColor, operatorLabel } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { BackButton } from '../../components/BackButton';
import { haptics } from '../../lib/haptics';

type FilterStatus = 'all' | 'valide' | 'echoue';

export default function Historique() {
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

    // Polling / Realtime Webhook Listeners : Écouteur sur les notifications pour le feedback instantané
    const channel = supabase.channel('historique-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile?.id}` }, (payload) => {
        const notif = payload.new;
        if (notif.type === 'retard') {
          showToast(notif.body, 'error');
          fetchPayments(); // Refresh list after status update
        } else if (notif.type === 'confirmation') {
          showToast(notif.body, 'success');
          fetchPayments();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
          <div className="w-8 h-8 border-2 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin"></div>
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
        <h1 className="font-nunito font-800 text-lg text-[var(--imx-text-primary)]">Historique</h1>
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
                    ? 'bg-[var(--imx-accent-light)] text-white'
                    : 'bg-[var(--imx-surface)] text-[var(--imx-text-secondary)] border border-[var(--imx-border)]'
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
                      ? 'bg-[var(--imx-accent-light)] text-white'
                      : 'bg-[var(--imx-surface)] text-[var(--imx-text-secondary)] border border-[var(--imx-border)]'
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
          <div className="card p-4 mb-6 bg-[var(--imx-surface)]">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[var(--imx-text-secondary)] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-1">
                  Total {getMonthName(new Date().getMonth() + 1, new Date().getFullYear())}
                </p>
                <p className="font-nunito font-900 text-2xl amount text-[var(--imx-text-primary)]">
                  {currentMonthTotal.toLocaleString('fr-FR')} <span className="text-xs font-normal text-[var(--imx-text-secondary)]">FCFA</span>
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
                <p className="text-[var(--imx-text-secondary)] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-3">
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
                                <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-[var(--imx-text-secondary)] text-[10px]" style={{ fontFamily: 'Space Grotesk' }}>
                              {payment.propertyName ? `${payment.propertyName} · ` : ''}Ref: {payment.fedapay_transaction_id?.substring(0, 8) || 'N/A'}
                            </p>
                          </div>
                        </div>

                        {/* Amount, Date & Download */}
                        <div className="flex flex-col items-end gap-1.5">
                          <p className={`font-bold text-sm ${isSuccess ? 'text-[#EF4444]' : 'text-[var(--imx-text-secondary)]'}`}>
                            -{formatMontant(payment.amount)}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-[var(--imx-text-secondary)] text-[10px]" style={{ fontFamily: 'Space Grotesk' }}>
                              {formatDate(payment.created_at)}
                            </p>
                            {isSuccess && (
                              <button
                                onClick={() => setSelectedReceipt(payment)}
                                className="p-1 rounded-full bg-[var(--imx-surface)] border border-[var(--imx-border)] text-[var(--imx-accent-light)] hover:bg-[var(--imx-accent-light)] hover:text-white transition-colors"
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
            icon={
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}>
                <FileText size={28} color="var(--imx-accent-glow)" />
              </div>
            }
            title="Aucun versement"
            description="Vous n'avez pas encore effectué de versement"
          />
        )}
      </div>

      <BottomNav />

      {/* ── Modale Reçu de Paiement (PDF Print) ── */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSelectedReceipt(null)}>
          <div
            className="w-full max-w-sm rounded-t-[28px] overflow-hidden flex flex-col printable-receipt"
            style={{ background: '#FFFFFF', maxHeight: '92vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* ── HEADER HERO ── */}
            <div className="relative px-6 pt-6 pb-5 text-center"
              style={{ background: 'linear-gradient(145deg, #7B3FE4 0%, #3D1884 100%)' }}>
              {/* Pill handle */}
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/20" />

              {/* Fermer */}
              <button
                onClick={() => setSelectedReceipt(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center no-print"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <X size={16} className="text-white" />
              </button>

              {/* Logo ImoFlex Print-Only / Modal Header */}
              <div className="mb-4 text-white">
                <span className="font-nunito font-900 text-[22px] tracking-tight">Imo</span>
                <span className="font-nunito font-900 text-[22px] tracking-tight text-[#D8B4FE]">Flex</span>
              </div>

              {/* Icone succès */}
              <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.15)' }}>
                <CheckCircle size={26} className="text-white" strokeWidth={2} />
              </div>

              {/* Montant */}
              <div className="flex items-baseline justify-center mb-1">
                <span className="font-nunito font-black text-[36px] leading-none text-white">
                  {formatMontant(selectedReceipt.amount)}
                </span>
              </div>

              {/* Badge Payé */}
              <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full"
                style={{ background: 'rgba(16, 185, 129, 0.25)' }}>
                <div className="w-2 h-2 rounded-full bg-[#4ADE80]" />
                <span className="font-space-grotesk font-bold text-[11px] text-[#6EE7B7] uppercase tracking-wider">Payé</span>
              </div>
            </div>

            {/* ── DÉTAILS ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4">

              {/* Titre + sous-titre */}
              <div className="text-center mb-4">
                <h2 className="font-nunito font-black text-[17px] text-[#17132B]">Reçu Officiel</h2>
                <p className="font-space-grotesk text-[12px] text-gray-400">ImoFlex Paiements sécurisés</p>
              </div>

              {/* Lignes de détail */}
              <div className="space-y-1">
                {[
                  {
                    label: 'Date',
                    value: new Date(selectedReceipt.created_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }),
                    mono: false,
                  },
                  {
                    label: 'Logement',
                    value: selectedReceipt.propertyName || 'N/A',
                    mono: false,
                    truncate: true,
                  },
                  {
                    label: 'Référence',
                    value: selectedReceipt.fedapay_transaction_id || '—',
                    mono: true,
                  },
                  {
                    label: 'Opérateur',
                    value: (() => {
                      const op = selectedReceipt.operator?.toLowerCase() || '';
                      if (op === 'mtn') return 'MTN Mobile Money';
                      if (op === 'moov') return 'Moov Africa';
                      if (op === 'celtiis') return 'Celtiis Pay';
                      return selectedReceipt.operator || '—';
                    })(),
                    mono: false,
                  },
                  { label: 'Frais', value: '0 FCFA (Gratuit)', mono: false, green: true },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50">
                    <span className="font-space-grotesk text-[12px] text-gray-400 font-semibold flex-shrink-0 w-24">{row.label}</span>
                    <span
                      className={`text-right flex-1 min-w-0 ${row.truncate ? 'truncate' : ''} ${row.mono ? 'font-mono text-[11px]' : 'font-space-grotesk font-semibold text-[13px]'}`}
                      style={{ color: row.green ? '#10B981' : '#17132B' }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}

                {/* Statut */}
                <div className="flex items-center justify-between py-3">
                  <span className="font-space-grotesk text-[12px] text-gray-400 font-semibold">Statut</span>
                  <span className="font-space-grotesk font-bold text-[11px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600">PAYÉ</span>
                </div>
              </div>
            </div>

            {/* ── ACTIONS ── */}
            <div className="px-5 pb-6 pt-3 space-y-2.5 no-print border-t border-gray-100">
              <button
                onClick={async () => {
                  haptics.light();
                  const txt = `✅ Reçu de paiement ImoFlex\nMontant : ${formatMontant(selectedReceipt.amount)}\nLogement : ${selectedReceipt.propertyName || 'N/A'}\nDate : ${new Date(selectedReceipt.created_at).toLocaleString('fr-FR')}\nRéférence : ${selectedReceipt.fedapay_transaction_id}\n\nEffectué via ImoFlex.`;
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: 'Reçu ImoFlex', text: txt });
                    } else {
                      await Share.share({ title: 'Reçu ImoFlex', text: txt });
                    }
                  } catch {
                    await navigator.clipboard.writeText(txt);
                    showToast('Détails du reçu copiés !', 'success');
                  }
                }}
                className="w-full font-nunito font-black text-[15px] rounded-2xl py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                style={{ background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)', color: 'white', boxShadow: '0 8px 24px rgba(123,63,228,0.3)' }}
              >
                <Share2 size={18} />
                Partager le reçu
              </button>

              <button
                onClick={() => window.print()}
                className="w-full border font-nunito font-bold text-[15px] rounded-2xl py-3.5 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-[#7B3FE4]"
                style={{ borderColor: 'rgba(123,63,228,0.2)', background: '#F5F3FF' }}
              >
                <Download size={18} />
                Imprimer / Sauvegarder PDF
              </button>
            </div>
          </div>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              .printable-receipt, .printable-receipt * { 
                visibility: visible; 
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important; 
              }
              .printable-receipt { position: absolute; left: 0; top: 0; width: 100%; border-radius: 0; box-shadow: none; }
              .no-print { display: none !important; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}



