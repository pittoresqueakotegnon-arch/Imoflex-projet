import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, LogOut, ShieldCheck, Building2, Wallet, Camera, PenTool, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { UserAvatar } from '../../components/UserAvatar';
import { SignatureModal } from '../../components/SignatureModal';
import { getUserSignature, saveUserSignature } from '../../lib/pdfStamp';

export default function WebProfil() {
  const { profile, user, role, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [momoNumber, setMomoNumber] = useState(profile?.mobile_money_number || '');
  const [saving, setSaving] = useState(false);

  // Password change modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Signature officielle
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  useEffect(() => {
    if (user?.id) {
      const sig = getUserSignature(user.id);
      if (sig) setSignature(sig);
    }
  }, [user?.id]);

  const handleSaveSignature = async (sigData: { signatureSvg: string }) => {
    if (!user?.id) return;
    try {
      await saveUserSignature(user.id, sigData.signatureSvg);
      setSignature(sigData.signatureSvg);
      setSignatureModalOpen(false);
      showToast('Votre signature officielle a été enregistrée avec succès !', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de l’enregistrement de la signature', 'error');
    }
  };

  const compressImage = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 500;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error('Erreur compression image'));
            },
            'image/jpeg',
            0.85
          );
        };
        img.onerror = () => reject(new Error('Erreur lecture image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Erreur lecture fichier'));
      reader.readAsDataURL(file);
    });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);
    try {
      const blob = await compressImage(file);
      const fileName = `${profile.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: updateError } = await supabase.from('users')
        .update({ avatar_url: publicUrl }).eq('id', profile.id);
      if (updateError) throw updateError;
      if (role === 'agence') {
        await supabase.from('agences_profiles').update({ logo_url: publicUrl }).eq('id', profile.id);
      }
      await refreshProfile();
      showToast('Photo de profil mise à jour avec succès', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de la mise à jour', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const cleanName = fullName.trim();
      const phoneDigits = phone.replace(/\D/g, '');
      const cleanPhone = phoneDigits ? `+${phoneDigits}` : '';

      if (cleanName.length < 2 || cleanName.length > 150) {
        showToast('Le nom doit contenir entre 2 et 150 caractères', 'error');
        setSaving(false);
        return;
      }

      if (cleanPhone && (phoneDigits.length < 8 || phoneDigits.length > 15)) {
        showToast('Saisissez un numéro de téléphone valide', 'error');
        setSaving(false);
        return;
      }

      // Mise à jour sécurisée via RPC (conforme à la migration 047)
      const { error: rpcError } = await supabase.rpc('update_current_user_contact', {
        p_full_name: cleanName,
        p_phone: cleanPhone || (profile?.phone || ''),
      });

      if (rpcError) {
        // Fallback : si la RPC n'est pas encore déployée, mise à jour directe
        if (rpcError.code === 'PGRST202' || rpcError.message?.includes('Could not find')) {
          const { error: directError } = await supabase
            .from('users')
            .update({ full_name: cleanName, phone: cleanPhone || profile?.phone })
            .eq('id', user.id);
          if (directError) throw new Error(directError.message);
        } else {
          throw new Error(rpcError.message || 'Erreur lors de la mise à jour du profil');
        }
      }

      // Mise à jour du numéro Mobile Money
      const cleanMomo = momoNumber.trim() || null;
      if (cleanMomo !== (profile?.mobile_money_number || null)) {
        const { error: momoError } = await supabase
          .from('users')
          .update({ mobile_money_number: cleanMomo })
          .eq('id', user.id);
        if (momoError) throw momoError;
      }

      await refreshProfile();
      showToast('Profil mis à jour avec succès', 'success');
    } catch (err: unknown) {
      console.error('[WebProfil] Erreur:', err);
      const msg = err instanceof Error ? err.message : 'Erreur de mise à jour';
      showToast(msg.includes('deja utilise') || msg.includes('déjà utilisé') ? 'Ce numéro est déjà associé à un autre compte' : msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Le mot de passe doit comporter au moins 8 caractères', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Les mots de passe ne correspondent pas', 'error');
      return;
    }

    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast('Mot de passe mis à jour avec succès', 'success');
      setPasswordModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur mot de passe', 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/web');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="pb-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
            Paramètres du compte
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
          Mon Compte ImoFlex
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gérez vos informations personnelles, vos coordonnées de versement et la sécurité de votre accès.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left card: Avatar & summary */}
        <div className="lg:col-span-4 rounded-2xl border bg-white p-6 shadow-xs text-center" style={{ borderColor: 'var(--imx-border)' }}>
          <div className="relative w-24 h-24 mx-auto mb-4 group">
            <UserAvatar
              src={profile?.avatar_url}
              name={profile?.full_name}
              size="xl"
              shape="rounded"
              className="w-24 h-24 shadow-md ring-4 ring-purple-50"
            />
            <label
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[var(--imx-accent)] text-white flex items-center justify-center cursor-pointer shadow-md hover:bg-[#6A35C7] transition-all hover:scale-105"
              title="Modifier la photo de profil"
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
              />
              {uploadingAvatar ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera size={14} />
              )}
            </label>
          </div>

          <h2 className="text-lg font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            {profile?.full_name || 'Utilisateur'}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{profile?.email || user?.email}</p>

          <div className="mt-3 flex flex-col items-center gap-1.5">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
              style={{
                background:
                  role === 'proprietaire'
                    ? '#F1EBFF'
                    : role === 'agence'
                    ? '#ECFDF5'
                    : role === 'admin'
                    ? '#FEF2F2'
                    : '#EFF6FF',
                color:
                  role === 'proprietaire'
                    ? '#7B3FE4'
                    : role === 'agence'
                    ? '#10B981'
                    : role === 'admin'
                    ? '#EF4444'
                    : '#3B82F6',
              }}
            >
              Compte {role}
            </span>

            {/* Statut de vérification propriétaire */}
            {(role === 'proprietaire' || role === 'agence') && (
              <div className="mt-1">
                {profile?.owner_verification_status === 'verifie' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck size={13} className="text-emerald-600" />
                    Propriétaire Vérifié
                  </span>
                ) : profile?.owner_verification_status === 'en_attente' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    Vérification en attente
                  </span>
                ) : (
                  <Link
                    to="/web/pro/verification"
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    Non vérifié · Valider
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Role specific shortcuts */}
          <div className="mt-6 pt-6 border-t text-left space-y-2 text-xs" style={{ borderColor: 'var(--imx-border)' }}>
            {role === 'proprietaire' && (
              <>
                <Link to="/web/pro/wallet" className="flex items-center gap-2.5 p-2.5 rounded-xl text-gray-700 hover:bg-purple-50 hover:text-[var(--imx-accent)] transition-colors">
                  <Wallet size={16} className="text-[#7B3FE4]" />
                  <span className="font-semibold">Mon Portefeuille & Retraits</span>
                </Link>
                <Link to="/web/pro/verification" className="flex items-center gap-2.5 p-2.5 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                  <ShieldCheck size={16} className="text-[#10B981]" />
                  <span className="font-semibold">Vérification d'identité</span>
                </Link>
              </>
            )}
            {role === 'agence' && (
              <Link to="/web/agence/profil" className="flex items-center gap-2.5 p-2.5 rounded-xl text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                <Building2 size={16} className="text-[#10B981]" />
                <span className="font-semibold">Paramètres légaux de l'agence</span>
              </Link>
            )}
            {role === 'admin' && (
              <Link to="/admin" className="flex items-center gap-2.5 p-2.5 rounded-xl text-red-600 hover:bg-red-50 font-bold">
                <ShieldCheck size={16} />
                <span>Console Administrateur</span>
              </Link>
            )}
          </div>

          <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--imx-border)' }}>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut size={14} />
              Se déconnecter
            </button>
          </div>
        </div>

        {/* Right card: Form */}
        <div className="lg:col-span-8 space-y-6">
          <form
            onSubmit={handleUpdateProfile}
            className="rounded-2xl border bg-white p-6 sm:p-8 shadow-xs space-y-5"
            style={{ borderColor: 'var(--imx-border)' }}
          >
            <div>
              <h3 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                Informations personnelles
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">Ces informations permettent de renseigner vos baux et quittances.</p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Nom et prénom(s)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--imx-accent)] transition-all"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Adresse e-mail (Identifiant)
                </label>
                <input
                  type="email"
                  value={profile?.email || user?.email || ''}
                  disabled
                  className="w-full px-4 py-2.5 rounded-xl border text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Numéro de téléphone principal
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+229 01 23 45 67"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--imx-accent)] transition-all"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>
            </div>

            <div className="pt-2 border-t" style={{ borderColor: 'var(--imx-border)' }}>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Numéro Mobile Money par défaut (MTN / Moov Bénin)
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Utilisé par défaut pour vos règlements par téléphone et pour percevoir vos reversements de loyer.
              </p>
              <input
                type="tel"
                value={momoNumber}
                onChange={(e) => setMomoNumber(e.target.value)}
                placeholder="Ex: 01 97 00 00 00 ou 01 95 00 00 00"
                className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--imx-accent)] transition-all font-mono"
                style={{ borderColor: 'var(--imx-border)' }}
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--imx-accent)' }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
            </div>
          </form>

          {/* Signature Officielle Card */}
          <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6" style={{ borderColor: 'var(--imx-border)' }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                  Signature manuscrite officielle
                </h3>
                {signature && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 size={11} /> Configurée
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Votre signature manuscrite est automatiquement apposée sur vos quittances de loyer, contrats de bail et états des lieux conformément à la législation béninoise.
              </p>

              {/* Aperçu de la signature */}
              {signature ? (
                <div className="mt-4 p-3 rounded-xl border border-gray-100 bg-[#FAF9FF] inline-block">
                  <div className="text-[10px] uppercase font-bold text-gray-400 mb-1">Aperçu de votre visa</div>
                  <img src={signature} alt="Signature officielle" className="h-14 max-w-[200px] object-contain" />
                </div>
              ) : (
                <div className="mt-3 text-xs text-amber-600 font-medium">
                  ⚠️ Vous n'avez pas encore dessiné votre signature officielle.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSignatureModalOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-sm hover:opacity-95 self-start sm:self-auto flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)' }}
            >
              <PenTool size={14} />
              {signature ? 'Modifier ma signature' : 'Dessiner ma signature'}
            </button>
          </div>

          {/* Security Card */}
          <div className="rounded-2xl border bg-white p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: 'var(--imx-border)' }}>
            <div>
              <h3 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                Sécurité et mot de passe
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Modifiez régulièrement votre mot de passe pour assurer la sécurité de vos données financières.
              </p>
            </div>

            <button
              onClick={() => setPasswordModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border bg-gray-50 hover:bg-gray-100 text-gray-800 transition-colors self-start sm:self-auto shadow-2xs"
              style={{ borderColor: 'var(--imx-border)' }}
            >
              <Lock size={13} />
              Changer le mot de passe
            </button>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white border p-6 shadow-2xl relative" style={{ borderColor: 'var(--imx-border)' }}>
            <h3 className="text-lg font-black text-[#17132B] mb-2" style={{ fontFamily: 'Sora' }}>
              Modifier votre mot de passe
            </h3>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--imx-border)' }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border text-gray-600 hover:bg-gray-50"
                  style={{ borderColor: 'var(--imx-border)' }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: 'var(--imx-accent)' }}
                >
                  {passwordSaving ? 'Enregistrement…' : 'Mettre à jour'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal confirmation déconnexion */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border space-y-5 animate-scaleUp"
            style={{ borderColor: 'var(--imx-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <LogOut size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                  Confirmer la déconnexion
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Voulez-vous vraiment vous déconnecter ?
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
              Vous devrez vous reconnecter pour accéder à nouveau à votre espace personnel.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors border"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  await handleSignOut();
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
              >
                Oui, me déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {signatureModalOpen && (
        <SignatureModal
          isOpen={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          onConfirm={handleSaveSignature}
          title="Configuration de votre signature officielle"
          subtitle="Cette signature manuscrite sera scellée numériquement sur vos quittances de loyer et contrats de bail officiels."
          signerName={profile?.full_name || 'Utilisateur'}
          signerRole={role === 'proprietaire' ? 'Propriétaire / Bailleur' : role === 'locataire' ? 'Preneur / Locataire' : 'Partenaire ImoFlex'}
        />
      )}
    </div>
  );
}
