import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase, RentPeriod, Operator } from '../../lib/supabase';
import { initiatePayment } from '../../lib/fedapay';
import { useToast } from '../../components/Toast';
import { formatMontant } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';

const OPERATORS: { id: Operator; label: string; color: string; glow: string }[] = [
  { id: 'mtn',     label: 'MTN',    color: '#F59E0B', glow: 'rgba(245,158,11,0.4)' },
  { id: 'moov',    label: 'Moov',   color: '#3B82F6', glow: 'rgba(59,130,246,0.4)' },
  { id: 'celtiis', label: 'Celtiis',color: '#F97316', glow: 'rgba(249,115,22,0.4)' },
];

export default function Payer() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [currentRentPeriod, setCurrentRentPeriod] = useState<RentPeriod | null>(null);
  const [amount, setAmount]                       = useState(0);
  const [selectedOperator, setSelectedOperator]   = useState<Operator | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [processing, setProcessing]               = useState(false);
  const [error, setError]                         = useState('');
  const [noLease, setNoLease]                     = useState(false);

  /* ── Chargement du bail et de la période ────────────────────────── */
  useEffect(() => {
    if (!profile?.id) return;

    (async () => {
      try {
        const { data: leaseData, error: leaseErr } = await supabase
          .from('leases')
          .select('id, payment_plan_type')
          .eq('tenant_id', profile.id)
          .eq('status', 'actif')
          .maybeSingle();

        if (leaseErr) throw leaseErr;

        if (!leaseData) {
          setNoLease(true);
          setLoading(false);
          return;
        }

        const now = new Date();
        const { data: periodData, error: periodErr } = await supabase
          .from('rent_periods')
          .select('id, amount_due, amount_paid, status, lease_id, period_month, period_year')
          .eq('lease_id', leaseData.id)
          .eq('period_month', now.getMonth() + 1)
          .eq('period_year', now.getFullYear())
          .maybeSingle();

        if (periodErr && periodErr.code !== 'PGRST116') throw periodErr;

        if (periodData) {
          setCurrentRentPeriod(periodData);
          setAmount(Math.max(periodData.amount_due - periodData.amount_paid, 0));
        } else {
          setNoLease(true);
        }
      } catch (err) {
        console.error(err);
        showToast('Erreur lors du chargement', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [profile?.id]);

  /* ── Montants rapides ──────────────────────────────────────────── */
  const handleQuickAmount = (value: number | 'all') => {
    if (!currentRentPeriod) return;
    const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;
    setAmount(value === 'all' ? remaining : Math.min(value, remaining));
  };

  /* ── Paiement ──────────────────────────────────────────────────── */
  const handlePay = async () => {
    setError('');

    if (amount < 100) {
      setError('Le montant minimum est 100 FCFA');
      return;
    }
    if (!selectedOperator) {
      setError('Veuillez sélectionner un opérateur');
      return;
    }
    if (!currentRentPeriod) {
      setError('Impossible de trouver la période de loyer');
      return;
    }

    const phone = profile?.mobile_money_number || profile?.phone || '';
    if (!phone || phone.replace(/\s/g, '').length < 8) {
      setError('Aucun numéro Mobile Money associé à votre compte. Mettez à jour votre profil.');
      return;
    }

    setProcessing(true);
    try {
      const result = await initiatePayment({
        amount,
        operator: selectedOperator,
        rent_period_id: currentRentPeriod.id,
        phone_number: phone.replace(/\s/g, ''),
      });

      if (selectedOperator === 'celtiis' && result.payment_url) {
        window.open(result.payment_url, '_blank');
        showToast("Finalisez le paiement dans l'onglet Fedapay ouvert", 'success');
      } else {
        showToast('Versement initié, confirmez sur votre téléphone', 'success');
      }
      navigate('/historique');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du traitement';
      setError(message);
    } finally {
      setProcessing(false);
    }
  };

  /* ── État de chargement ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="page-container">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin" />
        </div>
        <BottomNav />
      </div>
    );
  }

  /* ── Pas de bail/période active ────────────────────────────────── */
  if (noLease) {
    return (
      <div className="page-container">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          {/* Icône */}
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
               style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)' }}>
            🏠
          </div>
          <h2 className="text-lg font-bold text-[#E8E0FF]">Aucun bail actif</h2>
          <p className="text-sm text-[#8B7BB5]">
            Vous n'avez pas encore de contrat de location actif pour ce mois. Rejoignez un logement pour pouvoir effectuer un versement.
          </p>
          <button
            onClick={() => navigate('/rejoindre')}
            className="btn-primary px-6"
          >
            Rejoindre un logement
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const remaining = currentRentPeriod!.amount_due - currentRentPeriod!.amount_paid;

  /* ── Interface principale ──────────────────────────────────────── */
  return (
    <div className="page-container">
      <div className="flex-1 overflow-y-auto px-5 pt-10 pb-28">

        {/* ── Back header ──────────────────────────────────── */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-[#A855F7] text-sm mb-8 w-fit font-semibold"
          style={{ fontFamily: 'Space Grotesk' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Effectuer un versement
        </button>

        {/* ── Montant à verser ─────────────────────────────── */}
        <div className="mb-6 text-center">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}
          >
            MONTANT À VERSER
          </p>
          <p className="font-nunito font-black text-4xl text-white mb-1">
            <span className="text-[#A855F7] text-xl font-bold mr-1">FCFA</span>
            {amount.toLocaleString('fr-FR')}
          </p>
          <p className="text-xs" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
            Solde restant : {formatMontant(remaining)}
          </p>
        </div>

        {/* ── Versements rapides ───────────────────────────── */}
        <div className="mb-6">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}
          >
            VERSEMENT RAPIDE
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[500, 5000, 10000].map((val) => {
              const isActive = amount === val;
              return (
                <button
                  key={val}
                  onClick={() => handleQuickAmount(val)}
                  disabled={processing}
                  className="py-3 px-1 rounded-xl text-sm font-semibold transition-all border"
                  style={{
                    fontFamily: 'Nunito',
                    background: isActive ? '#1E1545' : '#1A1240',
                    borderColor: isActive ? '#A855F7' : 'transparent',
                    color: isActive ? '#A855F7' : '#E8E0FF',
                  }}
                >
                  {new Intl.NumberFormat('fr-FR').format(val)}
                </button>
              );
            })}
            <button
              onClick={() => handleQuickAmount('all')}
              disabled={processing}
              className="py-3 px-1 rounded-xl text-sm font-semibold transition-all border"
              style={{
                fontFamily: 'Nunito',
                background: amount === remaining ? '#1E1545' : '#1A1240',
                borderColor: amount === remaining ? '#A855F7' : 'transparent',
                color: amount === remaining ? '#A855F7' : '#E8E0FF',
              }}
            >
              Tout
            </button>
          </div>
        </div>

        {/* ── Montant personnalisé ─────────────────────────── */}
        <div className="mb-6">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}
          >
            MONTANT PERSONNALISÉ
          </p>
          <div
            className="rounded-2xl px-4 py-3 text-center"
            style={{ background: '#1A1240', border: '1px solid rgba(168,85,247,0.15)' }}
          >
            <input
              type="number"
              value={amount || ''}
              onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={processing}
              className="w-full bg-transparent text-center text-white text-lg font-bold outline-none"
              style={{ fontFamily: 'Nunito' }}
              placeholder="Entrer un montant"
              min="100"
              max={remaining}
            />
          </div>
        </div>

        {/* ── Opérateur ────────────────────────────────────── */}
        <div className="mb-6">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}
          >
            OPÉRATEUR
          </p>
          <div className="grid grid-cols-3 gap-3">
            {OPERATORS.map((op) => {
              const isSelected = selectedOperator === op.id;
              return (
                <button
                  key={op.id}
                  onClick={() => setSelectedOperator(op.id)}
                  disabled={processing}
                  className="rounded-2xl p-4 flex flex-col items-center gap-3 transition-all"
                  style={{
                    background: isSelected ? 'rgba(30,21,69,0.9)' : 'transparent',
                    border: `1px solid ${isSelected ? '#A855F7' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: isSelected ? `0 0 16px ${op.glow}` : 'none',
                  }}
                >
                  {/* Cercle coloré */}
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{
                      background: `radial-gradient(circle at 35% 35%, ${op.color}ff, ${op.color}99)`,
                      boxShadow: `0 2px 8px ${op.glow}`,
                    }}
                  />
                  <span className="text-xs font-bold text-white" style={{ fontFamily: 'Nunito' }}>
                    {op.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Récapitulatif ────────────────────────────────── */}
        <div
          className="rounded-2xl px-4 py-3 mb-4 flex justify-between items-center"
          style={{ background: '#1A1240', border: '1px solid rgba(168,85,247,0.15)' }}
        >
          <span className="text-sm font-semibold text-white" style={{ fontFamily: 'Space Grotesk' }}>
            Total débité
          </span>
          <span className="text-sm font-black text-[#A855F7]" style={{ fontFamily: 'Nunito' }}>
            {amount.toLocaleString('fr-FR')} FCFA
          </span>
        </div>

        {/* ── Message d'erreur ─────────────────────────────── */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 mb-4 text-sm"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#F87171',
              fontFamily: 'Space Grotesk',
            }}
          >
            {error}
          </div>
        )}

        {/* ── Bouton payer ─────────────────────────────────── */}
        <button
          onClick={handlePay}
          disabled={processing || amount < 100 || !selectedOperator}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Traitement USSD...
            </>
          ) : (
            'Payer via Fedapay →'
          )}
        </button>

      </div>
      <BottomNav />
    </div>
  );
}