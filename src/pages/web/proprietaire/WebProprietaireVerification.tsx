import React, { useState } from 'react';
import { ShieldCheck, Upload, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useOwnerVerification } from '../../../hooks/useOwnerVerification';
import { OwnerIdentityDocumentType } from '../../../lib/supabase';
import { OWNER_VERIFICATION_STATUS_META, submitOwnerVerification } from '../../../lib/ownerVerification';
import { useToast } from '../../../components/Toast';

export default function WebProprietaireVerification() {
  const { profile } = useAuth();
  const { verification, loading, refetch } = useOwnerVerification(profile?.role === 'proprietaire');
  const { showToast } = useToast();

  const [legalName, setLegalName] = useState(profile?.full_name || '');
  const [documentType, setDocumentType] = useState<OwnerIdentityDocumentType>('cni');
  const [documentNumber, setDocumentNumber] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const status = verification?.verification_status || 'non_verifie';
  const statusMeta = OWNER_VERIFICATION_STATUS_META[status];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;

    if (!legalName.trim()) {
      showToast('Le nom légal complet est obligatoire.', 'error');
      return;
    }
    if (!documentNumber.trim()) {
      showToast('Le numéro de la pièce est obligatoire.', 'error');
      return;
    }
    if (!front || !back) {
      showToast('Le recto et le verso du document sont requis.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await submitOwnerVerification({
        ownerId: profile.id,
        legalName: legalName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        front,
        back,
      });
      showToast('Votre dossier de vérification a été transmis avec succès.', 'success');
      setFront(null);
      setBack(null);
      await refetch();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de la soumission.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
          Vérification d'Identité Propriétaire
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Obtenez le badge « Propriétaire vérifié » pour certifier votre profil et débloquer les retraits de loyers.
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status Banner */}
          <div
            className="p-6 rounded-2xl border bg-white shadow-sm flex items-start gap-4"
            style={{ borderColor: 'var(--imx-border)' }}
          >
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                status === 'verifie'
                  ? 'bg-emerald-50 text-emerald-600'
                  : status === 'en_attente'
                  ? 'bg-amber-50 text-amber-600'
                  : status === 'refuse'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-purple-50 text-[#7B3FE4]'
              }`}
            >
              {status === 'verifie' ? (
                <CheckCircle2 size={24} />
              ) : status === 'en_attente' ? (
                <Clock size={24} />
              ) : (
                <ShieldCheck size={24} />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                  {statusMeta?.label || 'Non vérifié'}
                </h2>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed max-w-xl">
                {statusMeta?.description || 'La vérification de votre identité est requise avant votre premier retrait.'}
              </p>
              {verification?.rejection_reason && status === 'refuse' && (
                <div className="mt-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs">
                  Motif du rejet : {verification.rejection_reason}
                </div>
              )}
            </div>
          </div>

          {/* Upload Form if not verified */}
          {status !== 'verifie' && (
            <div className="p-6 sm:p-8 rounded-2xl border bg-white shadow-sm" style={{ borderColor: 'var(--imx-border)' }}>
              <h3 className="text-base font-bold text-[#17132B] mb-4" style={{ fontFamily: 'Sora' }}>
                Soumettre un dossier de vérification
              </h3>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Nom et prénoms légaux (tels qu'inscrits sur la pièce) *
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    required
                    placeholder="Ex: KODJO Koffi Jean"
                    className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: 'var(--imx-border)' }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Type de document d'identité *
                    </label>
                    <select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value as OwnerIdentityDocumentType)}
                      className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none bg-white font-medium"
                      style={{ borderColor: 'var(--imx-border)' }}
                    >
                      <option value="cni">Carte nationale d'identité (CNI / CIP)</option>
                      <option value="passeport">Passeport</option>
                      <option value="permis_conduire">Permis de conduire</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Numéro de la pièce officielle *
                    </label>
                    <input
                      type="text"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      required
                      placeholder="Ex: 012345678901"
                      className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ borderColor: 'var(--imx-border)' }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Recto */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Recto de la pièce (JPG, PNG ou PDF, max 10 Mo) *
                    </label>
                    <label className="border-2 border-dashed rounded-2xl p-5 text-center hover:border-[#7B3FE4] transition-all flex flex-col items-center justify-center cursor-pointer bg-gray-50/50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => setFront(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <Upload size={20} className="text-[#7B3FE4] mb-1.5" />
                      <span className="text-xs font-bold text-gray-800 truncate max-w-full">
                        {front ? front.name : 'Sélectionner le recto'}
                      </span>
                    </label>
                  </div>

                  {/* Verso */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Verso / Seconde page *
                    </label>
                    <label className="border-2 border-dashed rounded-2xl p-5 text-center hover:border-[#7B3FE4] transition-all flex flex-col items-center justify-center cursor-pointer bg-gray-50/50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => setBack(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <Upload size={20} className="text-[#7B3FE4] mb-1.5" />
                      <span className="text-xs font-bold text-gray-800 truncate max-w-full">
                        {back ? back.name : 'Sélectionner le verso'}
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting || !front || !back || !documentNumber.trim() || !legalName.trim()}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    {submitting ? 'Transmission en cours…' : 'Soumettre mon dossier'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
