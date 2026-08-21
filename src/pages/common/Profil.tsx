import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../components/Toast';
import BottomNav from '../../components/BottomNav';
import { ShieldCheck, FileText, Receipt, Wallet, MessageCircle, HelpCircle, ChevronRight, FileCheck, KeyRound, Home, Sun, Moon, Monitor, User, Settings, Camera, Trash2 } from 'lucide-react';
import { LegalModal } from '../../components/LegalModal';

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

function ProfilRow({
  icon,
  iconColor,
  label,
  trailing,
  onClick,
  to,
  href,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  trailing?: string;
  onClick?: () => void;
  to?: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex-shrink-0" style={{ color: iconColor }}>{icon}</span>
        <span className="text-sm text-[var(--imx-text-primary)] font-medium truncate" style={{ fontFamily: 'Space Grotesk' }}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 pl-2">
        {trailing && (
          <span className="text-xs text-[var(--imx-text-secondary)] font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
            {trailing}
          </span>
        )}
        <ChevronRight size={16} className="text-[var(--imx-text-muted)]" />
      </div>
    </>
  );

  const className = "w-full px-4 py-4 flex items-center justify-between hover:bg-[var(--imx-surface-2)] transition-colors text-left";

  if (to) return <Link to={to} className={className}>{content}</Link>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>;
  return <button onClick={onClick} className={className}>{content}</button>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--imx-text-muted)] mb-2 px-1" style={{ fontFamily: 'Space Grotesk' }}>
      {children}
    </p>
  );
}

