import React, { useState } from 'react';
import { X, Plus, Trash2, Camera, Check, AlertCircle, Info } from 'lucide-react';
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

const DEFAULT_ROOMS = ['Salon / Séjour', 'Chambre principale', 'Cuisine', 'Salle de bain', 'Toilettes', 'Balcon / Terrasse', 'Extérieur / Entrée'];
const DEFAULT_ELEMENTS = ['Murs & Peinture', 'Sol / Carrelage', 'Portes & Serrures', 'Fenêtres', 'Plomberie & Robinetterie', 'Prises & Éclairage', 'Sanitaires'];

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
      elementName: 'Sanitaires',
      conditionState: 'bon',
      comment: '',
      photoFiles: [],
      photoPreviews: [],
    },
  ]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="px-5 py-4 border-b border-[var(--imx-border)] flex items-center justify-between bg-[var(--imx-surface-2)]">
          <div>
            <h3 className="font-nunito font-800 text-base text-[var(--imx-text-primary)] leading-tight">
              Réaliser un état des lieux
            </h3>
            <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk">
              Constat contradictoire avec relevés & photos
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

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type et Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1 text-xs">TYPE D'ÉTAT DES LIEUX</label>
              <select
                value={inspectionType}
                onChange={(e) => setInspectionType(e.target.value as any)}
                className="input-field text-sm font-bold"
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
                className="input-field text-sm"
                required
              />
            </div>
          </div>

          {/* Compteurs & Clés */}
          <div className="p-3.5 rounded-2xl bg-[var(--imx-surface-2)] border border-[rgba(255,255,255,0.06)] space-y-3">
            <h4 className="font-bold text-xs text-[var(--imx-text-primary)] flex items-center gap-1.5">
              <span>Compteurs & Clés remises</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1 text-[11px]">INDEX COMPTEUR EAU (SONEB)</label>
                <input
                  type="text"
                  value={waterMeter}
                  onChange={(e) => setWaterMeter(e.target.value)}
                  className="input-field text-xs"
                  placeholder="Ex: 01452 m³"
                />
              </div>
              <div>
                <label className="label block mb-1 text-[11px]">INDEX COMPTEUR ÉLEC (SBEÉ)</label>
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
                <label className="label block mb-1 text-[11px]">NOMBRE DE CLÉS</label>
                <input
                  type="number"
                  value={keysCount}
                  onChange={(e) => setKeysCount(e.target.value)}
                  className="input-field text-xs"
                  min="0"
                />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1 text-[11px]">DESCRIPTION DES CLÉS</label>
                <input
                  type="text"
                  value={keysDesc}
                  onChange={(e) => setKeysDesc(e.target.value)}
                  className="input-field text-xs"
                  placeholder="Ex: 2 clés portail, 2 clés porte principale"
                />
              </div>
            </div>
          </div>

          {/* Constat par pièce & photos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label text-xs">CONSTATS PAR PIÈCE ({items.length})</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-violet hover:text-violet-light font-bold flex items-center gap-1"
              >
                <Plus size={14} />
                Ajouter un élément
              </button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="p-3.5 rounded-2xl bg-[var(--imx-surface-2)] border border-[rgba(255,255,255,0.06)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-violet font-space-grotesk">
                    Élément #{idx + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1 text-red-400 hover:text-red-300"
                      title="Supprimer cet élément"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1 text-[10px]">PIÈCE</label>
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
                    <label className="label block mb-1 text-[10px]">ÉLÉMENT</label>
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
                    <label className="label block mb-1 text-[10px]">OBSERVATIONS</label>
                    <input
                      type="text"
                      value={item.comment}
                      onChange={(e) => handleItemChange(idx, 'comment', e.target.value)}
                      className="input-field text-xs"
                      placeholder="Ex: Légère rayure sur mur droit"
                    />
                  </div>
                </div>

                {/* Upload photos pour cet élément */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label
                      htmlFor={`photo-upload-${idx}`}
                      className="px-2.5 py-1.5 rounded-xl bg-violet/10 hover:bg-violet/20 text-violet text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition"
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
                        <div key={pIdx} className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
                          <img src={prev} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Remarques générales */}
          <div>
            <label className="label block mb-1 text-xs">OBSERVATIONS GÉNÉRALES (OPTIONNEL)</label>
            <textarea
              value={generalObs}
              onChange={(e) => setGeneralObs(e.target.value)}
              className="input-field text-xs h-16 resize-none"
              placeholder="Ex: Logement propre, remis avec 2 trousseaux complets..."
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
                <span>Enregistrement...</span>
              ) : (
                <>
                  <Check size={16} />
                  <span>Enregistrer l'état des lieux</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
