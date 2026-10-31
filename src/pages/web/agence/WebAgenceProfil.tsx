import React, { useState, useEffect, useCallback } from 'react';
import { Save, Camera } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../components/Toast';
import { UserAvatar } from '../../../components/UserAvatar';

export default function WebAgenceProfil() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  const [form, setForm] = useState({
    nom_agence: '',
    ifu: '',
    rccm: '',
    adresse: '',
    ville: 'Cotonou',
    description: '',
    site_web: '',
    email_contact: '',
    phone_agence: '',
    logo_url: '',
  });

  const [uploadingLogo, setUploadingLogo] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('agences_profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();

      if (data) {
        setHasProfile(true);
        setForm({
          nom_agence: data.nom_agence || '',
          ifu: data.ifu || '',
          rccm: data.rccm || '',
          adresse: data.adresse || '',
          ville: data.ville || 'Cotonou',
          description: data.description || '',
          site_web: data.site_web || '',
          email_contact: data.email_contact || '',
          phone_agence: data.phone_agence || '',
          logo_url: data.logo_url || profile.avatar_url || '',
        });
      } else {
        setForm((prev) => ({
          ...prev,
          nom_agence: profile.full_name || '',
          email_contact: profile.email || '',
          phone_agence: profile.phone || '',
          logo_url: profile.avatar_url || '',
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;
    setUploadingLogo(true);
    try {
      const fileName = `${profile.id}/agence_logo_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      setForm((prev) => ({ ...prev, logo_url: publicUrl }));

      // Also persist to users.avatar_url and agences_profiles.logo_url immediately
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', profile.id);
      if (hasProfile) {
        await supabase.from('agences_profiles').update({ logo_url: publicUrl }).eq('id', profile.id);
      }
      showToast('Logo de l\'agence mis à jour', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur upload logo', 'error');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        logo_url: form.logo_url.trim() || null,
      };

      if (hasProfile) {
        const { error } = await supabase
          .from('agences_profiles')
          .update(payload)
          .eq('id', profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agences_profiles')
          .insert([payload]);
        if (error) throw error;
        setHasProfile(true);
      }

      showToast('Profil agence mis à jour avec succès', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
          Profil de l'Agence Immobilière
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Renseignez vos informations légales (IFU, RCCM), vos coordonnées et la présentation de votre agence.
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm space-y-5" style={{ borderColor: 'var(--imx-border)' }}>
            <h2 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Identité de l'agence
            </h2>

            {/* Logo de l'agence */}
            <div className="flex items-center gap-5 p-4 rounded-xl bg-purple-50/50 border border-purple-100/80">
              <div className="relative flex-shrink-0">
                <UserAvatar
                  src={form.logo_url}
                  name={form.nom_agence || 'Agence'}
                  size="lg"
                  shape="rounded"
                  className="w-16 h-16 shadow-xs"
                />
                <label
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--imx-accent)] text-white flex items-center justify-center cursor-pointer shadow-md hover:bg-[#6A35C7] transition-all"
                  title="Modifier le logo"
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                  {uploadingLogo ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera size={12} />
                  )}
                </label>
              </div>
              <div className="space-y-0.5">
                <h3 className="font-bold text-sm text-[#17132B]">Logo officiel de l'agence</h3>
                <p className="text-xs text-gray-500">
                  Affiché sur vos annonces, dans la barre latérale et sur vos fiches de mandats.
                </p>
                <label className="inline-block text-xs font-bold text-[var(--imx-accent)] hover:underline cursor-pointer">
                  {uploadingLogo ? 'Envoi en cours…' : 'Choisir une image'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Nom commercial de l'agence *
              </label>
              <input
                type="text"
                value={form.nom_agence}
                onChange={(e) => setForm({ ...form, nom_agence: e.target.value })}
                required
                placeholder="Ex: ImoPlus Bénin SARL"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none font-bold"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Numéro IFU (Identifiant Fiscal Unique)
                </label>
                <input
                  type="text"
                  value={form.ifu}
                  onChange={(e) => setForm({ ...form, ifu: e.target.value })}
                  placeholder="Ex: 3201910293847"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Numéro RCCM
                </label>
                <input
                  type="text"
                  value={form.rccm}
                  onChange={(e) => setForm({ ...form, rccm: e.target.value })}
                  placeholder="Ex: RB/COT/20 B 12345"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Ville principale
                </label>
                <input
                  type="text"
                  value={form.ville}
                  onChange={(e) => setForm({ ...form, ville: e.target.value })}
                  placeholder="Cotonou"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Adresse physique du siège
                </label>
                <input
                  type="text"
                  value={form.adresse}
                  onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                  placeholder="Ex: Boulevard Saint-Michel, Immeuble Horizon"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Présentation / Biographie de l'agence
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Présentez votre expertise, vos quartiers de prédilection et vos services aux locataires et propriétaires..."
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none resize-none leading-relaxed"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-sm space-y-5" style={{ borderColor: 'var(--imx-border)' }}>
            <h2 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Coordonnées publiques de contact
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Téléphone agence
                </label>
                <input
                  type="tel"
                  value={form.phone_agence}
                  onChange={(e) => setForm({ ...form, phone_agence: e.target.value })}
                  placeholder="+229 01 23 45 67"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  E-mail de contact
                </label>
                <input
                  type="email"
                  value={form.email_contact}
                  onChange={(e) => setForm({ ...form, email_contact: e.target.value })}
                  placeholder="contact@imoplus.bj"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Site web officiel
                </label>
                <input
                  type="url"
                  value={form.site_web}
                  onChange={(e) => setForm({ ...form, site_web: e.target.value })}
                  placeholder="https://imoplus.bj"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white shadow-md hover:opacity-95 disabled:opacity-50"
              style={{ background: 'var(--imx-accent)' }}
            >
              <Save size={16} />
              {saving ? 'Enregistrement…' : 'Enregistrer le profil agence'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
