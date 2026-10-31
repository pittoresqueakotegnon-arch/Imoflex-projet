import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Clock, CheckCircle2, RefreshCw, X, ShieldCheck, Sparkles, Coins, Smartphone, ExternalLink, Loader2, FileText, Download } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase, Payment, RentPeriod, Operator } from '../../../lib/supabase';
import { formatMontant, formatDate, daysUntilDeadline } from '../../../lib/utils';
import { initiatePayment, normalizeBjPhone, checkPaymentStatus } from '../../../lib/fedapay';
import { generateQuittancePDF } from '../../../lib/pdf';
import { useToast } from '../../../components/Toast';

interface LeasePaymentInfo {
  leaseId: string;
  propertyName: string;
  propertyAddress: string;
  monthlyRent: number;
  currentPeriod: RentPeriod | null;
}

export default function WebLocatairePaiements() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [leases, setLeases] = useState<LeasePaymentInfo[]>([]);
  const [payments, setPayments] = useState<(Payment & { propertyName?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pay Modal State
  const [selectedLease, setSelectedLease] = useState<LeasePaymentInfo | null>(null);
  const [payAmount, setPayAmount] = useState<number>(100);
  const [phone, setPhone] = useState(profile?.mobile_money_number || profile?.phone || '');
  const [operator, setOperator] = useState<Operator>('mtn');
  const [submitting, setSubmitting] = useState(false);
  const [modalStep, setModalStep] = useState<'form' | 'waiting' | 'success'>('form');
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const fetchData = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    try {
      const { data: leasesData, error: leasesError } = await supabase
        .from('leases')
        .select('id, tenant_id, status, properties:property_id(id, name, address, monthly_rent)')
        .eq('tenant_id', profile.id)
        .eq('status', 'actif');

      if (leasesError) throw leasesError;

      if (leasesData && leasesData.length > 0) {
        const leaseIds = leasesData.map((l: any) => l.id);
        const now = new Date();

        const { data: periodsData } = await supabase
          .from('rent_periods')
          .select('*')
          .in('lease_id', leaseIds)
          .eq('period_month', now.getMonth() + 1)
          .eq('period_year', now.getFullYear());

        const periodMap = new Map((periodsData || []).map((p: any) => [p.lease_id, p]));

        const mapped: LeasePaymentInfo[] = leasesData.map((l: any) => ({
          leaseId: l.id,
          propertyName: l.properties?.name || 'Logement',
          propertyAddress: l.properties?.address || '',
          monthlyRent: l.properties?.monthly_rent || 0,
          currentPeriod: periodMap.get(l.id) || null,
        }));
        setLeases(mapped);

        // Fetch payment history
        const { data: paymentsData } = await supabase
          .from('payments')
          .select(`
            id, amount, status, created_at, operator, fedapay_transaction_id, rent_period_id,
            rent_periods:rent_period_id(
              id, period_month, period_year, amount_due, amount_paid,
              leases:lease_id(
                id,
                properties:property_id(
                  name, address, monthly_rent,
                  owner:users!properties_owner_id_fkey(full_name, phone)
                )
              )
            )
          `)
          .eq('tenant_id', profile.id)
          .order('created_at', { ascending: false });

        setPayments(
          (paymentsData || []).map((p: any) => ({
            ...p,
            propertyName: p.rent_periods?.leases?.properties?.name,
          }))
        );
      }
    } catch (err) {
      console.error('[WebLocatairePaiements] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Écoute Realtime sur le paiement actif
  useEffect(() => {
    if (!activePaymentId) return;

    const channel = supabase
      .channel(`web-payment-status-${activePaymentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${activePaymentId}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === 'valide') {
            setModalStep('success');
            fetchData();
          } else if (['echoue', 'canceled', 'declined'].includes(updated.status)) {
            setError('Le paiement a été annulé ou refusé par l\'opérateur.');
            setModalStep('form');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activePaymentId, fetchData]);

  const handleDownloadQuittance = async (p: any) => {
    try {
      const rp = p.rent_periods;
      const lease = rp?.leases;
      const prop = lease?.properties;
      const owner = prop?.owner;

      const months = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
      ];
      const periodLabel = rp?.period_month && rp?.period_year
        ? `${months[rp.period_month - 1]} ${rp.period_year}`
        : new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(p.created_at));

      await generateQuittancePDF({
        id: p.id,
        fedapay_transaction_id: p.fedapay_transaction_id,
        amount: p.amount,
        date: new Date(p.created_at),
        periodLabel: periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1),
        propertyName: prop?.name || p.propertyName || 'Logement ImoFlex',
        propertyLocation: prop?.address || null,
        tenantName: profile?.full_name || 'Locataire ImoFlex',
        tenantPhone: profile?.phone || null,
        ownerName: owner?.full_name || 'Bailleur / Gestionnaire ImoFlex',
        ownerPhone: owner?.phone || null,
        operator: p.operator || 'mtn',
        rentAmount: prop?.monthly_rent || rp?.amount_due || p.amount,
        remainingDue: rp ? Math.max(0, rp.amount_due - rp.amount_paid) : 0,
      });

      showToast('Quittance officielle téléchargée avec succès !', 'success');
    } catch (err) {
      console.error('Erreur génération quittance:', err);
      showToast('Impossible de générer la quittance PDF.', 'error');
    }
  };

  const MAX_TRANSACTION_AMOUNT = 300000;

  // Open modal for a lease
  const openPayModal = (l: LeasePaymentInfo) => {
    setSelectedLease(l);
    const rem = l.currentPeriod ? Math.max(0, l.currentPeriod.amount_due - l.currentPeriod.amount_paid) : l.monthlyRent;
    const initialDue = rem > 0 ? rem : l.monthlyRent;
    // Proposer par défaut un acompte accessible (5 000 F ou le solde direct s'il est bas)
    const defaultAmount = initialDue <= 25000 ? initialDue : 5000;
    setPayAmount(defaultAmount);
    setModalStep('form');
    setActivePaymentId(null);
    setPaymentUrl(null);
    setError(null);
    idempotencyKeyRef.current = crypto.randomUUID();
  };

  const handleCheckStatus = async () => {
    if (!activePaymentId || checkingStatus) return;
    setCheckingStatus(true);
    try {
      const statusRes = await checkPaymentStatus(activePaymentId);
      if (statusRes.status === 'valide') {
        setModalStep('success');
        showToast('Paiement validé avec succès !', 'success');
        fetchData();
      } else if (statusRes.status === 'echoue') {
        setError('Le paiement a été rejeté ou annulé.');
        setModalStep('form');
      } else {
        showToast('En attente de validation sur votre téléphone...', 'info');
      }
    } catch {
      showToast('Vérification en cours, réessayez dans un instant.', 'info');
    } finally {
      setCheckingStatus(false);
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLease || !selectedLease.currentPeriod) return;

    if (payAmount < 100) {
      setError('Le montant minimum par transaction est de 100 FCFA.');
      return;
    }

    if (payAmount > MAX_TRANSACTION_AMOUNT) {
      setError(`Le plafond maximal par transaction Mobile Money est de ${formatMontant(MAX_TRANSACTION_AMOUNT)}. Pour régler ce loyer, effectuez des versements successifs.`);
      return;
    }

    const currentRem = Math.max(0, selectedLease.currentPeriod.amount_due - selectedLease.currentPeriod.amount_paid);
    if (currentRem > 0 && payAmount > currentRem) {
      setError(`Le montant saisi (${formatMontant(payAmount)}) dépasse le reliquat restant dû (${formatMontant(currentRem)}).`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const normalizedPhone = normalizeBjPhone(phone);
      if (normalizedPhone.length !== 10) {
        throw new Error('Veuillez saisir un numéro béninois valide à 10 chiffres (ex: 01 97 00 00 00).');
      }

      const res = await initiatePayment({
        rent_period_id: selectedLease.currentPeriod.id,
        amount: Math.round(payAmount),
        operator,
        phone_number: normalizedPhone,
        idempotency_key: idempotencyKeyRef.current,
      });

      if (!res || !res.payment_id) {
        throw new Error('Erreur lors de l\'initialisation du paiement FedaPay.');
      }

      setActivePaymentId(res.payment_id);
      setPaymentUrl(res.payment_url || null);
      setModalStep('waiting');

      // Tenter d'ouvrir l'URL si présente (ex: portail Celtiis)
      if (res.payment_url) {
        try {
          window.open(res.payment_url, '_blank');
        } catch (_err) {
          // Popup bloquée par le navigateur
        }
      }

      // Vérification automatique en tâche de fond après 6 secondes
      setTimeout(async () => {
        try {
          const check = await checkPaymentStatus(res.payment_id);
          if (check.status === 'valide') {
            setModalStep('success');
            fetchData();
          }
        } catch (_err) {
          // Statut non disponible immédiatement
        }
      }, 6000);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de la communication avec le service de paiement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
            Mes Paiements & Loyers
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--imx-text-muted)' }}>
            Suivez vos loyers du mois, effectuez vos règlements Mobile Money et retrouvez vos reçus.
          </p>
        </div>

        <button
          onClick={() => { setRefreshing(true); fetchData(); }}
          disabled={refreshing}
          className="p-2.5 rounded-xl border bg-white hover:bg-gray-50 transition-colors"
          style={{ borderColor: 'var(--imx-border)', color: 'var(--imx-text-secondary)' }}
        >
          <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : leases.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
          <CreditCard size={40} className="mx-auto mb-3 opacity-30 text-gray-400" />
          <h3 className="text-base font-bold text-gray-800 mb-1">Aucun bail actif pour le moment</h3>
          <p className="text-xs text-gray-500 mb-6">Vous n'avez pas encore de loyer associé à votre compte.</p>
          <Link
            to="/web/annonces"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'var(--imx-accent)' }}
          >
            Rechercher un logement
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Bannière discrète d'information */}
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-purple-50/80 border border-purple-100 text-xs text-purple-900">
            <Sparkles size={16} className="text-[#7B3FE4] flex-shrink-0" />
            <p>
              <strong>Paiement libre ImoFlex :</strong> Vous pouvez solder vos loyers en une fois ou par plusieurs versements (à partir de 100 FCFA), selon votre rythme.
            </p>
          </div>

          {/* Active Rents */}
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-400 mb-3">
              Mes Échéances de loyer
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leases.map((l) => {
                const period = l.currentPeriod;
                const due = period?.amount_due || l.monthlyRent;
                const paid = period?.amount_paid || 0;
                const remaining = Math.max(0, due - paid);
                const isSettled = remaining === 0 && paid > 0;
                const daysLeft = period?.deadline_date ? daysUntilDeadline(period.deadline_date) : null;
                const isLate = daysLeft !== null && daysLeft < 0 && !isSettled;
                const paidPct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;

                return (
                  <div
                    key={l.leaseId}
                    className="p-5 rounded-2xl border bg-white shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between"
                    style={{ borderColor: 'var(--imx-border)' }}
                  >
                    <div>
                      {/* En-tête de carte */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-extrabold text-sm sm:text-base text-gray-900 truncate">
                            {l.propertyName}
                          </h3>
                          <p className="text-xs text-gray-400 truncate mt-0.5">{l.propertyAddress}</p>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${
                            isSettled
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isLate
                              ? 'bg-red-50 text-red-600 border border-red-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {isSettled ? 'Soldé' : isLate ? 'En retard' : 'À régler'}
                        </span>
                      </div>

                      {/* Montants épurés */}
                      <div className="my-4 pt-3.5 border-t border-gray-100 flex items-baseline justify-between">
                        <div>
                          <span className="text-[11px] font-medium text-gray-400 block mb-0.5">Reste à payer</span>
                          <span className={`text-xl font-black ${isSettled ? 'text-emerald-600' : 'text-gray-900'}`}>
                            {formatMontant(remaining)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-medium text-gray-400 block mb-0.5">Loyer mensuel</span>
                          <span className="text-xs font-bold text-gray-500">{formatMontant(due)}</span>
                        </div>
                      </div>

                      {/* Progression si déjà un versement effectué */}
                      {paid > 0 && (
                        <div className="mb-3">
                          <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1">
                            <span>Déjà versé : <strong className="text-emerald-600">{formatMontant(paid)}</strong></span>
                            <span className="font-bold">{paidPct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${paidPct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pied de carte */}
                    <div className="pt-3 border-t border-gray-50 flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-400 flex items-center gap-1.5">
                        <Clock size={12} className={isLate ? 'text-red-500' : 'text-gray-400'} />
                        {period?.deadline_date ? (
                          <span>Échéance : <strong>{formatDate(period.deadline_date)}</strong></span>
                        ) : (
                          <span>Échéance mensuelle</span>
                        )}
                      </div>

                      {!isSettled ? (
                        <button
                          onClick={() => openPayModal(l)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs transition-all hover:opacity-90 flex items-center gap-1.5 flex-shrink-0"
                          style={{ background: 'var(--imx-accent)' }}
                        >
                          <CreditCard size={13} />
                          <span>Payer le loyer</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                          <CheckCircle2 size={14} />
                          <span>Loyer soldé</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


          {/* Payment History */}
          <div>
            <h2 className="text-base font-bold mb-4" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
              Historique des transactions
            </h2>
            {payments.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400 rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
                Aucun versement enregistré pour l'instant.
              </div>
            ) : (
              <div className="rounded-2xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: 'var(--imx-border)' }}>
                <div className="divide-y" style={{ borderColor: 'var(--imx-border)' }}>
                  {payments.map((p) => (
                    <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            p.status === 'valide'
                              ? 'bg-emerald-50 text-emerald-600'
                              : p.status === 'echoue'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          <CreditCard size={17} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{p.propertyName || 'Paiement loyer'}</p>
                          <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · Opérateur : {p.operator?.toUpperCase() || 'MOBILE MONEY'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-black text-gray-900">{formatMontant(p.amount)}</p>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${p.status === 'valide' ? 'text-emerald-600' : p.status === 'echoue' ? 'text-red-500' : 'text-amber-500'}`}>
                            {p.status === 'valide' ? 'Confirmé' : p.status === 'echoue' ? 'Échoué' : 'En attente'}
                          </span>
                        </div>

                        {p.status === 'valide' && (
                          <button
                            type="button"
                            onClick={() => handleDownloadQuittance(p)}
                            title="Télécharger la quittance officielle ImoFlex"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-[var(--imx-accent)] hover:bg-[var(--imx-accent)] hover:text-white transition-all shadow-2xs border border-purple-100 flex-shrink-0"
                          >
                            <FileText size={13} />
                            <span className="hidden sm:inline">Quittance</span>
                            <Download size={12} className="opacity-70" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Modal — Design Fintech Premium */}
      {selectedLease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden relative">
            
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-sm flex-shrink-0">
                  <Coins size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 leading-tight" style={{ fontFamily: 'Sora' }}>
                    Paiement Mobile Money
                  </h3>
                  <p className="text-xs text-gray-500 truncate max-w-[260px] sm:max-w-[320px]">
                    {selectedLease.propertyName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLease(null)}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              
              {/* ÉTAPE 1 : SUCCÈS CONFIRMÉ */}
              {modalStep === 'success' && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-sm">
                    <CheckCircle2 size={34} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 mb-1.5" style={{ fontFamily: 'Sora' }}>
                    Versement validé avec succès !
                  </h3>
                  <p className="text-xs text-gray-600 max-w-sm mx-auto mb-6 leading-relaxed">
                    Votre règlement de <strong className="text-emerald-700 font-extrabold">{formatMontant(payAmount)}</strong> a été confirmé. Le solde restant de votre loyer a été mis à jour.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const validatedPayment = payments.find(p => p.id === activePaymentId);
                        if (validatedPayment) {
                          void handleDownloadQuittance(validatedPayment);
                        } else {
                          showToast('Le paiement est en cours de synchronisation. Réessayez lorsque le registre le confirme.', 'info');
                        }
                      }}
                      className="flex-1 py-3 px-4 rounded-2xl text-xs font-bold border border-purple-200 bg-purple-50 text-[var(--imx-accent)] hover:bg-purple-100 flex items-center justify-center gap-2 transition-all shadow-2xs"
                    >
                      <FileText size={15} />
                      <span>Télécharger ma quittance PDF</span>
                    </button>
                    <button
                      onClick={() => setSelectedLease(null)}
                      className="py-3 px-5 rounded-2xl text-xs font-bold text-white shadow-sm transition-all hover:opacity-90"
                      style={{ background: 'var(--imx-accent)' }}
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              )}

              {/* ÉTAPE 2 : EN ATTENTE DE VALIDATION USSD SUR LE TÉLÉPHONE */}
              {modalStep === 'waiting' && (
                <div className="text-center py-5 space-y-5">
                  <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-purple-100 animate-ping opacity-60" />
                    <div className="relative w-14 h-14 rounded-2xl bg-[#7B3FE4] text-white flex items-center justify-center shadow-lg">
                      <Smartphone size={28} className="animate-bounce" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-gray-900 mb-1" style={{ fontFamily: 'Sora' }}>
                      Validez le débit sur votre mobile
                    </h3>
                    <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
                      Une demande de débit de <strong className="text-gray-900">{formatMontant(payAmount)}</strong> a été envoyée au numéro <strong className="text-gray-900 font-mono">+229 {phone.replace(/^\+229/, '').trim()}</strong>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-100 text-xs text-purple-950 text-left space-y-1.5">
                    <p className="font-extrabold flex items-center gap-1.5 text-purple-900">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Instructions :
                    </p>
                    <p className="text-[11px] text-purple-800 leading-relaxed">
                      1. Regardez l’écran de votre téléphone portable.<br />
                      2. Saisissez votre code PIN secret Mobile Money.<br />
                      3. Dès validation, cette fenêtre s'actualisera automatiquement.
                    </p>
                  </div>

                  {paymentUrl && (
                    <a
                      href={paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[#7B3FE4] bg-purple-100 hover:bg-purple-200 transition-all"
                    >
                      <span>Ouvrir la page de confirmation FedaPay</span>
                      <ExternalLink size={13} />
                    </a>
                  )}

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleCheckStatus}
                      disabled={checkingStatus}
                      className="w-full py-3 rounded-2xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                      style={{ background: 'var(--imx-accent)' }}
                    >
                      {checkingStatus ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Vérification en cours...</span>
                        </>
                      ) : (
                        <span>J'ai validé sur mon téléphone · Vérifier le statut</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setModalStep('form')}
                      className="w-full py-2 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      ← Modifier le numéro ou le montant
                    </button>
                  </div>
                </div>
              )}

              {/* ÉTAPE 3 : FORMULAIRE DE SAISIE */}
              {modalStep === 'form' && (
                <>
                  {error && (
                    <div className="p-3 rounded-xl text-xs bg-red-50 text-red-700 border border-red-200 flex items-start gap-2">
                      <span className="font-bold flex-shrink-0">Erreur :</span>
                      <span>{error}</span>
                    </div>
                  )}

                  {(() => {
                    const remainingDue = selectedLease.currentPeriod
                      ? Math.max(0, selectedLease.currentPeriod.amount_due - selectedLease.currentPeriod.amount_paid)
                      : selectedLease.monthlyRent;
                    const cleanPhoneInput = phone.replace(/^\+229/, '').trim();

                    // 4 boutons d'acomptes pertinents et bien proportionnés
                    const presetList = [
                      { label: '100 F', sub: 'Min.', val: 100 },
                      { label: '5 000 F', sub: 'Acompte', val: 5000 },
                      { label: '25 000 F', sub: 'Acompte', val: 25000 },
                      remainingDue <= MAX_TRANSACTION_AMOUNT
                        ? { label: 'Tout solder', sub: formatMontant(remainingDue), val: remainingDue }
                        : { label: '300 000 F', sub: 'Plafond', val: MAX_TRANSACTION_AMOUNT },
                    ].filter(p => p.val <= remainingDue);

                    return (
                      <form id="pay-form" onSubmit={handlePaySubmit} className="space-y-4">
                        
                        {/* Zone Montant Hero */}
                        <div className="p-4 rounded-2xl bg-gradient-to-b from-purple-50/60 to-white border border-purple-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                              <Sparkles size={12} className="text-[#7B3FE4]" /> Montant du versement
                            </span>
                            <span className="text-[11px] font-semibold text-purple-700 bg-white px-2 py-0.5 rounded-full border border-purple-200 shadow-2xs">
                              Dès 100 FCFA
                            </span>
                          </div>

                          {/* Saisie principale du montant */}
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              min={100}
                              max={Math.min(remainingDue, MAX_TRANSACTION_AMOUNT)}
                              value={payAmount || ''}
                              onChange={(e) => setPayAmount(Number(e.target.value))}
                              placeholder="0"
                              className="w-full pl-3 pr-16 py-3 rounded-xl bg-white border text-2xl font-black text-gray-900 outline-none focus:ring-2 focus:ring-[#7B3FE4]/20 focus:border-[#7B3FE4] transition-all"
                              style={{ borderColor: payAmount > MAX_TRANSACTION_AMOUNT || (remainingDue > 0 && payAmount > remainingDue) ? '#EF4444' : '#E2E8F0' }}
                            />
                            <span className="absolute right-3.5 text-xs font-bold text-gray-400 pointer-events-none">
                              FCFA
                            </span>
                          </div>

                          {/* Raccourcis d'acomptes en grille 4 colonnes épurée */}
                          <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                            {presetList.map((preset) => {
                              const isActive = payAmount === preset.val;
                              return (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => setPayAmount(preset.val)}
                                  className={`py-2 px-1 rounded-xl text-center border transition-all ${
                                    isActive
                                      ? 'border-[#7B3FE4] bg-[#7B3FE4] text-white shadow-sm'
                                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                  }`}
                                >
                                  <div className="text-[11px] font-extrabold leading-tight truncate">
                                    {preset.label}
                                  </div>
                                  <div className={`text-[9px] leading-tight truncate ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                                    {preset.sub}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Statut du reste dû */}
                          <div className="mt-3 pt-2.5 border-t border-purple-100/70 flex items-center justify-between text-xs">
                            <span className="text-gray-500">Reste dû après ce versement :</span>
                            <span className="font-extrabold text-gray-900">
                              {formatMontant(Math.max(0, remainingDue - payAmount))}
                            </span>
                          </div>
                        </div>

                        {/* Choix de l'opérateur Mobile Money */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-2">
                            Opérateur Mobile Money
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { key: 'mtn', name: 'MTN MoMo', dot: '#EAB308', bg: '#FEF9C3' },
                              { key: 'moov', name: 'Moov Money', dot: '#3B82F6', bg: '#DBEAFE' },
                              { key: 'celtiis', name: 'Celtiis Pay', dot: '#10B981', bg: '#D1FAE5' },
                            ].map((op) => {
                              const isSelected = operator === op.key;
                              return (
                                <button
                                  key={op.key}
                                  type="button"
                                  onClick={() => setOperator(op.key as Operator)}
                                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
                                    isSelected
                                      ? 'border-[#7B3FE4] bg-purple-50 text-[#7B3FE4] shadow-xs'
                                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: op.dot }} />
                                  <span>{op.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Numéro de téléphone */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">
                            Numéro de téléphone débiteur
                          </label>
                          <div className="flex rounded-xl border border-gray-200 overflow-hidden focus-within:border-[#7B3FE4] focus-within:ring-2 focus-within:ring-[#7B3FE4]/20 transition-all bg-white">
                            <span className="px-3 py-2.5 bg-gray-50 border-r border-gray-200 text-xs font-bold text-gray-600 flex items-center gap-1 flex-shrink-0 select-none">
                              🇧🇯 +229
                            </span>
                            <input
                              type="tel"
                              value={cleanPhoneInput}
                              onChange={(e) => setPhone(e.target.value.replace(/^\+229/, '').trim())}
                              placeholder="01 97 00 00 00"
                              required
                              className="w-full px-3 py-2.5 text-sm font-mono font-semibold text-gray-900 outline-none bg-transparent"
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">
                            Saisissez les 8 ou 10 chiffres de votre compte Mobile Money.
                          </p>
                        </div>

                        {/* Note de sécurité discrète */}
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100 text-[11px] text-gray-500">
                          <ShieldCheck size={15} className="text-emerald-500 flex-shrink-0" />
                          <span>Paiement 100% sécurisé via FedaPay · Aucun code secret sur le site.</span>
                        </div>

                      </form>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Modal Footer (Sticky) — Seulement en étape formulaire */}
            {modalStep === 'form' && (
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex-shrink-0">
                <button
                  type="submit"
                  form="pay-form"
                  disabled={submitting || payAmount < 100 || payAmount > MAX_TRANSACTION_AMOUNT}
                  className="w-full py-3.5 rounded-2xl text-sm font-black text-white shadow-md transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #7B3FE4 0%, #5B2DC7 100%)' }}
                >
                  {submitting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Initialisation FedaPay...</span>
                    </div>
                  ) : (
                    <>
                      <span>Confirmer le versement de</span>
                      <span className="bg-white/20 px-2 py-0.5 rounded-lg font-mono">
                        {formatMontant(payAmount || 0)}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
