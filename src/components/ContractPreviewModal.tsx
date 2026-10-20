import React from 'react';
import { X, FileText, Download, PenTool, CheckCircle2, Clock, ShieldCheck, User } from 'lucide-react';
import { LeaseContract } from '../lib/supabase';
import { formatMontant } from '../lib/utils';
import { generateLeaseContractPDF } from '../lib/contractPdf';
import { useToast } from './Toast';

interface ContractPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: LeaseContract | null;
  userRole: 'proprietaire' | 'locataire';
  userName: string;
  propertyName: string;
  propertyAddress: string;
  monthlyRent: number;
  depositAmount?: number;
  advanceAmount?: number;
  startDate: string;
  ownerName: string;
  tenantName: string;
  ownerPhone?: string;
  tenantPhone?: string;
  onOpenSignModal?: () => void;
}

export const ContractPreviewModal: React.FC<ContractPreviewModalProps> = ({
  isOpen,
  onClose,
  contract,
  userRole,
  propertyName,
  propertyAddress,
  monthlyRent,
  depositAmount = 0,
  advanceAmount = 0,
  startDate,
  ownerName,
  tenantName,
  ownerPhone,
  tenantPhone,
  onOpenSignModal,
}) => {
  const { showToast } = useToast();
  const [downloading, setDownloading] = React.useState(false);

  if (!isOpen) return null;

  const isOwner = userRole === 'proprietaire';
  const hasUserSigned = isOwner ? contract?.owner_consent : contract?.tenant_consent;

  const handleDownload = () => {
    setDownloading(true);
    try {
      const doc = generateLeaseContractPDF({
        contractNumber: contract?.contract_number || `BAIL-${new Date().getFullYear()}`,
        version: contract?.version || 1,
        dateGenerated: new Date(),
        ownerName,
        ownerPhone,
        ownerSignatureImage: contract?.owner_signature_svg,
        ownerSignedAt: contract?.owner_signed_at,
        tenantName,
        tenantPhone,
        tenantSignatureImage: contract?.tenant_signature_svg,
        tenantSignedAt: contract?.tenant_signed_at,
        propertyName,
        propertyAddress,
        propertyUsage: contract?.property_usage || 'habitation_exclusive',
        monthlyRent: contract?.monthly_rent || monthlyRent,
        depositAmount: contract?.deposit_amount ?? depositAmount,
        advanceAmount: contract?.advance_amount ?? advanceAmount,
        chargesAmount: contract?.charges_amount || 0,
        paymentDeadlineDay: contract?.payment_deadline_day || 5,
        startDate: contract?.start_date || startDate,
        endDate: contract?.end_date,
        durationMonths: contract?.duration_months || 12,
        noticePeriodMonths: contract?.notice_period_months || 3,
        specialClauses: contract?.special_clauses,
        documentHash: contract?.document_hash,
      });

      doc.save(`Contrat_Bail_${propertyName.replace(/\s+/g, '_')}.pdf`);
      showToast('Téléchargement du contrat lancé !', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la génération du PDF', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const rentVal = contract?.monthly_rent || monthlyRent;
  const depositVal = contract?.deposit_amount ?? depositAmount;
  const advanceVal = contract?.advance_amount ?? advanceAmount;
  const durationVal = contract?.duration_months || 12;
  const deadlineVal = contract?.payment_deadline_day || 5;
  const noticeVal = contract?.notice_period_months || 3;
  const startVal = contract?.start_date || startDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--imx-border)] flex items-center justify-between bg-[var(--imx-surface-2)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet/10 text-violet flex items-center justify-center flex-shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-nunito font-900 text-base text-[var(--imx-text-primary)]">
                  Lecture officielle du contrat de bail
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet/10 text-violet border border-violet/20 font-space-grotesk">
                  {contract?.contract_number || 'Brouillon'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
                Conforme loi béninoise n° 2022-30 du 20 décembre 2022
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[var(--imx-surface-3)] text-[var(--imx-text-muted)] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Viewer */}
        <div className="p-5 overflow-y-auto space-y-5 text-[13px] leading-relaxed">
          {/* Status banner */}
          <div className="p-4 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-[var(--imx-text-secondary)] uppercase tracking-wider font-space-grotesk">
                Progression des signatures
              </span>
              {contract?.status === 'signe' ? (
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Scellé & Signé des 2 parties
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Clock size={12} /> Signature en cours
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className={`p-3 rounded-xl border ${contract?.owner_signed_at ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--imx-surface-1)] border-[var(--imx-border)]'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <User size={14} className={contract?.owner_signed_at ? 'text-emerald-400' : 'text-gray-400'} />
                  <span className="font-bold text-[var(--imx-text-primary)]">Bailleur</span>
                </div>
                <p className="text-[11px] text-[var(--imx-text-secondary)] truncate">{ownerName}</p>
                <p className="text-[10px] mt-1 font-space-grotesk">
                  {contract?.owner_signed_at ? (
                    <span className="text-emerald-400 font-bold">✓ Signé le {new Date(contract.owner_signed_at).toLocaleDateString('fr-FR')}</span>
                  ) : (
                    <span className="text-amber-400">En attente de signature</span>
                  )}
                </p>
              </div>

              <div className={`p-3 rounded-xl border ${contract?.tenant_signed_at ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--imx-surface-1)] border-[var(--imx-border)]'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <User size={14} className={contract?.tenant_signed_at ? 'text-emerald-400' : 'text-gray-400'} />
                  <span className="font-bold text-[var(--imx-text-primary)]">Preneur (Locataire)</span>
                </div>
                <p className="text-[11px] text-[var(--imx-text-secondary)] truncate">{tenantName}</p>
                <p className="text-[10px] mt-1 font-space-grotesk">
                  {contract?.tenant_signed_at ? (
                    <span className="text-emerald-400 font-bold">✓ Signé le {new Date(contract.tenant_signed_at).toLocaleDateString('fr-FR')}</span>
                  ) : (
                    <span className="text-amber-400">En attente de signature</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Synthèse essentielle du bail */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
              <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk block mb-1">LOYER MENSUEL</span>
              <p className="font-black text-sm text-[var(--imx-text-primary)]">{formatMontant(rentVal)} F</p>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
              <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk block mb-1">DÉPÔT GARANTIE</span>
              <p className="font-black text-sm text-[var(--imx-text-primary)]">{depositVal > 0 ? `${formatMontant(depositVal)} F` : '0 F'}</p>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
              <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk block mb-1">DURÉE DU BAIL</span>
              <p className="font-black text-sm text-[var(--imx-text-primary)]">{durationVal} mois</p>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
              <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk block mb-1">DATE LIMITE</span>
              <p className="font-black text-sm text-[var(--imx-text-primary)]">Le {deadlineVal} du mois</p>
            </div>
          </div>

          {/* Clauses du contrat - Lecture complète */}
          <div className="p-4 rounded-2xl bg-white text-[#17132B] shadow-sm border border-gray-100 space-y-4">
            <div className="border-b border-gray-100 pb-3 text-center">
              <h4 className="font-nunito font-900 text-sm text-[#17132B] uppercase tracking-wide">
                Contrat de bail à usage d'habitation domestique
              </h4>
              <p className="text-[10px] text-gray-500 font-space-grotesk mt-0.5">
                Régime légal de la République du Bénin — Loi n° 2022-30
              </p>
            </div>

            {/* Parties */}
            <div className="space-y-1.5 text-xs">
              <p className="font-bold text-[#7B3FE4]">ENTRE LES SOUSSIGNÉS :</p>
              <div className="pl-3 border-l-2 border-[#7B3FE4]/30 space-y-1 text-gray-700">
                <p><strong>1. Le Bailleur :</strong> {ownerName} {ownerPhone ? `(Tél : ${ownerPhone})` : ''}</p>
                <p><strong>2. Le Preneur :</strong> {tenantName} {tenantPhone ? `(Tél : ${tenantPhone})` : ''}</p>
              </div>
            </div>

            {/* Articles */}
            <div className="space-y-3 text-xs text-gray-700">
              <div>
                <p className="font-bold text-[#17132B]">ARTICLE 1 — Objet et désignation des lieux</p>
                <p className="text-[12px] text-gray-600 mt-0.5">
                  Le Bailleur donne en location à usage exclusif d'habitation le bien dénommé <strong>« {propertyName} »</strong> situé à : {propertyAddress}.
                </p>
              </div>

              <div>
                <p className="font-bold text-[#17132B]">ARTICLE 2 — Durée et prise d'effet</p>
                <p className="text-[12px] text-gray-600 mt-0.5">
                  Le présent bail est conclu pour une durée de <strong>{durationVal} mois</strong> à compter du {startVal ? new Date(startVal).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}.
                </p>
              </div>

              <div>
                <p className="font-bold text-[#17132B]">ARTICLE 3 — Loyer et modalités de règlement</p>
                <p className="text-[12px] text-gray-600 mt-0.5">
                  Le loyer mensuel est fixé à <strong>{formatMontant(rentVal)} FCFA</strong>, payable au plus tard le <strong>{deadlineVal}</strong> de chaque mois via la plateforme ImoFlex.
                </p>
              </div>

              <div>
                <p className="font-bold text-[#17132B]">ARTICLE 4 — Dépôt de garantie et avance</p>
                <p className="text-[12px] text-gray-600 mt-0.5">
                  Caution de garantie : <strong>{depositVal > 0 ? `${formatMontant(depositVal)} FCFA` : 'Aucune'}</strong> (respectant le plafond légal de 3 mois de loyer selon la loi 2022-30). {advanceVal > 0 ? `Avance : ${formatMontant(advanceVal)} FCFA.` : ''}
                </p>
              </div>

              <div>
                <p className="font-bold text-[#17132B]">ARTICLE 5 — État des lieux contradictoire</p>
                <p className="text-[12px] text-gray-600 mt-0.5">
                  Un état des lieux contradictoire d'entrée avec photographies et relevés de compteurs est dressé à la remise des clés. Un état des lieux de sortie est réalisé lors de la restitution.
                </p>
              </div>

              <div>
                <p className="font-bold text-[#17132B]">ARTICLE 6 — Résiliation et préavis</p>
                <p className="text-[12px] text-gray-600 mt-0.5">
                  Le préavis de congé réciproque est fixé à <strong>{noticeVal} mois</strong> notifié dans les conditions légales.
                </p>
              </div>

              {contract?.special_clauses && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-purple-900">
                  <p className="font-bold text-[11px] uppercase tracking-wide">Clauses particulières convenues</p>
                  <p className="text-[12px] mt-1 italic">{contract.special_clauses}</p>
                </div>
              )}
            </div>

            {/* Intégrité */}
            {contract?.document_hash && (
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-mono">
                <span>SHA-256 : {contract.document_hash.substring(0, 24)}…</span>
                <span className="flex items-center gap-1 text-emerald-600"><ShieldCheck size={12} /> Document scellé</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-[var(--imx-border)] bg-[var(--imx-surface-2)] flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-[var(--imx-border)] hover:bg-[var(--imx-surface-3)] text-[var(--imx-text-secondary)] text-xs font-semibold transition"
          >
            Fermer
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="py-2.5 px-3.5 rounded-xl border border-violet/30 hover:bg-violet/10 text-violet text-xs font-bold transition flex items-center gap-1.5"
            >
              <Download size={14} />
              <span>{downloading ? 'Génération...' : 'Télécharger PDF'}</span>
            </button>

            {!hasUserSigned && onOpenSignModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSignModal();
                }}
                className="py-2.5 px-4 rounded-xl bg-violet hover:bg-violet-dark text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
              >
                <PenTool size={14} />
                <span>Apposer ma signature</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
