import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import BottomNav from '../../components/BottomNav';

const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500;
        const MAX_HEIGHT = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Erreur de compression'));
            }
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export default function Profil() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [editingMobileMoney, setEditingMobileMoney] = useState(false);
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState(profile?.mobile_money_number || '');
  const [preferredOperator, setPreferredOperator] = useState<'mtn' | 'moov' | 'celtiis' | ''>(
    profile?.preferred_operator || ''
  );
  const [savingMM, setSavingMM] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    
    setUploadingAvatar(true);
    try {
      const compressedImage = await compressImage(file);
      const fileName = `${profile.id}/${Date.now()}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressedImage, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        
      if (uploadError) throw new Error(uploadError.message);
      
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
        
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);
        
      if (updateError) throw new Error(updateError.message);
      
      await refreshProfile();
      showToast('Photo de profil mise à jour', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de la mise à jour', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveMobileMoney = async () => {
    if (!profile) return;
    setSavingMM(true);
    try {
      const { error } = await supabase.from('users').update({
        mobile_money_number: mobileMoneyNumber || null,
        preferred_operator: preferredOperator || null,
      }).eq('id', profile.id);

      if (error) throw new Error(error.message);
      await refreshProfile();
      setEditingMobileMoney(false);
      showToast('Infos de paiement mises à jour', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setSavingMM(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      showToast('Le mot de passe doit contenir au moins 8 caractères', 'error');
      return;
    }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      showToast('Mot de passe modifié', 'success');
      setChangingPassword(false);
      setNewPassword('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    } finally {
      setPwLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!profile) {
    return (
      <div className="page-container flex flex-col items-center justify-center px-6">
        <div className="card p-8 text-center w-full max-w-sm">
          <span className="text-5xl mb-4 block">👤</span>
          <p className="section-title mb-2">Non connecté</p>
          <p className="text-sm mb-6 text-[#8B7BB5]" style={{ fontFamily: 'Space Grotesk' }}>
            Connectez-vous pour accéder à votre profil
          </p>
          <button className="btn-primary w-full" onClick={() => navigate('/login')}>
            Se connecter
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const initials = profile.full_name
    ? profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'KM';

  return (
    <div className="page-container">
      {/* Header */}
      <header className="sticky-header px-4 py-4 text-center">
        <h1 className="text-sm font-space-grotesk font-semibold text-[#8B7BB5] tracking-wider uppercase">
          Paramètres du compte
        </h1>
      </header>

      <div className="px-4 py-6 space-y-6 flex-1 pb-6">
        {/* Profile Avatar & Info */}
        <div className="flex flex-col items-center">
          <div className="relative mb-3.5">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
              style={{ background: 'rgba(38, 28, 85, 0.8)', border: '1px solid rgba(168, 85, 247, 0.3)' }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-nunito font-900 text-2xl text-[#C084FC] tracking-wider">{initials}</span>
              )}
            </div>
            {/* Edit button */}
            <label 
              className="absolute bottom-0 right-0 w-7 h-7 bg-[#7B3FE4] rounded-full flex items-center justify-center cursor-pointer border-2 border-[#120D2A] hover:bg-[#A855F7] transition-colors"
              title="Modifier la photo"
            >
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
              {uploadingAvatar ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                </svg>
              )}
            </label>
          </div>
          <h2 className="font-nunito font-800 text-lg text-white">{profile.full_name}</h2>
          
          <div className="mt-1 flex items-center justify-center mb-1">
            <span 
              className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
              style={{
                background: profile.role === 'proprietaire' ? 'rgba(168, 85, 247, 0.15)' : profile.role === 'admin' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                color: profile.role === 'proprietaire' ? '#C084FC' : profile.role === 'admin' ? '#FBBF24' : '#60A5FA',
                border: profile.role === 'proprietaire' ? '1px solid rgba(168, 85, 247, 0.3)' : profile.role === 'admin' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
              }}
            >
              {profile.role === 'proprietaire' ? 'Propriétaire' : profile.role === 'locataire' ? 'Locataire' : 'Administrateur'}
            </span>
          </div>

          <p className="text-xs text-[#8B7BB5] mt-1" style={{ fontFamily: 'Space Grotesk' }}>
            {profile.phone || profile.email}
          </p>
        </div>

        {/* Menu Options inside single styled card container */}
        <div className="card divide-y divide-[#261C55] overflow-hidden">
          {/* Mon logement actuel (locataires uniquement) */}
          {profile.role === 'locataire' && (
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-[#261C55]/20 transition-colors"
            >
              <span className="text-sm text-[#E8E0FF] font-medium" style={{ fontFamily: 'Space Grotesk' }}>Mon logement actuel</span>
              <span className="text-xs text-[#A855F7] font-semibold flex items-center gap-1">
                Voir <span className="text-sm">→</span>
              </span>
            </button>
          )}

          {/* Numéro Mobile Money favori */}
          <div className="w-full px-4 py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#E8E0FF] font-medium" style={{ fontFamily: 'Space Grotesk' }}>Numéro Mobile Money favori</span>
              {!editingMobileMoney ? (
                <button
                  onClick={() => setEditingMobileMoney(true)}
                  className="text-xs text-[#A855F7] font-semibold flex items-center gap-1"
                >
                  {profile.preferred_operator ? `${profile.preferred_operator.toUpperCase()} ✓` : 'Modifier →'}
                </button>
              ) : (
                <button
                  onClick={() => setEditingMobileMoney(false)}
                  className="text-xs text-[#8B7BB5] font-semibold"
                >
                  Annuler
                </button>
              )}
            </div>

            {editingMobileMoney && (
              <div className="space-y-3 pt-2">
                <input
                  type="tel"
                  className="input-field w-full"
                  placeholder="+229 XX XX XX XX"
                  value={mobileMoneyNumber}
                  onChange={e => setMobileMoneyNumber(e.target.value)}
                />
                <div className="flex gap-2">
                  {(['mtn', 'moov', 'celtiis'] as const).map(op => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setPreferredOperator(op)}
                      className="flex-1 py-2 text-xs font-bold rounded-lg border transition-all"
                      style={{
                        background: preferredOperator === op ? '#7B3FE4' : '#1E1545',
                        borderColor: preferredOperator === op ? '#7B3FE4' : 'rgba(255,255,255,0.08)',
                        color: preferredOperator === op ? 'white' : '#8B7BB5'
                      }}
                    >
                      {op.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleSaveMobileMoney}
                  disabled={savingMM}
                  className="btn-primary btn-sm w-full"
                >
                  {savingMM ? 'Sauvegarde...' : 'Confirmer'}
                </button>
              </div>
            )}
          </div>

          {/* Changer le mot de passe */}
          <div className="w-full px-4 py-4 flex flex-col gap-3">
            <button
              onClick={() => setChangingPassword(!changingPassword)}
              className="w-full flex items-center justify-between text-left hover:bg-[#261C55]/20 transition-colors"
            >
              <span className="text-sm text-[#E8E0FF] font-medium" style={{ fontFamily: 'Space Grotesk' }}>Changer le mot de passe</span>
              <span className="text-[#A855F7] text-sm font-bold">→</span>
            </button>

            {changingPassword && (
              <div className="space-y-3 pt-2">
                <input
                  type="password"
                  className="input-field w-full"
                  placeholder="Min. 8 caractères"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <button
                  onClick={handleChangePassword}
                  disabled={pwLoading}
                  className="btn-primary btn-sm w-full"
                >
                  {pwLoading ? 'Mise à jour...' : 'Sauvegarder'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Se déconnecter (outline red button matching mockup) */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center font-bold text-sm transition-all border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/5"
          style={{ height: '54px', borderRadius: '16px', fontFamily: 'Nunito' }}
        >
          Se déconnecter
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
