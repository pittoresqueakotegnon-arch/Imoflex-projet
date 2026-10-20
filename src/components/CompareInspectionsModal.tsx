import React from 'react';
import { X, Columns, AlertTriangle, CheckCircle2, Droplet, Zap, Key } from 'lucide-react';
import { PropertyInspection } from '../lib/supabase';

interface CompareInspectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  entryInspection?: PropertyInspection;
  exitInspection?: PropertyInspection;
}

const CONDITION_COLORS: Record<string, string> = {
  neuf: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  bon: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  moyen: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  mauvais: 'text-red-400 bg-red-500/10 border-red-500/20',
  degrade: 'text-red-500 bg-red-500/20 border-red-500/40',
};

const CONDITION_LABELS: Record<string, string> = {
  neuf: 'Neuf',
  bon: 'Bon état',
  moyen: 'Usage (moyen)',
  mauvais: 'Mauvais état',
  degrade: 'Dégradé',
};

export const CompareInspectionsModal: React.FC<CompareInspectionsModalProps> = ({
  isOpen,
  onClose,
  entryInspection,
  exitInspection,
}) => {
  if (!isOpen || !entryInspection || !exitInspection) return null;

  // Rassembler tous les éléments distincts par clé "room_name ::: element_name"
  const entryItems = entryInspection.items || [];
  const exitItems = exitInspection.items || [];

  const allKeys = Array.from(
    new Set([
      ...entryItems.map(i => `${i.room_name}:::${i.element_name}`),
      ...exitItems.map(i => `${i.room_name}:::${i.element_name}`),
    ])
  );

  // Compter le nombre de dégradations
  let degradationCount = 0;
  allKeys.forEach(key => {
    const [room, elem] = key.split(':::');
    const inEntry = entryItems.find(i => i.room_name === room && i.element_name === elem);
    const inExit = exitItems.find(i => i.room_name === room && i.element_name === elem);
    const stateEntry = inEntry?.condition_state || 'bon';
    const stateExit = inExit?.condition_state || 'bon';
    if (
      (stateEntry === 'neuf' || stateEntry === 'bon') &&
      (stateExit === 'mauvais' || stateExit === 'degrade')
    ) {
      degradationCount++;
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="px-5 py-4 border-b border-[var(--imx-border)] flex items-center justify-between bg-[var(--imx-surface-2)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet/10 text-violet flex items-center justify-center">
              <Columns size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-nunito font-900 text-base text-[var(--imx-text-primary)] leading-tight">
                  Comparatif officiel Entrée vs Sortie
                </h3>
                {degradationCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1 font-space-grotesk">
                    <AlertTriangle size={11} /> {degradationCount} anomalie(s)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-space-grotesk">
                    <CheckCircle2 size={11} /> Conforme
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk mt-0.5">
                Vérification contradictoire pour le décompte légal de la caution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--imx-surface-3)] text-[var(--imx-text-muted)] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corps comparatif */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Relevé compteurs comparé */}
          <div className="p-4 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
            <h4 className="font-bold text-xs text-[var(--imx-text-primary)] uppercase tracking-wide mb-3 font-space-grotesk">
              Index des compteurs & Remise des clés
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)] space-y-2">
                <span className="font-bold text-violet block text-xs font-space-grotesk">
                  À L'ENTRÉE ({new Date(entryInspection.inspection_date).toLocaleDateString('fr-FR')})
                </span>
                <div className="space-y-1 text-[var(--imx-text-secondary)]">
                  <p className="flex items-center gap-1.5"><Droplet size={13} className="text-blue-400" /> Eau SONEB : <strong>{entryInspection.water_meter_reading || 'N/A'}</strong></p>
                  <p className="flex items-center gap-1.5"><Zap size={13} className="text-amber-400" /> Élec SBEÉ : <strong>{entryInspection.electric_meter_reading || 'N/A'}</strong></p>
                  <p className="flex items-center gap-1.5"><Key size={13} className="text-emerald-400" /> Clés remises : <strong>{entryInspection.keys_handed_count} clé(s)</strong></p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)] space-y-2">
                <span className="font-bold text-purple-400 block text-xs font-space-grotesk">
                  À LA SORTIE ({new Date(exitInspection.inspection_date).toLocaleDateString('fr-FR')})
                </span>
                <div className="space-y-1 text-[var(--imx-text-primary)]">
                  <p className="flex items-center gap-1.5"><Droplet size={13} className="text-blue-400" /> Eau SONEB : <strong className="font-bold">{exitInspection.water_meter_reading || 'N/A'}</strong></p>
                  <p className="flex items-center gap-1.5"><Zap size={13} className="text-amber-400" /> Élec SBEÉ : <strong className="font-bold">{exitInspection.electric_meter_reading || 'N/A'}</strong></p>
                  <p className="flex items-center gap-1.5"><Key size={13} className="text-emerald-400" /> Clés restituées : <strong className="font-bold">{exitInspection.keys_handed_count} clé(s)</strong></p>
                </div>
              </div>
            </div>
          </div>

          {/* Tableau comparatif des pièces */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-xs text-[var(--imx-text-primary)] uppercase tracking-wide font-space-grotesk">
              Comparatif par pièce ({allKeys.length} éléments vérifiés)
            </h4>

            {allKeys.map((key, idx) => {
              const [room, elem] = key.split(':::');
              const inEntry = entryItems.find(i => i.room_name === room && i.element_name === elem);
              const inExit = exitItems.find(i => i.room_name === room && i.element_name === elem);

              const stateEntry = inEntry?.condition_state || 'non vérifié';
              const stateExit = inExit?.condition_state || 'non vérifié';

              // Dégradation détectée ?
              const isDegraded =
                (stateEntry === 'neuf' || stateEntry === 'bon') &&
                (stateExit === 'mauvais' || stateExit === 'degrade');

              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl border transition ${
                    isDegraded
                      ? 'bg-red-500/10 border-red-500/35'
                      : 'bg-[var(--imx-surface-2)] border-[var(--imx-border)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-bold text-xs text-[var(--imx-text-primary)]">{room}</span>
                      <span className="text-[11px] text-[var(--imx-text-secondary)] ml-1.5">• {elem}</span>
                    </div>
                    {isDegraded && (
                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold bg-red-500/20 text-red-400 flex items-center gap-1 font-space-grotesk">
                        <AlertTriangle size={11} /> Dégradation constatée
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Entrée */}
                    <div className="p-2 rounded-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)]">
                      <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk block mb-1">À l'entrée :</span>
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${CONDITION_COLORS[stateEntry] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                        {CONDITION_LABELS[stateEntry] || stateEntry}
                      </span>
                      {inEntry?.comment && (
                        <p className="text-[10px] text-[var(--imx-text-secondary)] italic mt-1.5">{inEntry.comment}</p>
                      )}
                    </div>

                    {/* Sortie */}
                    <div className="p-2 rounded-xl bg-[var(--imx-surface-1)] border border-[var(--imx-border)]">
                      <span className="text-[10px] text-[var(--imx-text-muted)] font-space-grotesk block mb-1">À la sortie :</span>
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border ${CONDITION_COLORS[stateExit] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                        {CONDITION_LABELS[stateExit] || stateExit}
                      </span>
                      {inExit?.comment && (
                        <p className="text-[10px] text-[var(--imx-text-primary)] font-medium mt-1.5">{inExit.comment}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pied de page */}
        <div className="p-4 border-t border-[var(--imx-border)] bg-[var(--imx-surface-2)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-xl bg-violet text-white text-xs font-bold shadow-md hover:bg-violet-dark transition"
          >
            Fermer le comparatif
          </button>
        </div>
      </div>
    </div>
  );
};
