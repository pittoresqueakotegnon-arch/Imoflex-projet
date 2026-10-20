import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Camera, Check, AlertCircle, Save, RotateCcw, CheckCircle2, Droplet, Zap, Key } from 'lucide-react';
import { createInspection, addInspectionItem, uploadInspectionPhoto } from '../lib/leaseDocumentsService';
import { useToast } from './Toast';

interface CreateInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  leaseId: string;
  userId: string;
  existingEntry: boolean;
  onSuccess: () => void;
}

interface ItemDraft {
  roomName: string;
  elementName: string;
  conditionState: 'neuf' | 'bon' | 'moyen' | 'mauvais' | 'degrade';
  comment: string;
  photoFiles: File[];
  photoPreviews: string[];
}

const DEFAULT_ROOMS = [
  'Salon / Séjour',
  'Chambre principale',
  'Chambre 2',
  'Cuisine',
  'Salle de bain',
  'Toilettes / WC',
  'Balcon / Terrasse',
  'Extérieur / Cour',
  'Couloir / Entrée',
];

const DEFAULT_ELEMENTS = [
  'Murs & Peinture',
  'Sol / Carrelage',
  'Plafond',
  'Portes & Serrures',
  'Fenêtres & Vitres',
  'Plomberie & Robinetterie',
  'Prises & Éclairage',
  'Sanitaires & Douche',
  'Mobilier / Placards',
  'Climatisation / Brasseur',
];

