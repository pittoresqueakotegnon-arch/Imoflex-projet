import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';

const AdminConfig: React.FC = () => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value');

      if (error) throw error;

      const configMap: Record<string, string> = {};
      (data || []).forEach(item => {
        configMap[item.key] = item.value;
      });

      setConfig(configMap);
      setChanges({});
    } catch (error) {
      console.error('Error fetching config:', error);
      showToast('Erreur lors du chargement de la configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

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
          .update({
            value,
            updated_at: new Date().toISOString(),
          })
          .eq('key', key);

        if (error) throw error;
      }

      // Update local config
      setConfig({
        ...config,
        ...changes,
      });
      setChanges({});

      showToast('Configuration sauvegardée', 'success');
    } catch (error) {
      console.error('Error saving config:', error);
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getConfigFields = () => [
    {
      key: 'commission_rate',
      label: 'Taux de commission (%)',
      type: 'number',
      suffix: '%',
    },
    {
      key: 'attribution_fee',
      label: 'Frais d\'attribution (FCFA)',
      type: 'number',
      suffix: 'FCFA',
    },
  ];

  if (loading) {
    return (
      <div className="w-full">
        <div className="px-4 pt-6 space-y-4">
          <div className="h-20 bg-[#261C55] rounded-lg animate-pulse"></div>
          <div className="h-20 bg-[#261C55] rounded-lg animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-nunito font-900 mb-6">Configuration</h1>

        <div className="space-y-4">
          {getConfigFields().map(field => (
            <div key={field.key}>
              <label className="label block mb-2">{field.label}</label>
              <div className="relative">
                <input
                  type={field.type}
                  value={changes[field.key] ?? config[field.key] ?? ''}
                  onChange={e => handleChange(field.key, e.target.value)}
                  className="input-field"
                  placeholder="0"
                />
                {field.suffix && (
                  <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-text-dim text-sm">
                    {field.suffix}
                  </span>
                )}
              </div>
              {config[field.key] && !changes[field.key] && (
                <p className="text-xs text-text-dim mt-1">
                  Valeur actuelle : {config[field.key]}
                </p>
              )}
            </div>
          ))}
        </div>

        {Object.keys(changes).length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full mt-6 disabled:opacity-50"
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        )}
      </div>
    </div>
  );
};

export default AdminConfig;
