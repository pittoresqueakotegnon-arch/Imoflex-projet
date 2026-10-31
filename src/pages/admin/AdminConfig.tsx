import React, { useState, useEffect, useCallback } from 'react';
import { PenTool, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { SignatureModal } from '../../components/SignatureModal';
import { saveDirectorConfig } from '../../lib/pdfStamp';

const AdminConfig: React.FC = () => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value');

      if (error) throw error;

      const configMap: Record<string, string> = {};
      (data || []).forEach(item => {
        configMap[item.key] = item.value;
      });

      // Valeurs par défaut pour la signature de direction
      if (!configMap.director_name) configMap.director_name = 'Alain TOSSOU';
      if (!configMap.director_title) configMap.director_title = 'Directeur Général & Fondateur';
      if (!configMap.director_signature_enabled) configMap.director_signature_enabled = 'true';

      setConfig(configMap);
      setChanges({});
    } catch (error) {
      console.error('Error fetching config:', error);
      showToast('Erreur lors du chargement de la configuration', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleChange = (key: string, value: string) => {
    setChanges({
      ...changes,
      [key]: value,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(changes)) {
        const { error } = await supabase
          .from('app_config')
          .upsert({
            key,
            value,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });

        if (error) throw error;
      }

      // Synchroniser également avec le module pdfStamp
      const currentName = changes.director_name ?? config.director_name ?? 'Alain TOSSOU';
      const currentTitle = changes.director_title ?? config.director_title ?? 'Directeur Général & Fondateur';
      const currentSig = changes.director_signature_url ?? config.director_signature_url ?? null;
      const currentEnabled = (changes.director_signature_enabled ?? config.director_signature_enabled) !== 'false';

      await saveDirectorConfig({
        name: currentName,
        title: currentTitle,
        signatureUrl: currentSig,
        enabled: currentEnabled,
      });

      // Update local config
      setConfig({
        ...config,
        ...changes,
      });
      setChanges({});

      showToast('Configuration et signatures sauvegardées avec succès', 'success');
    } catch (error) {
      console.error('Error saving config:', error);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDirectorSignature = async (sigData: { signatureSvg: string }) => {
    handleChange('director_signature_url', sigData.signatureSvg);
    setSignatureModalOpen(false);
    showToast('Signature manuscrite capturée. Cliquez sur "Sauvegarder les modifications" pour valider.', 'info');
  };

  const currentDirectorSig = changes.director_signature_url ?? config.director_signature_url ?? '';

  if (loading) {
    return (
      <div className="w-full">
        <div className="px-4 pt-6 space-y-4">
          <div className="h-20 bg-[var(--imx-surface-2)] rounded-lg animate-pulse"></div>
          <div className="h-20 bg-[var(--imx-surface-2)] rounded-lg animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pt-6 pb-12">
      <div className="mb-6">
        <h1 className="text-2xl font-nunito font-900 text-[#17132B]">Configuration & Certifications</h1>
        <p className="text-xs text-gray-500 mt-1">
          Gérez les frais de plateforme ainsi que le visa et la signature officielle de la Direction ImoFlex.
        </p>
      </div>

      <div className="space-y-6">
        {/* Paramètres Financiers */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--imx-border)' }}>
          <h2 className="text-base font-bold text-[#17132B] mb-4" style={{ fontFamily: 'Sora' }}>
            Paramètres financiers
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label block mb-2">Taux de commission (%)</label>
              <div className="relative">
                <input
                  type="number"
                  value={changes.commission_rate ?? config.commission_rate ?? ''}
                  onChange={e => handleChange('commission_rate', e.target.value)}
                  className="input-field"
                  placeholder="6"
                />
                <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-dim text-sm">%</span>
              </div>
            </div>

            <div>
              <label className="label block mb-2">Frais d'attribution (FCFA)</label>
              <div className="relative">
                <input
                  type="number"
                  value={changes.attribution_fee ?? config.attribution_fee ?? ''}
                  onChange={e => handleChange('attribution_fee', e.target.value)}
                  className="input-field"
                  placeholder="3000"
                />
                <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-dim text-sm">FCFA</span>
              </div>
            </div>
          </div>
        </div>

        {/* Visa & Signature du Fondateur / Directeur */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--imx-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={20} className="text-[#7B3FE4]" />
            <h2 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Visa & Signature de la Direction ImoFlex
            </h2>
          </div>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            Configurez le nom, la fonction et la signature électronique du Fondateur ou Directeur général apposés sur les quittances certifiées et documents officiels.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="label block mb-2">Nom complet du Directeur / Fondateur</label>
              <input
                type="text"
                value={changes.director_name ?? config.director_name ?? 'Alain TOSSOU'}
                onChange={e => handleChange('director_name', e.target.value)}
                className="input-field"
                placeholder="Ex : Alain TOSSOU"
              />
            </div>

            <div>
              <label className="label block mb-2">Titre / Qualité légale</label>
              <input
                type="text"
                value={changes.director_title ?? config.director_title ?? 'Directeur Général & Fondateur'}
                onChange={e => handleChange('director_title', e.target.value)}
                className="input-field"
                placeholder="Ex : Fondateur & Directeur Général"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-gray-100 bg-[#FAF9FF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-[#17132B]">Signature manuscrite de la Direction</span>
                {currentDirectorSig && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 size={10} /> Enregistrée
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Apposée à côté du cachet officiel rond ImoFlex sur les documents autorisés.
              </p>

              {currentDirectorSig && (
                <div className="mt-3 p-2 bg-white rounded-lg border border-gray-200 inline-block">
                  <img src={currentDirectorSig} alt="Signature Direction" className="h-12 max-w-[180px] object-contain" />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSignatureModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-95 transition-opacity self-start sm:self-auto flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)' }}
            >
              <PenTool size={13} />
              {currentDirectorSig ? 'Modifier la signature' : 'Tracer la signature'}
            </button>
          </div>

          {/* Activer / Désactiver la signature sur les documents */}
          <div className="mt-4 flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50">
            <div>
              <p className="text-xs font-bold text-[#17132B]">Apposer la signature sur les quittances certifiées</p>
              <p className="text-[11px] text-gray-500">
                Si désactivé, seul le cachet officiel rond ImoFlex sera apposé.
              </p>
            </div>
            <select
              value={changes.director_signature_enabled ?? config.director_signature_enabled ?? 'true'}
              onChange={e => handleChange('director_signature_enabled', e.target.value)}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold outline-none bg-white"
            >
              <option value="true">Activée (Recommandé)</option>
              <option value="false">Désactivée</option>
            </select>
          </div>
        </div>

        {/* Bouton de sauvegarde global */}
        {Object.keys(changes).length > 0 && (
          <div className="sticky bottom-4 z-20 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 rounded-2xl bg-[#7B3FE4] text-white font-nunito font-900 text-sm shadow-xl hover:bg-[#6D28D9] transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? 'Sauvegarde…' : 'Sauvegarder les modifications'}
            </button>
          </div>
        )}
      </div>

      {/* Signature Modal pour le Directeur */}
      {signatureModalOpen && (
        <SignatureModal
          isOpen={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          onConfirm={handleSaveDirectorSignature}
          title="Signature officielle de la Direction ImoFlex"
          subtitle="Cette signature certifiée sera intégrée au visa de plateforme et au cachet officiel ImoFlex."
          signerName={changes.director_name ?? config.director_name ?? 'Alain TOSSOU'}
          signerRole={changes.director_title ?? config.director_title ?? 'Direction Générale ImoFlex'}
        />
      )}
    </div>
  );
};

export default AdminConfig;
