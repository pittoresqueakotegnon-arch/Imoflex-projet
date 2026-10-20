import React, { useState, useEffect } from 'react';
import { X, ClipboardCheck, Download, CheckCircle2, Camera, AlertTriangle, Key, Droplet, Zap, Maximize2 } from 'lucide-react';
import { PropertyInspection } from '../lib/supabase';
import { getSecureDocumentUrl } from '../lib/leaseDocumentsService';
import { generateInspectionReportPDF } from '../lib/inspectionPdf';
import { useToast } from './Toast';

interface InspectionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  inspection: PropertyInspection | null;
  userRole: 'proprietaire' | 'locataire';
  userName: string;
  propertyName: string;
  propertyAddress: string;
  ownerName: string;
  tenantName: string;
  contractNumber?: string;
  onOpenSignModal?: () => void;
}

const CONDITION_BADGES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  neuf: { label: 'Neuf', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  bon: { label: 'Bon état', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  moyen: { label: 'État d’usage', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  mauvais: { label: 'Mauvais état', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  degrade: { label: 'Dégradé / Cassé', bg: 'bg-red-600/20', text: 'text-red-500', border: 'border-red-600/40' },
};

export const InspectionDetailModal: React.FC<InspectionDetailModalProps> = ({
  isOpen,
  onClose,
  inspection,
  userRole,
  propertyName,
  propertyAddress,
  ownerName,
  tenantName,
  contractNumber,
  onOpenSignModal,
}) => {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [photoUrlMap, setPhotoUrlMap] = useState<Record<string, string>>({});

  const isOwner = userRole === 'proprietaire';
  const hasUserConfirmed = isOwner ? inspection?.owner_confirmed_at : inspection?.tenant_confirmed_at;

  // Résolution asynchrone des photos privées
  useEffect(() => {
    if (!inspection?.items || !isOpen) return;

    let cancelled = false;
    const allPaths: string[] = [];
    inspection.items.forEach(it => {
      if (Array.isArray(it.photo_paths)) {
        allPaths.push(...it.photo_paths);
      }
    });

    if (allPaths.length === 0) return;

    const resolvePhotos = async () => {
      const map: Record<string, string> = {};
      await Promise.all(
        allPaths.map(async path => {
          if (!path) return;
          if (path.startsWith('http') || path.startsWith('blob:')) {
            map[path] = path;
          } else {
            const url = await getSecureDocumentUrl(path, 3600);
            if (url) map[path] = url;
          }
        })
      );
      if (!cancelled) {
        setPhotoUrlMap(map);
      }
    };

    resolvePhotos();

    return () => {
      cancelled = true;
    };
  }, [inspection, isOpen]);

  if (!isOpen || !inspection) return null;

  const isEntree = inspection.inspection_type === 'entree';
  const typeLabel = isEntree ? "État des lieux d'Entrée" : "État des lieux de Sortie";

  const handleDownload = () => {
    setDownloading(true);
    try {
      const pdfDoc = generateInspectionReportPDF({
        inspectionType: inspection.inspection_type,
        inspectionDate: inspection.inspection_date,
        contractNumber,
        ownerName,
        ownerSignatureImage: inspection.owner_signature_svg,
        ownerConfirmedAt: inspection.owner_confirmed_at,
        tenantName,
        tenantSignatureImage: inspection.tenant_signature_svg,
        tenantConfirmedAt: inspection.tenant_confirmed_at,
        propertyName,
        propertyAddress,
        waterMeterReading: inspection.water_meter_reading,
        electricMeterReading: inspection.electric_meter_reading,
        keysHandedCount: inspection.keys_handed_count || 1,
        keysDescription: inspection.keys_description,
        generalObservations: inspection.general_observations,
        tenantReserves: inspection.tenant_reserves,
        items: (inspection.items || []).map(it => ({
          roomName: it.room_name,
          elementName: it.element_name,
          conditionState: it.condition_state,
          comment: it.comment,
          photoCount: it.photo_paths ? it.photo_paths.length : 0,
        })),
        documentHash: inspection.document_hash,
      });

      pdfDoc.save(`Etat_des_lieux_${inspection.inspection_type}_${propertyName.replace(/\s+/g, '_')}.pdf`);
      showToast('Téléchargement du rapport lancé !', 'success');
    } catch (err) {
      console.error(err);
      showToast("Erreur lors de la génération de l'état des lieux", 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--imx-border)] flex items-center justify-between bg-[var(--imx-surface-2)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-nunito font-900 text-base text-[var(--imx-text-primary)]">
                  {typeLabel}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet/10 text-violet border border-violet/20 font-space-grotesk">
                  {new Date(inspection.inspection_date).toLocaleDateString('fr-FR')}
                </span>
              </div>
              <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
                {propertyName} • Constat contradictoire
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

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Status confirmations */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-2xl border ${inspection.owner_confirmed_at ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[var(--imx-surface-2)] border-[var(--imx-border)] text-[var(--imx-text-muted)]'}`}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={14} className={inspection.owner_confirmed_at ? 'text-emerald-400' : 'text-gray-400 opacity-40'} />
                <span className="font-bold text-[var(--imx-text-primary)]">Bailleur</span>
              </div>
              <p className="text-[11px] text-[var(--imx-text-secondary)] truncate">{ownerName}</p>
              <p className="text-[10px] mt-1 font-space-grotesk">
                {inspection.owner_confirmed_at ? `Confirmé le ${new Date(inspection.owner_confirmed_at).toLocaleDateString('fr-FR')}` : 'En attente de validation'}
              </p>
            </div>

            <div className={`p-3 rounded-2xl border ${inspection.tenant_confirmed_at ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-[var(--imx-surface-2)] border-[var(--imx-border)] text-[var(--imx-text-muted)]'}`}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 size={14} className={inspection.tenant_confirmed_at ? 'text-emerald-400' : 'text-gray-400 opacity-40'} />
                <span className="font-bold text-[var(--imx-text-primary)]">Locataire</span>
              </div>
              <p className="text-[11px] text-[var(--imx-text-secondary)] truncate">{tenantName}</p>
              <p className="text-[10px] mt-1 font-space-grotesk">
                {inspection.tenant_confirmed_at ? `Confirmé le ${new Date(inspection.tenant_confirmed_at).toLocaleDateString('fr-FR')}` : 'En attente de validation'}
              </p>
            </div>
          </div>

          {/* Relevés compteurs & clés */}
          <div className="p-4 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
            <h4 className="font-bold text-xs text-[var(--imx-text-primary)] uppercase tracking-wide mb-3 flex items-center gap-1.5 font-space-grotesk">
              Relevés de compteurs & Remise des clés
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)]">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Droplet size={16} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-[var(--imx-text-muted)] block">EAU (SONEB)</span>
                  <span className="font-bold text-[var(--imx-text-primary)] truncate block">{inspection.water_meter_reading || 'Non relevé'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)]">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center flex-shrink-0">
                  <Zap size={16} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-[var(--imx-text-muted)] block">ÉLEC (SBEÉ)</span>
                  <span className="font-bold text-[var(--imx-text-primary)] truncate block">{inspection.electric_meter_reading || 'Non relevé'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)]">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <Key size={16} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-[var(--imx-text-muted)] block">CLÉS REMISES</span>
                  <span className="font-bold text-[var(--imx-text-primary)] truncate block">
                    {inspection.keys_handed_count} clé(s) {inspection.keys_description ? `• ${inspection.keys_description}` : ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Réserves éventuelles */}
          {inspection.tenant_reserves && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-red-400 flex-shrink-0" />
                <span className="font-bold text-[11px] uppercase tracking-wide text-red-400 font-space-grotesk">
                  Réserves émises par le locataire
                </span>
              </div>
              <p className="text-xs pl-6 text-red-200 leading-relaxed">{inspection.tenant_reserves}</p>
            </div>
          )}

          {/* Constat détaillé pièce par pièce */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs text-[var(--imx-text-primary)] uppercase tracking-wide font-space-grotesk">
                Constats par pièce ({inspection.items?.length || 0})
              </h4>
              <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk">
                Cliquez sur une photo pour l'agrandir
              </span>
            </div>

            {(!inspection.items || inspection.items.length === 0) ? (
              <div className="p-4 rounded-2xl bg-[var(--imx-surface-2)] text-center text-gray-400">
                Aucun élément détaillé n'a été enregistré pour cet état des lieux.
              </div>
            ) : (
              inspection.items.map((item, idx) => {
                const badge = CONDITION_BADGES[item.condition_state] || CONDITION_BADGES.bon;
                const photos = Array.isArray(item.photo_paths) ? item.photo_paths : [];

                return (
                  <div
                    key={item.id || idx}
                    className="p-3.5 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[13px] text-[var(--imx-text-primary)]">
                            {item.room_name}
                          </span>
                          <span className="text-[11px] text-[var(--imx-text-secondary)]">
                            • {item.element_name}
                          </span>
                        </div>
                        {item.comment && (
                          <p className="text-[12px] text-[var(--imx-text-secondary)] mt-0.5 italic">
                            « {item.comment} »
                          </p>
                        )}
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border} flex-shrink-0`}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Galerie photo pour cet élément */}
                    {photos.length > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-[var(--imx-text-muted)] font-space-grotesk">
                          <Camera size={12} />
                          <span>{photos.length} photo(s) horodatée(s)</span>
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                          {photos.map((pPath, pIdx) => {
                            const resolvedUrl = photoUrlMap[pPath] || pPath;
                            return (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => setActivePhoto(resolvedUrl)}
                                className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 group focus:outline-none"
                              >
                                <img
                                  src={resolvedUrl}
                                  alt={`${item.room_name} ${pIdx + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  onError={(e) => {
                                    // Fallback placeholder si non accessible
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <Maximize2 size={14} className="text-white" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Observations générales */}
          {inspection.general_observations && (
            <div className="p-3.5 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
              <span className="font-bold text-[11px] uppercase tracking-wide text-[var(--imx-text-muted)] block mb-1 font-space-grotesk">
                Observations générales
              </span>
              <p className="text-[12px] text-[var(--imx-text-primary)] leading-relaxed">
                {inspection.general_observations}
              </p>
            </div>
          )}
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
              <span>{downloading ? 'Génération...' : 'Télécharger le rapport PDF'}</span>
            </button>

            {!hasUserConfirmed && onOpenSignModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSignModal();
                }}
                className="py-2.5 px-4 rounded-xl bg-violet hover:bg-violet-dark text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                <span>Confirmer mon accord</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox photo plein écran */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setActivePhoto(null)}
        >
          <button
            onClick={() => setActivePhoto(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X size={24} />
          </button>
          <img
            src={activePhoto}
            alt="Plein écran"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};