export const CreateInspectionModal: React.FC<CreateInspectionModalProps> = ({
  isOpen,
  onClose,
  leaseId,
  userId,
  existingEntry,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inspectionType, setInspectionType] = useState<'entree' | 'sortie'>(existingEntry ? 'sortie' : 'entree');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [waterMeter, setWaterMeter] = useState('');
  const [electricMeter, setElectricMeter] = useState('');
  const [keysCount, setKeysCount] = useState('2');
  const [keysDesc, setKeysDesc] = useState('');
  const [generalObs, setGeneralObs] = useState('');

  // Brouillon détecté
  const [hasStoredDraft, setHasStoredDraft] = useState(false);

  // Liste des constats par pièce
  const [items, setItems] = useState<ItemDraft[]>([
    {
      roomName: 'Salon / Séjour',
      elementName: 'Murs & Peinture',
      conditionState: 'bon',
      comment: '',
      photoFiles: [],
      photoPreviews: [],
    },
    {
      roomName: 'Chambre principale',
      elementName: 'Murs & Peinture',
      conditionState: 'bon',
      comment: '',
      photoFiles: [],
      photoPreviews: [],
    },
    {
      roomName: 'Cuisine',
      elementName: 'Plomberie & Robinetterie',
      conditionState: 'bon',
      comment: '',
      photoFiles: [],
      photoPreviews: [],
    },
    {
      roomName: 'Salle de bain',
      elementName: 'Sanitaires & Douche',
      conditionState: 'bon',
      comment: '',
      photoFiles: [],
      photoPreviews: [],
    },
  ]);

  const draftKey = `imx_inspection_draft_${leaseId}`;

  // Détection du brouillon à l'ouverture
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        setHasStoredDraft(true);
      }
    } catch (e) {
      console.warn('Erreur lecture brouillon:', e);
    }
  }, [isOpen, draftKey]);

  // Sauvegarde manuelle ou automatique
  const saveDraft = (explicit = true) => {
    try {
      const draftData = {
        inspectionType,
        inspectionDate,
        waterMeter,
        electricMeter,
        keysCount,
        keysDesc,
        generalObs,
        items: items.map(it => ({
          roomName: it.roomName,
          elementName: it.elementName,
          conditionState: it.conditionState,
          comment: it.comment,
        })),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draftData));
      if (explicit) {
        showToast('Brouillon sauvegardé avec succès !', 'success');
      }
    } catch (e) {
      console.warn('Impossible de sauvegarder le brouillon:', e);
    }
  };

  // Restaurer le brouillon
  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      if (parsed.inspectionType) setInspectionType(parsed.inspectionType);
      if (parsed.inspectionDate) setInspectionDate(parsed.inspectionDate);
      if (parsed.waterMeter) setWaterMeter(parsed.waterMeter);
      if (parsed.electricMeter) setElectricMeter(parsed.electricMeter);
      if (parsed.keysCount) setKeysCount(parsed.keysCount);
      if (parsed.keysDesc) setKeysDesc(parsed.keysDesc);
      if (parsed.generalObs) setGeneralObs(parsed.generalObs);

      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        setItems(
          parsed.items.map((it: any) => ({
            roomName: it.roomName || 'Salon / Séjour',
            elementName: it.elementName || 'Murs & Peinture',
            conditionState: it.conditionState || 'bon',
            comment: it.comment || '',
            photoFiles: [],
            photoPreviews: [],
          }))
        );
      }
      setHasStoredDraft(false);
      showToast('Brouillon restauré !', 'success');
    } catch (e) {
      console.error('Erreur restauration brouillon:', e);
    }
  };

  const clearDraft = () => {
    localStorage.removeItem(draftKey);
    setHasStoredDraft(false);
    showToast('Brouillon supprimé', 'info');
  };

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        roomName: 'Salon / Séjour',
        elementName: 'Sol / Carrelage',
        conditionState: 'bon',
        comment: '',
        photoFiles: [],
        photoPreviews: [],
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ItemDraft, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  const handlePhotoUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    const newPreviews = newFiles.map(f => URL.createObjectURL(f));

    const updated = [...items];
    updated[index].photoFiles = [...updated[index].photoFiles, ...newFiles];
    updated[index].photoPreviews = [...updated[index].photoPreviews, ...newPreviews];
    setItems(updated);
  };

  const handleRemovePhoto = (itemIndex: number, photoIndex: number) => {
    const updated = [...items];
    updated[itemIndex].photoFiles = updated[itemIndex].photoFiles.filter((_, i) => i !== photoIndex);
    updated[itemIndex].photoPreviews = updated[itemIndex].photoPreviews.filter((_, i) => i !== photoIndex);
    setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. Créer l'état des lieux
      const insp = await createInspection(
        leaseId,
        inspectionType,
        userId,
        waterMeter.trim(),
        electricMeter.trim(),
        parseInt(keysCount, 10) || 1,
        keysDesc.trim(),
        generalObs.trim()
      );

      if (!insp) throw new Error("Échec de création de l'état des lieux");

      // 2. Pour chaque item, uploader les photos et enregistrer l'item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const uploadedPaths: string[] = [];

        for (const file of item.photoFiles) {
          const path = await uploadInspectionPhoto(leaseId, insp.id, file);
          if (path) uploadedPaths.push(path);
        }

        await addInspectionItem(
          insp.id,
          item.roomName,
          item.elementName,
          item.conditionState,
          item.comment,
          uploadedPaths
        );
      }

      // Nettoyer le brouillon une fois validé
      localStorage.removeItem(draftKey);

      showToast("État des lieux enregistré avec succès !", 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erreur lors de l'enregistrement de l'état des lieux");
    } finally {
      setLoading(false);
    }
  };

  const totalPhotosCount = items.reduce((sum, it) => sum + it.photoFiles.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--imx-border)] flex items-center justify-between bg-[var(--imx-surface-2)]">
          <div>
            <h3 className="font-nunito font-900 text-base text-[var(--imx-text-primary)] leading-tight">
              Réaliser un état des lieux contradictoire
            </h3>
            <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk mt-0.5">
              Conforme loi béninoise n° 2022-30 • Pièces, éléments, compteurs & photos
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-full hover:bg-[var(--imx-surface-3)] text-[var(--imx-text-muted)] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulaire scrollable */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Bannière de reprise de brouillon */}
          {hasStoredDraft && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <RotateCcw size={16} className="text-amber-400 flex-shrink-0" />
                <span>Un brouillon non finalisé a été retrouvé pour cette location.</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-bold text-[11px] hover:bg-amber-400 transition"
                >
                  Restaurer
                </button>
                <button
                  type="button"
                  onClick={clearDraft}
                  className="p-1 text-amber-400/70 hover:text-amber-300 transition"
                  title="Ignorer et supprimer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Type et Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1 text-xs">TYPE D'ÉTAT DES LIEUX</label>
              <select
                value={inspectionType}
                onChange={(e) => setInspectionType(e.target.value as any)}
                className="input-field text-xs font-bold"
              >
                <option value="entree">État des lieux d'Entrée</option>
                <option value="sortie">État des lieux de Sortie</option>
              </select>
            </div>
            <div>
              <label className="label block mb-1 text-xs">DATE DU CONSTAT</label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="input-field text-xs"
                required
              />
            </div>
          </div>

          {/* Compteurs & Clés */}
          <div className="p-4 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)] space-y-3">
            <h4 className="font-bold text-xs text-[var(--imx-text-primary)] uppercase tracking-wide flex items-center gap-1.5 font-space-grotesk">
              <span>Compteurs & Clés remises</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1 text-[11px] flex items-center gap-1">
                  <Droplet size={11} className="text-blue-400" />
                  <span>INDEX EAU (SONEB)</span>
                </label>
                <input
                  type="text"
                  value={waterMeter}
                  onChange={(e) => setWaterMeter(e.target.value)}
                  className="input-field text-xs"
                  placeholder="Ex: 01452 m³"
                />
              </div>
              <div>
                <label className="label block mb-1 text-[11px] flex items-center gap-1">
                  <Zap size={11} className="text-amber-400" />
                  <span>INDEX ÉLEC (SBEÉ)</span>
                </label>
                <input
                  type="text"
                  value={electricMeter}
                  onChange={(e) => setElectricMeter(e.target.value)}
                  className="input-field text-xs"
                  placeholder="Ex: 2341 kWh"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label block mb-1 text-[11px] flex items-center gap-1">
                  <Key size={11} className="text-emerald-400" />
                  <span>NOMBRE DE CLÉS</span>
                </label>
                <input
                  type="number"
                  value={keysCount}
                  onChange={(e) => setKeysCount(e.target.value)}
                  className="input-field text-xs"
                  min="0"
                />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1 text-[11px]">DESCRIPTION DES CLÉS REMISES</label>
                <input
                  type="text"
                  value={keysDesc}
                  onChange={(e) => setKeysDesc(e.target.value)}
                  className="input-field text-xs"
                  placeholder="Ex: 2 clés portail, 2 clés porte principale..."
                />
              </div>
            </div>
          </div>

          {/* Constat par pièce & photos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="label text-xs block">
                  CONSTATS PAR PIÈCE ({items.length}) • {totalPhotosCount} photo(s)
                </label>
                <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk">
                  Photographiez chaque défaut ou dégradation
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-violet hover:text-violet-light font-bold flex items-center gap-1 px-3 py-1.5 rounded-xl bg-violet/10 transition"
              >
                <Plus size={14} />
                <span>Ajouter un élément</span>
              </button>
            </div>

            {items.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)] space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-violet font-space-grotesk flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span>Constat #{idx + 1}</span>
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1 text-red-400 hover:text-red-300 transition"
                      title="Supprimer cet élément"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1 text-[10px]">PIÈCE / ZONE</label>
                    <select
                      value={item.roomName}
                      onChange={(e) => handleItemChange(idx, 'roomName', e.target.value)}
                      className="input-field text-xs"
                    >
                      {DEFAULT_ROOMS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1 text-[10px]">ÉLÉMENT EXAMINÉ</label>
                    <select
                      value={item.elementName}
                      onChange={(e) => handleItemChange(idx, 'elementName', e.target.value)}
                      className="input-field text-xs"
                    >
                      {DEFAULT_ELEMENTS.map(el => (
                        <option key={el} value={el}>{el}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1 text-[10px]">ÉTAT CONSTATÉ</label>
                    <select
                      value={item.conditionState}
                      onChange={(e) => handleItemChange(idx, 'conditionState', e.target.value as any)}
                      className="input-field text-xs font-bold"
                    >
                      <option value="neuf">Neuf</option>
                      <option value="bon">Bon état</option>
                      <option value="moyen">État d'usage (moyen)</option>
                      <option value="mauvais">Mauvais état</option>
                      <option value="degrade">Dégradé / Cassé</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1 text-[10px]">OBSERVATIONS & DÉFAUTS</label>
                    <input
                      type="text"
                      value={item.comment}
                      onChange={(e) => handleItemChange(idx, 'comment', e.target.value)}
                      className="input-field text-xs"
                      placeholder="Ex: Éclat sur plinthe, robinet neuf..."
                    />
                  </div>
                </div>

                {/* Upload photos pour cet élément */}
                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-2">
                    <label
                      htmlFor={`photo-upload-${idx}`}
                      className="px-3 py-1.5 rounded-xl bg-violet/15 hover:bg-violet/25 text-violet text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition shadow-sm"
                    >
                      <Camera size={13} />
                      <span>Ajouter des photos ({item.photoFiles.length})</span>
                    </label>
                    <input
                      id={`photo-upload-${idx}`}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(idx, e)}
                    />
                  </div>

                  {item.photoPreviews.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {item.photoPreviews.map((prev, pIdx) => (
                        <div key={pIdx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 group">
                          <img src={prev} alt="" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(idx, pIdx)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-90 hover:opacity-100 transition"
                            title="Supprimer la photo"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Observations générales */}
          <div>
            <label className="label block mb-1 text-xs">OBSERVATIONS GÉNÉRALES (OPTIONNEL)</label>
            <textarea
              value={generalObs}
              onChange={(e) => setGeneralObs(e.target.value)}
              className="input-field text-xs h-16 resize-none"
              placeholder="Ex: Logement entièrement nettoyé, tous les équipements en état de marche..."
            />
          </div>

          {/* Boutons d'action */}
          <div className="pt-3 border-t border-[var(--imx-border)] flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => saveDraft(true)}
              className="py-3 px-3.5 rounded-xl border border-[var(--imx-border)] text-[var(--imx-text-secondary)] text-xs font-semibold hover:bg-[var(--imx-surface-2)] transition flex items-center gap-1.5"
              title="Sauvegarder le brouillon dans ce navigateur"
            >
              <Save size={14} />
              <span>Enregistrer brouillon</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-3 px-4 rounded-xl border border-[var(--imx-border)] text-[var(--imx-text-secondary)] text-xs font-semibold hover:bg-[var(--imx-surface-2)] transition"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 rounded-xl bg-violet text-white text-xs font-bold shadow-lg hover:bg-violet-dark transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>Valider et enregistrer l'état des lieux</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
