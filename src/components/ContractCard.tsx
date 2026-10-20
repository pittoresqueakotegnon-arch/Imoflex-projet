import React, { useState } from 'react';
import { FileText, CheckCircle2, Clock, Download, PenTool, Eye } from 'lucide-react';
import { LeaseContract } from '../lib/supabase';
import { generateLeaseContractPDF } from '../lib/contractPdf';
import { signLeaseContract } from '../lib/leaseDocumentsService';
import { SignatureModal } from './SignatureModal';
import { ContractPreviewModal } from './ContractPreviewModal';
import { useToast } from './Toast';
import { formatMontant } from '../lib/utils';

interface ContractCardProps {
  leaseId: string;
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
  onRefresh: () => void;
  onOpenCreateModal?: () => void;
}

export const ContractCard: React.FC<ContractCardProps> = ({
  contract,
  userRole,
  userName,
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
  onRefresh,
  onOpenCreateModal,
}) => {
  const { showToast } = useToast();
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isOwner = userRole === 'proprietaire';
  const hasUserSigned = isOwner ? contract?.owner_consent : contract?.tenant_consent;

  // Statut visuel
  const getStatusBadge = () => {
    if (!contract) {
      return (
        <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 font-space-grotesk">
          Non rédigé
        </span>
      );
    }
    if (contract.status === 'signe') {
      return (
        <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-space-grotesk">
          <CheckCircle2 size={12} /> Signé des 2 parties ✓
        </span>
      );
    }
    if (contract.status === 'en_attente_locataire') {
      return (
        <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1 font-space-grotesk">
          <Clock size={12} /> En attente du preneur
        </span>
      );
    }
    if (contract.status === 'en_attente_proprietaire') {
      return (
        <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1 font-space-grotesk">
          <Clock size={12} /> En attente du bailleur
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-gray-500/15 text-gray-400 border border-gray-500/30 font-space-grotesk">
        Brouillon
      </span>
    );
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      const pdfDoc = generateLeaseContractPDF({
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

      pdfDoc.save(`Contrat_Bail_${propertyName.replace(/\s+/g, '_')}.pdf`);
      showToast('Téléchargement du contrat lancé !', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de la génération du contrat PDF', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleConfirmSignature = async (sigData: {
    signatureSvg: string;
    signerName: string;
  }) => {
    if (!contract?.id) return;
    setSigning(true);
    try {
      await signLeaseContract(
        contract.id,
        isOwner ? 'owner' : 'tenant',
        sigData.signatureSvg,
        sigData.signerName
      );
      showToast('Votre signature a été apposée avec succès !', 'success');
      setIsSignModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erreur lors de la signature', 'error');
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="card p-5 border border-[var(--imx-border)] bg-[var(--imx-surface-1)] rounded-3xl shadow-sm transition hover:shadow-md">
      {/* En-tête de la carte */}
      <div className="flex items-start justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet/10 text-violet flex items-center justify-center flex-shrink-0 shadow-sm">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="font-nunito font-900 text-base text-[var(--imx-text-primary)]">
              Contrat de bail officiel
            </h3>
            <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk mt-0.5">
              Loi béninoise n° 2022-30 (Bail d'habitation)
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Détails du contrat */}
      {contract ? (
        <div className="space-y-3 mb-4">
          <div className="p-3.5 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)] text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-secondary)]">Référence contrat :</span>
              <span className="font-bold text-[var(--imx-text-primary)] font-space-grotesk bg-violet/10 text-violet px-2 py-0.5 rounded-md">
                {contract.contract_number} (v{contract.version})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-secondary)]">Loyer mensuel :</span>
              <span className="font-black text-[var(--imx-text-primary)] font-nunito text-[13px]">
                {formatMontant(contract.monthly_rent)} FCFA
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-secondary)]">Caution enregistrée :</span>
              <span className="font-bold text-[var(--imx-text-primary)]">
                {contract.deposit_amount ? `${formatMontant(contract.deposit_amount)} FCFA` : 'Non renseignée'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--imx-text-secondary)]">Prise d'effet :</span>
              <span className="font-bold text-[var(--imx-text-primary)]">
                {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(contract.start_date))}
              </span>
            </div>
          </div>

          {/* État des signatures */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${contract.owner_signed_at ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-[var(--imx-surface-2)] border-[var(--imx-border)] text-[var(--imx-text-muted)]'}`}>
              <CheckCircle2 size={15} className={contract.owner_signed_at ? 'text-emerald-400 flex-shrink-0' : 'text-gray-400 opacity-40 flex-shrink-0'} />
              <div className="truncate">
                <span className="block font-bold">Bailleur</span>
                <span className="text-[9px] opacity-80 font-space-grotesk">{contract.owner_signed_at ? 'Signé ✓' : 'En attente'}</span>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${contract.tenant_signed_at ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-[var(--imx-surface-2)] border-[var(--imx-border)] text-[var(--imx-text-muted)]'}`}>
              <CheckCircle2 size={15} className={contract.tenant_signed_at ? 'text-emerald-400 flex-shrink-0' : 'text-gray-400 opacity-40 flex-shrink-0'} />
              <div className="truncate">
                <span className="block font-bold">Locataire</span>
                <span className="text-[9px] opacity-80 font-space-grotesk">{contract.tenant_signed_at ? 'Signé ✓' : 'En attente'}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)] text-center mb-4">
          <p className="text-xs text-[var(--imx-text-secondary)] mb-1 font-medium">
            Aucun contrat de bail officiel n'a encore été rédigé pour cette location.
          </p>
          <p className="text-[10px] text-[var(--imx-text-muted)]">
            La rédaction d'un bail écrit protège le bailleur et le preneur conformément à la loi 2022-30.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Bouton pour créer le bail (propriétaire) */}
        {!contract && isOwner && onOpenCreateModal && (
          <button
            onClick={onOpenCreateModal}
            className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2 shadow-md"
          >
            <PenTool size={14} />
            <span>Rédiger et générer le bail</span>
          </button>
        )}

        {/* Bouton pour lire / consulter le contrat en aperçu */}
        {contract && (
          <button
            onClick={() => setIsPreviewOpen(true)}
            className="flex-1 min-w-[130px] py-2.5 px-3 rounded-xl bg-violet/10 hover:bg-violet/20 text-violet text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <Eye size={14} />
            <span>Consulter le contrat</span>
          </button>
        )}

        {/* Bouton de signature pour la partie concernée */}
        {contract && !hasUserSigned && (
          <button
            onClick={() => setIsSignModalOpen(true)}
            className="flex-1 min-w-[130px] py-2.5 px-3 rounded-xl bg-violet hover:bg-violet-dark text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-md"
          >
            <PenTool size={14} />
            <span>Signer le contrat</span>
          </button>
        )}

        {/* Bouton de téléchargement du PDF */}
        {contract && (
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="py-2.5 px-3 rounded-xl border border-[var(--imx-border)] hover:bg-[var(--imx-surface-2)] text-[var(--imx-text-primary)] text-xs font-semibold transition flex items-center justify-center gap-1.5"
            title="Télécharger le PDF"
          >
            <Download size={14} />
            <span className="hidden sm:inline">{downloading ? 'Génération...' : 'PDF'}</span>
          </button>
        )}
      </div>

      {/* Modal d'aperçu complet et lecture du contrat */}
      <ContractPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        contract={contract}
        userRole={userRole}
        userName={userName}
        propertyName={propertyName}
        propertyAddress={propertyAddress}
        monthlyRent={monthlyRent}
        depositAmount={depositAmount}
        advanceAmount={advanceAmount}
        startDate={startDate}
        ownerName={ownerName}
        tenantName={tenantName}
        ownerPhone={ownerPhone}
        tenantPhone={tenantPhone}
        onOpenSignModal={() => setIsSignModalOpen(true)}
      />

      {/* Modal de signature manuscrite tactile */}
      <SignatureModal
        isOpen={isSignModalOpen}
        onClose={() => setIsSignModalOpen(false)}
        title="Signature du contrat de bail officiel"
        documentTitle={`Contrat N° ${contract?.contract_number || ''}`}
        signerName={userName}
        signerRole={isOwner ? 'Propriétaire' : 'Locataire'}
        onConfirm={handleConfirmSignature}
        loading={signing}
      />
    </div>
  );
};
