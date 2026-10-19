import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle2, Clock, Download, Plus, Columns } from 'lucide-react';
import { PropertyInspection } from '../lib/supabase';
import { generateInspectionReportPDF } from '../lib/inspectionPdf';
import { confirmInspection } from '../lib/leaseDocumentsService';
import { SignatureModal } from './SignatureModal';
import { useToast } from './Toast';

interface InspectionCardProps {
  leaseId: string;
  inspections: PropertyInspection[];
  userRole: 'proprietaire' | 'locataire';
  userName: string;
  propertyName: string;
  propertyAddress: string;
  ownerName: string;
  tenantName: string;
  contractNumber?: string;
  onRefresh: () => void;
  onOpenCreateModal?: () => void;
  onOpenCompareModal?: () => void;
}

export const InspectionCard: React.FC<InspectionCardProps> = ({
  inspections,
  userRole,
  userName,
  propertyName,
  propertyAddress,
  ownerName,
  tenantName,
  contractNumber,
  onRefresh,
  onOpenCreateModal,
  onOpenCompareModal,
}) => {
  const { showToast } = useToast();
  const [selectedInspectionForSign, setSelectedInspectionForSign] = useState<PropertyInspection | null>(null);
  const [reserves, setReserves] = useState('');
  const [signing, setSigning] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isOwner = userRole === 'proprietaire';
  const entryInspection = inspections.find(i => i.inspection_type === 'entree');
  const exitInspection = inspections.find(i => i.inspection_type === 'sortie');

  const handleDownloadPdf = async (insp: PropertyInspection) => {
    setDownloadingId(insp.id);
    try {
      const pdfDoc = generateInspectionReportPDF({
        inspectionType: insp.inspection_type,
        inspectionDate: insp.inspection_date,
        contractNumber,
        ownerName,
        ownerSignatureImage: insp.owner_signature_svg,
        ownerConfirmedAt: insp.owner_confirmed_at,
        tenantName,
        tenantSignatureImage: insp.tenant_signature_svg,
        tenantConfirmedAt: insp.tenant_confirmed_at,
        propertyName,
        propertyAddress,
        waterMeterReading: insp.water_meter_reading,
        electricMeterReading: insp.electric_meter_reading,
        keysHandedCount: insp.keys_handed_count || 1,
        keysDescription: insp.keys_description,
        generalObservations: insp.general_observations,
        tenantReserves: insp.tenant_reserves,
        items: (insp.items || []).map(it => ({
          roomName: it.room_name,
          elementName: it.element_name,
          conditionState: it.condition_state,
          comment: it.comment,
          photoCount: it.photo_paths ? it.photo_paths.length : 0,
        })),
        documentHash: insp.document_hash,
      });

      pdfDoc.save(`Etat_des_lieux_${insp.inspection_type}_${propertyName.replace(/\s+/g, '_')}.pdf`);
      showToast('Téléchargement du rapport lancé !', 'success');
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la génération du rapport d'état des lieux", 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmSignature = async (sigData: {
    signatureSvg: string;
    signerName: string;
  }) => {
    if (!selectedInspectionForSign) return;
    setSigning(true);
    try {
      await confirmInspection(
        selectedInspectionForSign.id,
        isOwner ? 'owner' : 'tenant',
        sigData.signatureSvg,
        !isOwner ? reserves : undefined
      );
      showToast('État des lieux confirmé contradictoirement !', 'success');
      setSelectedInspectionForSign(null);
      setReserves('');
      onRefresh();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erreur lors de la confirmation', 'error');
    } finally {
      setSigning(false);
    }
  };

  const renderInspectionItem = (insp: PropertyInspection, typeLabel: string) => {
    const hasUserConfirmed = isOwner ? insp.owner_confirmed_at : insp.tenant_confirmed_at;
    const isBothConfirmed = insp.owner_confirmed_at && insp.tenant_confirmed_at;

    return (
      <div key={insp.id} className="p-4 rounded-2xl bg-[var(--imx-surface-2)] border border-[rgba(255,255,255,0.06)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-violet" />
            <h4 className="font-nunito font-800 text-sm text-[var(--imx-text-primary)]">
              {typeLabel}
            </h4>
          </div>
          {isBothConfirmed ? (
            <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 size={11} /> Validé contradictoirement ✓
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <Clock size={11} /> En cours de validation
            </span>
          )}
        </div>

        {/* Détails sommaires */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
          <div>
            <span>Date : </span>
            <span className="font-bold text-[var(--imx-text-primary)]">
              {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(insp.inspection_date))}
            </span>
          </div>
          <div>
            <span>Clés remises : </span>
            <span className="font-bold text-[var(--imx-text-primary)]">{insp.keys_handed_count}</span>
          </div>
          <div>
            <span>Compteur Eau (SONEB) : </span>
            <span className="font-bold text-[var(--imx-text-primary)]">{insp.water_meter_reading || 'Non relevé'}</span>
          </div>
          <div>
            <span>Compteur Élec (SBEÉ) : </span>
            <span className="font-bold text-[var(--imx-text-primary)]">{insp.electric_meter_reading || 'Non relevé'}</span>
          </div>
        </div>

        {/* Réserves éventuelles */}
        {insp.tenant_reserves && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            <span className="font-bold block text-[10px] text-red-400 uppercase tracking-wide">
              Réserves émises par le locataire :
            </span>
            {insp.tenant_reserves}
          </div>
        )}

        {/* Boutons d'action pour cet état des lieux */}
        <div className="flex items-center gap-2 pt-1">
          {!hasUserConfirmed && (
            <button
              onClick={() => setSelectedInspectionForSign(insp)}
              className="flex-1 py-2 px-3 rounded-xl bg-violet hover:bg-violet-dark text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 size={13} />
              <span>Confirmer mon accord</span>
            </button>
          )}

          <button
            onClick={() => handleDownloadPdf(insp)}
            disabled={downloadingId === insp.id}
            className="flex-1 py-2 px-3 rounded-xl border border-[var(--imx-border)] hover:bg-[var(--imx-surface-3)] text-[var(--imx-text-primary)] text-xs font-semibold transition flex items-center justify-center gap-1.5"
          >
            <Download size={13} />
            <span>{downloadingId === insp.id ? 'Génération...' : 'Télécharger PDF'}</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="card p-5 border border-[var(--imx-border)] bg-[var(--imx-surface-1)] rounded-3xl shadow-sm">
      {/* En-tête de la carte */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
            <ClipboardCheck size={20} />
          </div>
          <div>
            <h3 className="font-nunito font-800 text-base text-[var(--imx-text-primary)]">
              État des lieux avec photos
            </h3>
            <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
              Constat contradictoire d'entrée & de sortie
            </p>
          </div>
        </div>

        {/* Bouton comparaison si les deux existent */}
        {entryInspection && exitInspection && onOpenCompareModal && (
          <button
            onClick={onOpenCompareModal}
            className="p-2 rounded-xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)] text-violet text-xs font-bold hover:bg-violet/10 transition flex items-center gap-1"
            title="Comparer l'entrée et la sortie"
          >
            <Columns size={14} />
            <span className="hidden sm:inline">Comparer</span>
          </button>
        )}
      </div>

      {/* Liste des états des lieux */}
      <div className="space-y-3 mb-4">
        {entryInspection && renderInspectionItem(entryInspection, "État des lieux d'Entrée")}
        {exitInspection && renderInspectionItem(exitInspection, "État des lieux de Sortie")}

        {!entryInspection && !exitInspection && (
          <div className="p-4 rounded-2xl bg-[var(--imx-surface-2)] border border-[rgba(255,255,255,0.06)] text-center">
            <p className="text-xs text-[var(--imx-text-secondary)] mb-1">
              Aucun état des lieux n'a encore été réalisé.
            </p>
            <p className="text-[10px] text-[var(--imx-text-muted)]">
              L'état des lieux d'entrée est indispensable lors de la remise des clés pour sécuriser la restitution de la caution.
            </p>
          </div>
        )}
      </div>

      {/* Bouton de création (Propriétaire) */}
      {isOwner && onOpenCreateModal && (
        <button
          onClick={onOpenCreateModal}
          className="btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          <span>
            {!entryInspection
              ? "Réaliser l'état des lieux d'entrée"
              : !exitInspection
              ? "Réaliser l'état des lieux de sortie"
              : "Nouvel état des lieux"}
          </span>
        </button>
      )}

      {/* Modal de signature et confirmation contradictoire */}
      <SignatureModal
        isOpen={Boolean(selectedInspectionForSign)}
        onClose={() => setSelectedInspectionForSign(null)}
        title="Confirmation de l'état des lieux"
        documentTitle={`État des lieux (${selectedInspectionForSign?.inspection_type === 'entree' ? 'Entrée' : 'Sortie'})`}
        signerName={userName}
        signerRole={isOwner ? 'Propriétaire' : 'Locataire'}
        onConfirm={handleConfirmSignature}
        loading={signing}
      />
    </div>
  );
};
