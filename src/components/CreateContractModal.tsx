import React, { useState } from 'react';
import { X, Check, FileText, AlertCircle, Info } from 'lucide-react';
import { saveLeaseContract } from '../lib/leaseDocumentsService';
import { useToast } from './Toast';

interface CreateContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaseId: string;
  defaultRent: number;
  defaultAddress: string;
  defaultStartDate: string;
  onSuccess: () => void;
}

export const CreateContractModal: React.FC<CreateContractModalProps> = ({
  isOpen,
  onClose,
  leaseId,
  defaultRent,
  defaultStartDate,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [monthlyRent, setMonthlyRent] = useState(defaultRent.toString());
  const [depositAmount, setDepositAmount] = useState((defaultRent * 3).toString()); // Suggestion conforme plafond 3 mois loi 2022-30
  const [advanceAmount, setAdvanceAmount] = useState('0');
  const [chargesAmount, setChargesAmount] = useState('0');
  const [paymentDeadlineDay, setPaymentDeadlineDay] = useState('5');
  const [durationMonths, setDurationMonths] = useState('12');
  const [startDate, setStartDate] = useState(defaultStartDate || new Date().toISOString().split('T')[0]);
  const [noticePeriodMonths, setNoticePeriodMonths] = useState('3');
  const [specialClauses, setSpecialClauses] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const rent = parseInt(monthlyRent, 10);
    const deposit = parseInt(depositAmount, 10) || 0;
    const advance = parseInt(advanceAmount, 10) || 0;
    const duration = parseInt(durationMonths, 10);
    const deadlineDay = parseInt(paymentDeadlineDay, 10);
    const notice = parseInt(noticePeriodMonths, 10);

    if (isNaN(rent) || rent <= 0) {
      setError('Le montant du loyer mensuel doit être supérieur à 0.');
      return;
    }

    // Rappel de la loi béninoise 2022-30 : caution plafonnée à 3 mois de loyer
    if (deposit > rent * 3) {
      if (!window.confirm('Attention : Selon la loi béninoise n° 2022-30 (art. 10), la caution ne peut excéder 3 mois de loyer. Souhaitez-vous quand même continuer ?')) {
        return;
      }
    }

    setLoading(true);
    try {
      await saveLeaseContract({
        lease_id: leaseId,
        monthly_rent: rent,
        deposit_amount: deposit,
        advance_amount: advance,
        charges_amount: parseInt(chargesAmount, 10) || 0,
        payment_deadline_day: deadlineDay || 5,
        duration_months: duration || 12,
        start_date: startDate,
        notice_period_months: notice || 3,
        special_clauses: specialClauses.trim() || null,
        property_usage: 'habitation_exclusive',
      });

      showToast('Contrat de bail rédigé avec succès !', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erreur lors de la création du contrat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-[var(--imx-surface-1)] border border-[var(--imx-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* En-tête */}
        <div className="px-5 py-4 border-b border-[var(--imx-border)] flex items-center justify-between bg-[var(--imx-surface-2)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet/10 text-violet flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="font-nunito font-800 text-base text-[var(--imx-text-primary)] leading-tight">
                Rédiger le contrat de bail
              </h3>
              <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
                Conforme loi béninoise n° 2022-30
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-full hover:bg-[var(--imx-surface-3)] text-[var(--imx-text-muted)] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Rappel légal */}
          <div className="p-3 rounded-2xl bg-violet/5 border border-violet/20 flex items-start gap-2.5 text-xs text-[var(--imx-text-secondary)]">
            <Info size={16} className="text-violet flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              Ce formulaire prépare le bail écrit officiel. Au Bénin (loi 2022-30), la caution est plafonnée à <strong>3 mois de loyer</strong> maximum.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Loyer */}
            <div>
              <label className="label block mb-1 text-xs">LOYER MENSUEL (FCFA)</label>
              <input
                type="number"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className="input-field text-sm font-bold"
                required
              />
            </div>

            {/* Caution */}
            <div>
              <label className="label block mb-1 text-xs">CAUTION (FCFA)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="input-field text-sm"
                placeholder="Max 3 mois"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Avance */}
            <div>
              <label className="label block mb-1 text-xs">AVANCE DE LOYER (FCFA)</label>
              <input
                type="number"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className="input-field text-sm"
                placeholder="0"
              />
            </div>

            {/* Charges */}
            <div>
              <label className="label block mb-1 text-xs">CHARGES FORFAITAIRES (FCFA)</label>
              <input
                type="number"
                value={chargesAmount}
                onChange={(e) => setChargesAmount(e.target.value)}
                className="input-field text-sm"
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Date début */}
            <div className="col-span-2">
              <label className="label block mb-1 text-xs">DATE DE DÉBUT</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-field text-sm"
                required
              />
            </div>

            {/* Durée */}
            <div>
              <label className="label block mb-1 text-xs">DURÉE (MOIS)</label>
              <input
                type="number"
                value={durationMonths}
                onChange={(e) => setDurationMonths(e.target.value)}
                className="input-field text-sm"
                min="1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Jour limite */}
            <div>
              <label className="label block mb-1 text-xs">JOUR LIMITE DE PAIEMENT</label>
              <input
                type="number"
                value={paymentDeadlineDay}
                onChange={(e) => setPaymentDeadlineDay(e.target.value)}
                className="input-field text-sm"
                min="1"
                max="28"
              />
            </div>

            {/* Préavis */}
            <div>
              <label className="label block mb-1 text-xs">PRÉAVIS DE CONGÉ (MOIS)</label>
              <input
                type="number"
                value={noticePeriodMonths}
                onChange={(e) => setNoticePeriodMonths(e.target.value)}
                className="input-field text-sm"
                min="1"
              />
            </div>
          </div>

          {/* Conditions particulières */}
          <div>
            <label className="label block mb-1 text-xs">CLAUSES PARTICULIÈRES (OPTIONNEL)</label>
            <textarea
              value={specialClauses}
              onChange={(e) => setSpecialClauses(e.target.value)}
              className="input-field text-xs h-20 resize-none"
              placeholder="Ex: Animaux de compagnie non autorisés, repeinte obligatoire avant départ, etc."
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl border border-[var(--imx-border)] text-[var(--imx-text-secondary)] text-sm font-semibold hover:bg-[var(--imx-surface-2)] transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl bg-violet text-white text-sm font-bold shadow-lg hover:bg-violet-dark transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Création...</span>
              ) : (
                <>
                  <Check size={16} />
                  <span>Enregistrer le bail</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
