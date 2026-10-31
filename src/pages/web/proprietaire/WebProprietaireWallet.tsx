import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, ArrowUpRight, RefreshCw, X, ShieldCheck, Lock,
  Clock3, CheckCircle2, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useWallet } from '../../../hooks/useWallet';
import { supabase, Operator } from '../../../lib/supabase';
import { formatMontant } from '../../../lib/utils';
import { normalizeBjPhone, requestWithdrawal } from '../../../lib/fedapay';
import { useToast } from '../../../components/Toast';
import { logAction } from '../../../lib/audit';
import { useOwnerVerification } from '../../../hooks/useOwnerVerification';
import { OWNER_VERIFICATION_STATUS_META } from '../../../lib/ownerVerification';

type ModalStep = 'form' | 'setup_pin' | 'confirm_pin' | 'success';

interface SuccessData {
  withdrawalId: string;
  fedapayPayoutId?: string;
  amount: number;
  operator: Operator;
  phone: string;
  status: string;
}

export default function WebProprietaireWallet() {
  const { profile } = useAuth();
  const { wallet, refetch: refreshWallet } = useWallet(profile?.id);
  const { showToast } = useToast();
  const { verification, loading: verificationLoading } = useOwnerVerification(profile?.role === 'proprietaire');

  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Security PIN
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [authId, setAuthId] = useState<string | null>(null);
  const withdrawalIdempotencyKey = useRef(crypto.randomUUID());

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('form');
  const [amount, setAmount] = useState<number>(0);
  const [operator, setOperator] = useState<Operator>('mtn');
  const [phone, setPhone] = useState(profile?.mobile_money_number || profile?.phone || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  // Check PIN state on load
  useEffect(() => {
    const checkPin = async () => {
      if (!profile?.id) return;
      try {
        const { data } = await supabase
          .from('users')
          .select('has_withdrawal_pin')
          .eq('id', profile.id)
          .single();
        setHasPin(data?.has_withdrawal_pin ?? false);
      } catch (err) {
        console.error('[WebProprietaireWallet] Error checking PIN:', err);
      }
    };
    checkPin();
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.mobile_money_number) {
      setPhone(profile.mobile_money_number);
    } else if (profile?.phone) {
      setPhone(profile.phone);
    }
  }, [profile]);

  const fetchWithdrawals = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error: err } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setWithdrawals(data || []);
    } catch (err) {
      console.error('[WebProprietaireWallet] Fetch error:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const openWithdrawModal = () => {
    setError(null);
    setPin('');
    setNewPin('');
    setConfirmNewPin('');
    setAuthId(null);
    setSuccessData(null);
    setModalStep('form');
    withdrawalIdempotencyKey.current = crypto.randomUUID();
    setAmount(wallet?.available_balance || 0);
    setModalOpen(true);
  };

  const closeWithdrawModal = () => {
    setModalOpen(false);
    setError(null);
  };

  const handleFormContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    const available = wallet?.available_balance || 0;
    if (amount < 100) {
      setError('Le montant minimum de retrait est de 100 FCFA.');
      return;
    }
    if (amount > available) {
      setError(`Le montant demandé dépasse votre solde disponible (${formatMontant(available)}).`);
      return;
    }

    const cleanPhone = normalizeBjPhone(phone);
    if (cleanPhone.length !== 10) {
      setError('Numéro de téléphone béninois invalide (10 chiffres attendus, ex: 01 97 00 00 00).');
      return;
    }

    setError(null);

    if (!hasPin) {
      setModalStep('setup_pin');
      return;
    }

    setSubmitting(true);
    try {
      const { data: generatedAuthId, error: authError } = await supabase.rpc('create_withdrawal_authorization', {
        p_amount: amount,
        p_destination_phone: cleanPhone,
        p_operator: operator,
      });

      if (authError) throw authError;

      setAuthId(generatedAuthId);
      setPin('');
      setModalStep('confirm_pin');
    } catch (err: any) {
      setError(err?.message || "Erreur lors de la création de l'autorisation de retrait.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setError('Le code secret doit être composé de 4 chiffres.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setError('Les deux codes saisis ne sont pas identiques.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error: pinError } = await supabase.rpc('set_initial_withdrawal_pin', { p_pin: newPin });
      if (pinError) throw pinError;

      setHasPin(true);
      showToast('Code secret configuré avec succès', 'success');

      const cleanPhone = normalizeBjPhone(phone);
      const { data: generatedAuthId, error: authError } = await supabase.rpc('create_withdrawal_authorization', {
        p_amount: amount,
        p_destination_phone: cleanPhone,
        p_operator: operator,
      });

      if (authError) throw authError;

      setAuthId(generatedAuthId);
      setPin(newPin);
      setModalStep('confirm_pin');
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la configuration du code secret.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet || !profile?.id || !authId) return;
    if (pin.length !== 4) {
      setError('Veuillez saisir votre code secret à 4 chiffres.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await requestWithdrawal({
        wallet_id: wallet.id,
        authorization_id: authId,
        pin,
        idempotency_key: withdrawalIdempotencyKey.current,
      });

      const cleanPhone = normalizeBjPhone(phone);
      logAction({
        userId: profile.id,
        action: 'retrait',
        entityType: 'withdrawals',
        details: { amount, operator, phone: cleanPhone },
      });

      setSuccessData({
        withdrawalId: result.withdrawal_id,
        fedapayPayoutId: result.fedapay_payout_id,
        amount,
        operator,
        phone: cleanPhone,
        status: result.status || 'en_attente',
      });

      setModalStep('success');
      showToast('Demande de retrait transmise avec succès !', 'success');
      refreshWallet();
      fetchWithdrawals();
    } catch (err: any) {
      setError(err?.message || 'Une erreur est survenue lors du traitement du retrait.');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingTotal = withdrawals
    .filter((w) => w.status === 'en_attente')
    .reduce((acc, w) => acc + (w.amount || 0), 0);

  const isVerified = verification.verification_status === 'verifie';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Portefeuille & Retrait des Loyers
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Visualisez les loyers collectés et virez vos fonds en toute sécurité vers votre compte Mobile Money.
          </p>
        </div>

        <button
          onClick={() => { refreshWallet(); fetchWithdrawals(); }}
          className="p-2.5 rounded-xl border bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          style={{ borderColor: 'var(--imx-border)' }}
          title="Rafraîchir"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Verification Warning Banner if not verified */}
      {!verificationLoading && !isVerified && (
        <div className="mb-6 p-4 rounded-2xl border border-amber-200 bg-amber-50/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                {OWNER_VERIFICATION_STATUS_META[verification.verification_status]?.label || 'Vérification requise'}
              </h3>
              <p className="text-xs text-amber-800 mt-0.5">
                {OWNER_VERIFICATION_STATUS_META[verification.verification_status]?.description ||
                  "La validation de votre identité est obligatoire avant d'effectuer un retrait de fonds."}
              </p>
            </div>
          </div>
          <Link
            to="/web/pro/verification"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors flex-shrink-0 shadow-sm"
          >
            <span>Compléter mon dossier</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Main Available Balance */}
        <div
          className="p-6 rounded-2xl text-white shadow-lg shadow-purple-900/10 flex flex-col justify-between"
          style={{ background: 'linear-gradient(135deg, #7B3FE4 0%, #A855F7 100%)' }}
        >
          <div>
            <span className="text-xs font-semibold text-white/80 uppercase tracking-wider block mb-2">
              Solde disponible au retrait
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white" style={{ fontFamily: 'Sora' }}>
                {new Intl.NumberFormat('fr-FR').format(wallet?.available_balance || 0)}
              </span>
              <span className="text-sm font-bold text-white/85">FCFA</span>
            </div>
          </div>

          <button
            onClick={openWithdrawModal}
            disabled={!wallet || wallet.available_balance <= 0}
            className="mt-6 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white text-[#7B3FE4] font-bold text-sm shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          >
            <ArrowUpRight size={16} />
            Demander un retrait
          </button>
        </div>

        {/* Total Earned */}
        <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--imx-border)' }}>
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Total cumulé perçu
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-gray-900" style={{ fontFamily: 'Sora' }}>
                {new Intl.NumberFormat('fr-FR').format(wallet?.total_earned || 0)}
              </span>
              <span className="text-sm font-bold text-gray-500">FCFA</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Totalité des loyers nets encaissés depuis l'ouverture de votre compte ImoFlex.
          </p>
        </div>

        {/* Pending Withdrawals */}
        <div className="p-6 rounded-2xl border bg-white shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--imx-border)' }}>
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Retraits en cours
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-600" style={{ fontFamily: 'Sora' }}>
                {new Intl.NumberFormat('fr-FR').format(pendingTotal)}
              </span>
              <span className="text-sm font-bold text-amber-600/80">FCFA</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Demandes transmises pour virement sur votre compte Mobile Money.
          </p>
        </div>
      </div>

      {/* Withdrawals History */}
      <div>
        <h2 className="text-base font-bold text-[#17132B] mb-4" style={{ fontFamily: 'Sora' }}>
          Historique des retraits
        </h2>

        {loadingHistory ? (
          <div className="p-8 text-center text-xs text-gray-400">Chargement de l'historique...</div>
        ) : withdrawals.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
            Aucun retrait demandé pour le moment.
          </div>
        ) : (
          <div className="rounded-2xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: 'var(--imx-border)' }}>
            <div className="divide-y" style={{ borderColor: 'var(--imx-border)' }}>
              {withdrawals.map((w) => (
                <div key={w.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        w.status === 'valide'
                          ? 'bg-emerald-50 text-emerald-600'
                          : w.status === 'rejete'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      <Wallet size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">
                        Retrait {w.operator?.toUpperCase()} · {w.phone}
                      </p>
                      <p className="text-gray-400">
                        {new Date(w.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-black text-sm text-gray-900">
                      {new Intl.NumberFormat('fr-FR').format(w.amount)} <span className="text-xs font-semibold text-gray-500">FCFA</span>
                    </p>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        w.status === 'valide'
                          ? 'text-emerald-600'
                          : w.status === 'rejete'
                          ? 'text-red-500'
                          : 'text-amber-500'
                      }`}
                    >
                      {w.status === 'valide' ? 'Transféré' : w.status === 'rejete' ? 'Rejeté' : 'En traitement'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white border p-6 shadow-2xl relative" style={{ borderColor: 'var(--imx-border)' }}>
            <button
              onClick={closeWithdrawModal}
              className="absolute top-4 right-4 p-1 rounded-lg text-gray-400 hover:text-gray-700"
            >
              <X size={18} />
            </button>

            {/* If NOT verified: Gate withdrawal */}
            {!isVerified ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
                  {verification.verification_status === 'en_attente' ? (
                    <Clock3 size={28} />
                  ) : (
                    <ShieldCheck size={28} />
                  )}
                </div>
                <h3 className="text-lg font-black text-[#17132B] mb-2" style={{ fontFamily: 'Sora' }}>
                  {OWNER_VERIFICATION_STATUS_META[verification.verification_status]?.label || 'Vérification requise'}
                </h3>
                <p className="text-xs text-gray-600 mb-6 leading-relaxed max-w-xs mx-auto">
                  {OWNER_VERIFICATION_STATUS_META[verification.verification_status]?.description ||
                    'Conformément à la réglementation béninoise, la vérification de votre identité est obligatoire avant tout virement de fonds.'}
                </p>
                {verification.verification_status === 'refuse' && verification.rejection_reason && (
                  <div className="p-3 rounded-xl mb-5 text-xs text-left bg-red-50 text-red-700 border border-red-200">
                    <strong>Motif du rejet :</strong> {verification.rejection_reason}
                  </div>
                )}
                {verification.verification_status !== 'en_attente' ? (
                  <Link
                    to="/web/pro/verification"
                    onClick={closeWithdrawModal}
                    className="w-full py-3 px-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 shadow-sm"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    <ShieldCheck size={16} />
                    Vérifier mon identité
                  </Link>
                ) : (
                  <button
                    onClick={closeWithdrawModal}
                    className="w-full py-2.5 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Fermer
                  </button>
                )}
              </div>
            ) : modalStep === 'form' ? (
              /* Step 1: Form */
              <div>
                <h3 className="text-lg font-black text-[#17132B] mb-1" style={{ fontFamily: 'Sora' }}>
                  Demander un retrait
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Transférer vos fonds vers votre compte Mobile Money béninois.
                </p>

                {error && (
                  <div className="p-3 rounded-xl mb-4 text-xs bg-red-50 text-red-600 border border-red-200">
                    {error}
                  </div>
                )}

                <form onSubmit={handleFormContinue} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Montant à retirer (FCFA)</label>
                    <input
                      type="number"
                      min={100}
                      max={wallet?.available_balance || 0}
                      value={amount || ''}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border text-sm font-bold text-gray-900 outline-none"
                      style={{ borderColor: 'var(--imx-border)' }}
                      placeholder="Ex: 50000"
                      required
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Solde disponible maximum : {formatMontant(wallet?.available_balance || 0)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Réseau récepteur</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: 'mtn', label: 'MTN MoMo' },
                        { key: 'moov', label: 'Moov Money' },
                        { key: 'celtiis', label: 'Celtiis Pay' },
                      ].map((op) => (
                        <button
                          key={op.key}
                          type="button"
                          onClick={() => setOperator(op.key as Operator)}
                          className={`py-2 px-1 text-center rounded-xl text-xs font-bold border transition-all ${
                            operator === op.key
                              ? 'border-[#7B3FE4] bg-[#F1EBFF] text-[#7B3FE4]'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Numéro Mobile Money bénéficiaire</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01 97 00 00 00"
                      required
                      className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--imx-border)' }}
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 text-[11px] text-gray-500">
                    <ShieldCheck size={16} className="text-emerald-500 flex-shrink-0" />
                    <span>Sécurisé par code PIN et exécuté directement vers votre compte Mobile Money.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || amount < 100}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      `Continuer (${formatMontant(amount)})`
                    )}
                  </button>
                </form>
              </div>
            ) : modalStep === 'setup_pin' ? (
              /* Step 2a: Setup PIN */
              <div>
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-[#7B3FE4] flex items-center justify-center mx-auto mb-3">
                  <Lock size={22} />
                </div>
                <h3 className="text-lg font-black text-[#17132B] text-center mb-1" style={{ fontFamily: 'Sora' }}>
                  Définir votre code PIN de retrait
                </h3>
                <p className="text-xs text-gray-500 text-center mb-4 leading-relaxed">
                  Pour protéger vos loyers, définissez un code secret à 4 chiffres. Vous l'utiliserez pour confirmer chaque virement.
                </p>

                {error && (
                  <div className="p-3 rounded-xl mb-4 text-xs bg-red-50 text-red-600 border border-red-200">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSetupPinSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Code secret (4 chiffres)</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      required
                      className="w-full px-4 py-2.5 rounded-xl border text-center text-lg font-mono tracking-widest outline-none"
                      style={{ borderColor: 'var(--imx-border)' }}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Confirmer le code secret</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      value={confirmNewPin}
                      onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      required
                      className="w-full px-4 py-2.5 rounded-xl border text-center text-lg font-mono tracking-widest outline-none"
                      style={{ borderColor: 'var(--imx-border)' }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || newPin.length !== 4 || confirmNewPin.length !== 4}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    {submitting ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : (
                      'Enregistrer le code et continuer'
                    )}
                  </button>
                </form>
              </div>
            ) : modalStep === 'confirm_pin' ? (
              /* Step 2b: Confirm with PIN */
              <div>
                <h3 className="text-lg font-black text-[#17132B] mb-1" style={{ fontFamily: 'Sora' }}>
                  Confirmation du retrait
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Saisissez votre code PIN pour ordonner le virement vers votre Mobile Money.
                </p>

                {/* Recap Box */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 mb-4 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Montant à transférer</span>
                    <span className="font-bold text-gray-900 text-sm">{formatMontant(amount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Réseau</span>
                    <span className="font-semibold text-gray-800 uppercase">{operator}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Numéro bénéficiaire</span>
                    <span className="font-mono font-semibold text-gray-800">{phone}</span>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl mb-4 text-xs bg-red-50 text-red-600 border border-red-200">
                    {error}
                  </div>
                )}

                <form onSubmit={handleConfirmWithdrawal} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Code secret de retrait (4 chiffres)</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4}"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      autoFocus
                      required
                      className="w-full px-4 py-2.5 rounded-xl border text-center text-xl font-mono tracking-widest outline-none"
                      style={{ borderColor: 'var(--imx-border)' }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setError(null); setModalStep('form'); }}
                      className="w-1/3 py-3 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Retour
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || pin.length !== 4}
                      className="w-2/3 py-3 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: 'var(--imx-accent)' }}
                    >
                      {submitting ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                      ) : (
                        'Valider le virement'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Step 3: Success */
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="text-lg font-black text-[#17132B] mb-1" style={{ fontFamily: 'Sora' }}>
                  Retrait initié avec succès !
                </h3>
                <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                  Votre demande de virement de <strong>{formatMontant(successData?.amount || 0)}</strong> vers le numéro{' '}
                  <strong>{successData?.phone}</strong> ({successData?.operator.toUpperCase()}) a été prise en compte.
                </p>

                <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 text-left text-xs mb-6 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Statut :</span>
                    <span className="font-bold text-amber-600">En cours de traitement</span>
                  </div>
                  {successData?.fedapayPayoutId && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Réf. transaction :</span>
                      <span className="font-mono text-gray-700">{successData.fedapayPayoutId}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={closeWithdrawModal}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white shadow-md"
                  style={{ background: 'var(--imx-accent)' }}
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
