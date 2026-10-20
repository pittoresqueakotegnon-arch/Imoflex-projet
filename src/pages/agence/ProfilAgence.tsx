import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Edit3, Save, X, Globe,
  Phone, Mail, MapPin, FileText, ShieldCheck, Briefcase,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import { useToast } from '../../components/Toast';
import type { AgenceProfile } from '../../lib/supabase';

const AgenceProfilAgence: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [agenceData, setAgenceData] = useState<AgenceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nom_agence: '',
    ifu: '',
    rccm: '',
    adresse: '',
    ville: '',
    description: '',
    site_web: '',
    email_contact: '',
    phone_agence: '',
  });

  const fetchProfile = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('agences_profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();
      setAgenceData(data);
      if (data) {
        setForm({
          nom_agence: data.nom_agence || '',
          ifu: data.ifu || '',
          rccm: data.rccm || '',
          adresse: data.adresse || '',
          ville: data.ville || '',
          description: data.description || '',
          site_web: data.site_web || '',
          email_contact: data.email_contact || '',
          phone_agence: data.phone_agence || '',
        });
      } else {
        // Pré-remplir avec le profil utilisateur
        setForm((prev) => ({
          ...prev,
          nom_agence: profile.full_name || '',
          email_contact: profile.email || '',
          phone_agence: profile.phone || '',
        }));
        setEditing(true); // Ouvrir directement en édition si pas encore créé
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleSave = async () => {
    if (!profile?.id) return;
    if (!form.nom_agence.trim()) {
      showToast('Le nom de l\'agence est requis', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: profile.id,
        nom_agence: form.nom_agence.trim(),
        ifu: form.ifu.trim() || null,
        rccm: form.rccm.trim() || null,
        adresse: form.adresse.trim() || null,
        ville: form.ville.trim() || null,
        description: form.description.trim() || null,
        site_web: form.site_web.trim() || null,
        email_contact: form.email_contact.trim() || null,
        phone_agence: form.phone_agence.trim() || null,
      };

      if (agenceData) {
        const { error } = await supabase
          .from('agences_profiles')
          .update(payload)
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agences_profiles')
          .insert(payload);
        if (error) throw error;
      }

      showToast('Profil agence mis à jour', 'success');
      setEditing(false);
      await fetchProfile();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div className="page-container premium-page">
        <div className="px-5 pt-6 space-y-4">
          <div className="w-28 h-7 rounded-lg animate-pulse" style={{ background: 'var(--imx-surface)' }} />
          <div className="h-40 rounded-[24px] animate-pulse" style={{ background: 'var(--imx-surface)' }} />
          <div className="h-60 rounded-[24px] animate-pulse" style={{ background: 'var(--imx-surface)' }} />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container premium-page flex flex-col">
      {/* HEADER */}
      <div className="premium-header px-5 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
          >
            <ArrowLeft size={18} color="var(--imx-text-secondary)" />
          </button>
          <div>
            <h1 className="font-nunito font-black text-[20px]" style={{ color: 'var(--imx-text-primary)' }}>
              Mon agence
            </h1>
            <p className="font-space-grotesk text-[11px]" style={{ color: 'var(--imx-text-muted)' }}>
              Informations légales & contact
            </p>
          </div>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--imx-accent-xlight)', border: '1px solid var(--imx-accent)' }}
          >
            <Edit3 size={16} color="var(--imx-accent)" />
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); fetchProfile(); }}
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
            >
              <X size={16} color="var(--imx-text-secondary)" />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
              style={{ background: 'var(--imx-accent)' }}
            >
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save size={16} />
              }
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-28 space-y-4 pt-2">

        {/* Carte identité agence */}
        <div className="rounded-[22px] p-5" style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0369A1 100%)', boxShadow: '0 8px 24px rgba(14,165,233,0.2)' }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Briefcase size={26} color="white" />
            </div>
            <div>
              <p className="font-nunito font-black text-[18px] text-white leading-tight">
                {agenceData?.nom_agence || profile?.full_name}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                {agenceData?.is_verified ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                    <ShieldCheck size={10} /> Vérifiée
                  </span>
                ) : (
                  <span className="text-[10px] text-white/60 font-space-grotesk">Non vérifiée</span>
                )}
              </div>
            </div>
          </div>
          {agenceData?.description && (
            <p className="font-space-grotesk text-[12px] text-white/80 leading-relaxed">
              {agenceData.description}
            </p>
          )}
        </div>

        {/* Informations légales */}
        <div className="rounded-[22px] p-5 space-y-4" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={15} color="var(--imx-accent)" />
            <h3 className="font-nunito font-black text-[14px]" style={{ color: 'var(--imx-text-primary)' }}>
              Informations légales
            </h3>
          </div>

          {[
            { field: 'nom_agence', label: 'Nom de l\'agence *', placeholder: 'Nom officiel de votre agence' },
            { field: 'ifu', label: 'IFU (Identifiant Fiscal)', placeholder: 'Numéro IFU Bénin' },
            { field: 'rccm', label: 'RCCM', placeholder: 'Registre de commerce' },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className="block font-space-grotesk text-[11px] font-semibold mb-1.5" style={{ color: 'var(--imx-text-muted)' }}>
                {label}
              </label>
              {editing ? (
                <input
                  type="text"
                  value={(form as any)[field]}
                  onChange={(e) => update(field, e.target.value)}
                  placeholder={placeholder}
                  className="input-field w-full text-sm"
                  style={{ height: '44px' }}
                />
              ) : (
                <p className="font-space-grotesk text-[13px]" style={{ color: (agenceData as any)?.[field] ? 'var(--imx-text-primary)' : 'var(--imx-text-muted)' }}>
                  {(agenceData as any)?.[field] || 'Non renseigné'}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Contact & localisation */}
        <div className="rounded-[22px] p-5 space-y-4" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={15} color="var(--imx-accent)" />
            <h3 className="font-nunito font-black text-[14px]" style={{ color: 'var(--imx-text-primary)' }}>
              Contact & Localisation
            </h3>
          </div>

          {[
            { field: 'adresse', label: 'Adresse', placeholder: 'Adresse du siège', icon: MapPin },
            { field: 'ville', label: 'Ville', placeholder: 'Ex : Cotonou', icon: MapPin },
            { field: 'phone_agence', label: 'Téléphone agence', placeholder: '+229 XX XX XX XX', icon: Phone },
            { field: 'email_contact', label: 'Email de contact', placeholder: 'contact@monagence.bj', icon: Mail },
            { field: 'site_web', label: 'Site web', placeholder: 'https://www.monagence.bj', icon: Globe },
          ].map(({ field, label, placeholder, icon: Icon }) => (
            <div key={field}>
              <label className="block font-space-grotesk text-[11px] font-semibold mb-1.5" style={{ color: 'var(--imx-text-muted)' }}>
                {label}
              </label>
              {editing ? (
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--imx-text-muted)' }}>
                    <Icon size={15} />
                  </div>
                  <input
                    type="text"
                    value={(form as any)[field]}
                    onChange={(e) => update(field, e.target.value)}
                    placeholder={placeholder}
                    className="input-field w-full pl-9 text-sm"
                    style={{ height: '44px' }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Icon size={13} color="var(--imx-text-muted)" />
                  <p className="font-space-grotesk text-[13px]" style={{ color: (agenceData as any)?.[field] ? 'var(--imx-text-primary)' : 'var(--imx-text-muted)' }}>
                    {(agenceData as any)?.[field] || 'Non renseigné'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Description */}
        <div className="rounded-[22px] p-5" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={15} color="var(--imx-accent)" />
            <h3 className="font-nunito font-black text-[14px]" style={{ color: 'var(--imx-text-primary)' }}>
              Présentation
            </h3>
          </div>
          {editing ? (
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Décrivez votre agence, vos spécialités, votre zone d'action..."
              rows={4}
              className="input-field w-full text-sm resize-none"
              style={{ fontFamily: 'Space Grotesk' }}
            />
          ) : (
            <p className="font-space-grotesk text-[13px] leading-relaxed" style={{ color: agenceData?.description ? 'var(--imx-text-primary)' : 'var(--imx-text-muted)' }}>
              {agenceData?.description || 'Aucune présentation renseignée.'}
            </p>
          )}
        </div>

        {/* CTA Enregistrer mobile */}
        {editing && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-4 rounded-[18px] font-nunito font-black text-[15px] text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)' }}
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Save size={16} /> Enregistrer</>
            )}
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default AgenceProfilAgence;