export default function Profil() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { mode, setMode } = useTheme();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy' | null>(null);

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

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    if (!profile?.id) return;
    setDeletingAccount(true);
    try {
      // 1. Désactiver le compte en base (anonymisation et flag is_active: false)
      const { error: updateErr } = await supabase
        .from('users')
        .update({
          is_active: false,
          full_name: 'Compte supprimé',
          phone: null,
          mobile_money_number: null,
        })
        .eq('id', profile.id);

      if (updateErr) {
        console.warn('Erreur anonymisation profil:', updateErr);
      }

      // 2. Déconnexion complète
      await signOut();
      showToast('Votre compte a été supprimé avec succès.', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Erreur suppression compte:', err);
      showToast('Impossible de supprimer le compte. Contactez le support.', 'error');
    } finally {
      setDeletingAccount(false);
      setShowDeleteAccountConfirm(false);
    }
  };

  if (!profile) {
    return (
      <div className="page-container flex flex-col items-center justify-center px-6">
        <div className="card p-8 text-center w-full max-w-sm">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 mx-auto" style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}>
            <User size={28} color="var(--imx-accent-glow)" />
          </div>
          <p className="section-title mb-2">Non connecté</p>
          <p className="text-sm mb-6 text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
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

  const mmTrailing = profile.preferred_operator ? profile.preferred_operator.toUpperCase() : 'Non renseigné';

  return (
    <div className="page-container">
      <header className="sticky-header px-4 py-4 text-center">
        <h1 className="text-sm font-space-grotesk font-semibold text-[var(--imx-text-secondary)] tracking-wider uppercase">
          Paramètres du compte
        </h1>
      </header>

      <div className="px-4 py-6 space-y-6 flex-1 pb-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
                style={{ background: 'var(--imx-surface-2)', border: '2px solid var(--imx-accent)' }}
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-nunito font-900 text-3xl text-[var(--imx-accent-glow)] tracking-wider">{initials}</span>
                )}
              </div>
              <label
                className="absolute bottom-1 -right-1 w-8 h-8 bg-[var(--imx-accent)] rounded-full flex items-center justify-center cursor-pointer border-2 border-[var(--imx-bg-app)] hover:bg-[var(--imx-accent-light)] transition-colors"
                title="Modifier la photo"
              >
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                {uploadingAvatar ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={14} className="text-white" />
                )}
              </label>
            </div>
            
            <div className="flex flex-col items-start gap-1.5">
              <h2 className="font-nunito font-900 text-[22px] leading-none text-[var(--imx-text-primary)]">{profile.full_name}</h2>
              
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{
                  background: profile.role === 'proprietaire' ? 'rgba(168, 85, 247, 0.15)' : profile.role === 'admin' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: profile.role === 'proprietaire' ? 'var(--imx-accent-glow)' : profile.role === 'admin' ? '#FBBF24' : '#60A5FA',
                  border: profile.role === 'proprietaire' ? '1px solid rgba(168, 85, 247, 0.3)' : profile.role === 'admin' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                }}
              >
                {profile.role === 'proprietaire' ? 'Propriétaire' : profile.role === 'locataire' ? 'Locataire' : 'Administrateur'}
              </span>
              
              <div className="flex flex-col gap-1 mt-1">
                <p className="text-[15px] font-medium text-[var(--imx-text-secondary)] leading-none" style={{ fontFamily: 'Space Grotesk' }}>
                  {profile.phone || profile.email}
                </p>
                
                {(profile as any).kyc_status === 'verifie' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold mt-1 text-[#22C55E]">
                    <ShieldCheck size={12} /> Identité vérifiée
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold mt-1 text-[#FBBF24]">
                    <ShieldCheck size={12} /> Compte à vérifier
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <button 
            className="w-full py-3.5 rounded-[14px] flex items-center justify-center gap-2 transition-colors"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
            onClick={() => showToast('Fonctionnalité à venir', 'info')}
          >
            <Settings size={18} className="text-[var(--imx-text-primary)]" />
            <span className="font-nunito font-800 text-[15px] text-[var(--imx-text-primary)]">Modifier le profil</span>
          </button>
        </div>

        <div>
          <SectionLabel>Apparence</SectionLabel>
          <div className="card p-2 flex gap-1.5">
            {([
              { key: 'dark' as const, label: 'Sombre', icon: Moon },
              { key: 'light' as const, label: 'Clair', icon: Sun },
              { key: 'auto' as const, label: 'Auto', icon: Monitor },
            ]).map(({ key, label, icon: Icon }) => {
              const active = mode === key;
              return (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all"
                  style={{
                    background: active ? 'var(--imx-accent)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--imx-text-secondary)',
                  }}
                >
                  <Icon size={17} />
                  <span className="text-[11px] font-bold" style={{ fontFamily: 'Space Grotesk' }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <SectionLabel>Compte</SectionLabel>
          <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
            {profile.role === 'locataire' && (
              <ProfilRow
                icon={<Home size={16} />}
                iconColor="#60A5FA"
                label="Mon logement actuel"
                to="/dashboard"
              />
            )}
            <ProfilRow
              icon={<FileCheck size={16} />}
              iconColor="var(--imx-accent-light)"
              label="Mes documents & pièces d'identité"
              onClick={() => showToast('Fonctionnalité bientôt disponible', 'success')}
            />
          </div>
        </div>

        <div>
          <SectionLabel>Paiements & documents</SectionLabel>
          <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
            <ProfilRow
              icon={<Wallet size={16} />}
              iconColor="#FBBF24"
              label="Numéro Mobile Money favori"
              trailing={mmTrailing}
              to="/profil/mobile-money"
            />
            {profile.role === 'locataire' ? (
              <ProfilRow
                icon={<Receipt size={16} />}
                iconColor="#22C55E"
                label="Mes quittances de loyer"
                to="/historique"
              />
            ) : (
              <>
                <ProfilRow
                  icon={<FileText size={16} />}
                  iconColor="var(--imx-accent-light)"
                  label="Relevés d'encaissement"
                  onClick={() => showToast('Fonctionnalité bientôt disponible', 'success')}
                />
                <ProfilRow
                  icon={<Wallet size={16} />}
                  iconColor="#FBBF24"
                  label="Coordonnées de retrait MoMo"
                  onClick={() => showToast('Fonctionnalité bientôt disponible', 'success')}
                />
              </>
            )}
          </div>
        </div>

        <div>
          <SectionLabel>Sécurité</SectionLabel>
          <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
            <ProfilRow
              icon={<KeyRound size={16} />}
              iconColor="#EF4444"
              label="Changer le mot de passe"
              to="/profil/mot-de-passe"
            />
            <ProfilRow
              icon={<Trash2 size={16} />}
              iconColor="#EF4444"
              label="Supprimer mon compte"
              onClick={() => setShowDeleteAccountConfirm(true)}
            />
          </div>
        </div>

        <div>
          <SectionLabel>Support & aide</SectionLabel>
          <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
            <ProfilRow
              icon={<MessageCircle size={16} />}
              iconColor="#22C55E"
              label="Centre d'aide & WhatsApp"
              href="https://wa.me/22901291159?text=Bonjour%20ImoFlex%20Support"
            />
            <ProfilRow
              icon={<HelpCircle size={16} />}
              iconColor="#60A5FA"
              label="FAQ / Mode d'emploi"
              to="/aide"
            />
          </div>
        </div>

        <button
          onClick={() => setShowSignOutConfirm(true)}
          className="w-full flex items-center justify-center font-bold text-sm transition-all border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/5"
          style={{ height: '54px', borderRadius: '16px', fontFamily: 'Sora' }}
        >
          Se déconnecter
        </button>

        <div className="text-center pb-4 space-y-2">
          <button
            onClick={() => setLegalModalTab('terms')}
            className="text-[11px] text-[var(--imx-text-muted)] hover:text-[var(--imx-text-secondary)] transition-colors underline"
            style={{ fontFamily: 'Space Grotesk' }}
          >
            Conditions d'utilisation & Confidentialité
          </button>
          <p className="text-[10px] text-[#3D3060]" style={{ fontFamily: 'Space Grotesk' }}>
            ImoFlex v1.0.0 (Production)
          </p>
        </div>
      </div>

      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="w-full max-w-[340px] rounded-[24px] p-6 shadow-2xl"
            style={{ background: 'var(--imx-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-nunito font-800 text-lg text-[var(--imx-text-primary)] text-center mb-2">
              Se déconnecter ?
            </h3>
            <p className="text-sm text-center mb-6 text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
              Vous devrez vous reconnecter pour accéder à votre compte.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 font-bold text-sm py-3.5 rounded-2xl transition-colors"
                style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}
              >
                Annuler
              </button>
              <button
                onClick={handleSignOut}
                className="flex-1 font-bold text-sm py-3.5 rounded-2xl text-white transition-colors"
                style={{ background: '#EF4444', fontFamily: 'Sora' }}
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAccountConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowDeleteAccountConfirm(false)}
        >
          <div
            className="w-full max-w-[360px] rounded-[28px] p-6 shadow-2xl"
            style={{ background: 'var(--imx-surface)', border: '1px solid rgba(239,68,68,0.35)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Icône d'avertissement */}
            <div className="flex flex-col items-center mb-5">
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-3" style={{ border: '2px solid rgba(239,68,68,0.3)' }}>
                <Trash2 size={28} className="text-[#EF4444]" />
              </div>
              <h3 className="font-nunito font-900 text-[18px] text-[var(--imx-text-primary)] text-center">
                Supprimer mon compte
              </h3>
            </div>

            {/* Avertissements */}
            <div className="rounded-2xl p-4 mb-5 space-y-2.5" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-[12px] font-bold text-[#EF4444] uppercase tracking-wide" style={{ fontFamily: 'Space Grotesk' }}>⚠️ Avant de continuer</p>
              {[
                'Toutes vos données personnelles seront supprimées.',
                'Vos annonces, demandes et historique seront anonymisés.',
                'Cette action est irréversible — votre compte ne pourra pas être récupéré.',
                'Vous serez déconnecté(e) définitivement.',
              ].map((warn, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[#EF4444] text-[11px] mt-0.5 flex-shrink-0">•</span>
                  <p className="text-[12px] text-[var(--imx-text-secondary)] leading-snug" style={{ fontFamily: 'Space Grotesk' }}>{warn}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-center text-[var(--imx-text-muted)] mb-5 leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
              En continuant, vous envoyez une demande de suppression à notre équipe. Votre compte sera traité sous 48h.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteAccountConfirm(false)}
                className="flex-1 font-bold text-sm py-3.5 rounded-2xl transition-colors"
                style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 font-bold text-sm py-3.5 rounded-2xl text-white text-center transition-all active:scale-95 disabled:opacity-60"
                style={{ background: '#EF4444', fontFamily: 'Sora' }}
              >
                {deletingAccount ? 'Suppression…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <LegalModal
        isOpen={legalModalTab !== null}
        onClose={() => setLegalModalTab(null)}
        initialTab={legalModalTab || 'terms'}
      />

      <BottomNav />
    </div>
  );
}
