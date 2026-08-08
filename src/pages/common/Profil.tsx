import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import BottomNav from '../../components/BottomNav';
import { 
  ShieldCheck, 
  FileText, 
  Receipt, 
  Wallet, 
  MessageCircle, 
  HelpCircle, 
  ChevronRight, 
  FileCheck,
  Camera,
  Home,
  CreditCard,
  Lock,
  LogOut,
  Settings,
  MapPin
} from 'lucide-react';

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

interface MenuItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  rightElement?: React.ReactNode;
  iconColor: string;
  iconBg: string;
  children?: React.ReactNode;
  isOpen?: boolean;
  hideBorder?: boolean;
}

const MenuItem = ({ 
  icon, 
  title, 
  subtitle, 
  onClick, 
  rightElement, 
  iconColor, 
  iconBg, 
  children, 
  isOpen,
  hideBorder 
}: MenuItemProps) => (
  <div className={`flex flex-col ${hideBorder ? '' : 'border-b border-white/[0.02]'}`}>
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] active:bg-white/[0.05] transition-all group">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          <div className={iconColor}>{icon}</div>
        </div>
        <div className="text-left flex flex-col">
          <span className="text-sm font-semibold text-white">{title}</span>
          {subtitle && <span className="text-xs text-[#8B7BB5] mt-0.5">{subtitle}</span>}
        </div>
      </div>
      <div className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`}>
        {rightElement || <ChevronRight size={18} className="text-[#8B7BB5] group-hover:text-white transition-colors" />}
      </div>
    </button>
    {isOpen && children && (
      <div className="px-4 pb-4 pt-1 animate-in slide-in-from-top-2 fade-in duration-200">
        {children}
      </div>
    )}
  </div>
);

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
        <div className="card p-8 text-center w-full max-w-sm border border-white/5 shadow-2xl">
          <div className="w-20 h-20 bg-[#261C55] rounded-full mx-auto flex items-center justify-center mb-6 border border-[#7B3FE4]/30">
            <span className="text-4xl">👤</span>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Non connecté</h2>
          <p className="text-sm mb-8 text-[#8B7BB5]" style={{ fontFamily: 'Space Grotesk' }}>
            Connectez-vous pour accéder à votre profil et vos paramètres.
          </p>
          <button className="btn-primary w-full shadow-lg shadow-[#7B3FE4]/20 py-3 rounded-xl" onClick={() => navigate('/login')}>
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
    <div className="page-container bg-[#0B0714] min-h-screen pb-24 overflow-y-auto overflow-x-hidden">
      {/* HEADER PROFIL */}
      <div className="flex flex-col items-center pt-10 pb-8 px-4 relative">
        {/* Ambient background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-md h-40 bg-[#7B3FE4] opacity-20 blur-[80px] pointer-events-none"></div>
        
        <div className="relative mb-5">
          {/* Profile completion ring */}
          <div className="absolute -inset-1.5 rounded-full border-[2px] border-white/10"></div>
          <div className="absolute -inset-1.5 rounded-full border-[2px] border-[#7B3FE4] border-t-transparent border-l-transparent rotate-45"></div>
          
          <div className="w-24 h-24 rounded-full overflow-hidden border-[3px] border-[#0B0714] bg-[#261C55] relative flex items-center justify-center z-10 shadow-xl">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
            ) : (
              <span className="font-nunito font-900 text-3xl text-[#C084FC] tracking-wider">{initials}</span>
            )}
          </div>
          
          <label 
            className="absolute bottom-0 -right-1 w-8 h-8 bg-[#7B3FE4] rounded-full flex items-center justify-center cursor-pointer border-[3px] border-[#0B0714] hover:bg-[#A855F7] transition-all z-20 shadow-lg"
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
        
        <h2 className="font-nunito font-900 text-2xl text-white mb-1.5">{profile.full_name}</h2>
        
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
            style={{
              background: profile.role === 'proprietaire' ? 'rgba(168, 85, 247, 0.15)' : profile.role === 'admin' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: profile.role === 'proprietaire' ? '#C084FC' : profile.role === 'admin' ? '#FBBF24' : '#60A5FA',
              border: profile.role === 'proprietaire' ? '1px solid rgba(168, 85, 247, 0.3)' : profile.role === 'admin' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
            }}
          >
            {profile.role === 'proprietaire' ? 'Propriétaire' : profile.role === 'locataire' ? 'Locataire' : 'Administrateur'}
          </span>
          {(profile as any).kyc_status === 'verifie' && (
             <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30">
               <ShieldCheck size={10} /> Vérifié
             </span>
          )}
        </div>
        
        <p className="text-sm text-[#8B7BB5] mb-5 font-space-grotesk">{profile.phone || profile.email}</p>
        
        <button 
          onClick={() => showToast('Modification du profil bientôt disponible', 'success')}
          className="px-5 py-2 rounded-full bg-white/5 border border-white/10 text-white text-xs font-semibold hover:bg-white/10 transition-all flex items-center gap-2"
        >
          <Settings size={14} /> Modifier le profil
        </button>
      </div>

      {/* CARTE "MON LOGEMENT" (Locataire) */}
      {profile.role === 'locataire' && (
        <div className="px-4 mb-6">
          <div className="relative rounded-[20px] overflow-hidden p-5 bg-gradient-to-br from-[#1E163D] to-[#120D2A] border border-white/5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#7B3FE4] opacity-20 rounded-full blur-3xl -mr-10 -mt-10 transition-opacity group-hover:opacity-30"></div>
            
            <div className="relative z-10 flex items-start justify-between">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#7B3FE4]/30 to-[#7B3FE4]/10 flex items-center justify-center border border-[#7B3FE4]/30 shadow-inner">
                  <Home size={26} className="text-[#C084FC]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-bold text-lg leading-none">Mon Logement</h3>
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-green-500/15 text-green-400 border border-green-500/30">Occupé</span>
                  </div>
                  <p className="text-xs text-[#8B7BB5] flex items-center gap-1 font-space-grotesk">
                    <MapPin size={12} /> Espace locataire actif
                  </p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => navigate('/dashboard')} 
              className="relative z-10 w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 border border-white/5"
            >
              Voir le logement <ChevronRight size={16} className="text-[#8B7BB5]" />
            </button>
          </div>
        </div>
      )}

      {/* SECTION "MON COMPTE" */}
      <div className="px-4 mb-6">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#645A8A] mb-3 ml-2 font-space-grotesk">Mon Compte</h3>
        <div className="bg-[#150F28] rounded-[20px] border border-white/[0.05] overflow-hidden shadow-lg">
          
          <MenuItem 
            icon={<FileCheck size={20} />} 
            iconColor="text-[#60A5FA]" 
            iconBg="bg-[#60A5FA]/10"
            title="Mes Documents & Pièces d'identité" 
            subtitle="Gérer vos justificatifs"
            onClick={() => showToast('Fonctionnalité bientôt disponible', 'success')}
          />
          
          <MenuItem 
            icon={<CreditCard size={20} />} 
            iconColor="text-[#FBBF24]" 
            iconBg="bg-[#FBBF24]/10"
            title="Numéro Mobile Money" 
            subtitle={profile.preferred_operator ? `${profile.preferred_operator.toUpperCase()} - ${profile.mobile_money_number || 'Numéro défini'}` : 'Configurer pour les paiements'}
            isOpen={editingMobileMoney}
            onClick={() => {
              setEditingMobileMoney(!editingMobileMoney);
              if (changingPassword) setChangingPassword(false);
            }}
          >
            <div className="bg-[#0B0714] rounded-xl p-4 border border-white/5 shadow-inner mt-2">
              <input
                type="tel"
                className="input-field w-full mb-3 bg-[#1A1333] border-white/10 text-sm focus:border-[#7B3FE4] focus:ring-1 focus:ring-[#7B3FE4]"
                placeholder="+229 XX XX XX XX"
                value={mobileMoneyNumber}
                onChange={e => setMobileMoneyNumber(e.target.value)}
              />
              <div className="flex gap-2 mb-4">
                {(['mtn', 'moov', 'celtiis'] as const).map(op => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => setPreferredOperator(op)}
                    className="flex-1 py-2.5 text-xs font-bold rounded-xl border transition-all"
                    style={{
                      background: preferredOperator === op ? '#7B3FE4' : 'transparent',
                      borderColor: preferredOperator === op ? '#7B3FE4' : 'rgba(255,255,255,0.1)',
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
                className="btn-primary w-full py-2.5 rounded-xl shadow-lg shadow-[#7B3FE4]/20 text-sm"
              >
                {savingMM ? 'Sauvegarde...' : 'Confirmer'}
              </button>
            </div>
          </MenuItem>

          <MenuItem 
            icon={<Lock size={20} />} 
            iconColor="text-[#C084FC]" 
            iconBg="bg-[#C084FC]/10"
            title="Changer le mot de passe" 
            subtitle="Sécuriser votre compte"
            isOpen={changingPassword}
            hideBorder={true}
            onClick={() => {
              setChangingPassword(!changingPassword);
              if (editingMobileMoney) setEditingMobileMoney(false);
            }}
          >
            <div className="bg-[#0B0714] rounded-xl p-4 border border-white/5 shadow-inner mt-2">
              <input
                type="password"
                className="input-field w-full mb-4 bg-[#1A1333] border-white/10 text-sm focus:border-[#7B3FE4] focus:ring-1 focus:ring-[#7B3FE4]"
                placeholder="Nouveau mot de passe (min. 8 car.)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              <button
                onClick={handleChangePassword}
                disabled={pwLoading}
                className="btn-primary w-full py-2.5 rounded-xl shadow-lg shadow-[#7B3FE4]/20 text-sm"
              >
                {pwLoading ? 'Mise à jour...' : 'Sauvegarder'}
              </button>
            </div>
          </MenuItem>
        </div>
      </div>

      {/* SECTION "MES DOCUMENTS" (Spécifique par rôle) */}
      <div className="px-4 mb-6">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#645A8A] mb-3 ml-2 font-space-grotesk">Mes Documents</h3>
        <div className="bg-[#150F28] rounded-[20px] border border-white/[0.05] overflow-hidden shadow-lg">
          {profile.role === 'locataire' ? (
            <Link to="/historique" className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] active:bg-white/[0.05] transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#22C55E]/10 flex items-center justify-center">
                  <Receipt size={20} className="text-[#22C55E]" />
                </div>
                <div className="text-left flex flex-col">
                  <span className="text-sm font-semibold text-white">Mes Quittances de loyer</span>
                  <span className="text-xs text-[#8B7BB5] mt-0.5">Historique de vos paiements</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-[#8B7BB5] group-hover:text-white transition-colors" />
            </Link>
          ) : (
            <>
              <MenuItem 
                icon={<FileText size={20} />} 
                iconColor="text-[#A855F7]" 
                iconBg="bg-[#A855F7]/10"
                title="Relevés d'encaissement" 
                subtitle="Tous vos relevés mensuels"
                onClick={() => showToast('Fonctionnalité bientôt disponible', 'success')}
              />
              <MenuItem 
                icon={<Wallet size={20} />} 
                iconColor="text-[#FBBF24]" 
                iconBg="bg-[#FBBF24]/10"
                title="Coordonnées de retrait" 
                subtitle="Gérer vos comptes de réception"
                hideBorder={true}
                onClick={() => showToast('Fonctionnalité bientôt disponible', 'success')}
              />
            </>
          )}
        </div>
      </div>

      {/* SECTION "AIDE" */}
      <div className="px-4 mb-8">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#645A8A] mb-3 ml-2 font-space-grotesk">Support & Aide</h3>
        <div className="bg-[#150F28] rounded-[20px] border border-white/[0.05] overflow-hidden shadow-lg">
          <a
            href="https://wa.me/22900000000?text=Bonjour%20ImoFlex%20Support"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] active:bg-white/[0.05] transition-all group border-b border-white/[0.02]"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center">
                <MessageCircle size={20} className="text-[#25D366]" />
              </div>
              <div className="text-left flex flex-col">
                <span className="text-sm font-semibold text-white">Centre d'aide & WhatsApp</span>
                <span className="text-xs text-[#8B7BB5] mt-0.5">Assistance rapide 7j/7</span>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#8B7BB5] group-hover:text-white transition-colors" />
          </a>
          
          <Link
            to="/contact"
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] active:bg-white/[0.05] transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#60A5FA]/10 flex items-center justify-center">
                <HelpCircle size={20} className="text-[#60A5FA]" />
              </div>
              <div className="text-left flex flex-col">
                <span className="text-sm font-semibold text-white">FAQ / Mode d'emploi</span>
                <span className="text-xs text-[#8B7BB5] mt-0.5">Découvrir ImoFlex</span>
              </div>
            </div>
            <ChevronRight size={18} className="text-[#8B7BB5] group-hover:text-white transition-colors" />
          </Link>
        </div>
      </div>

      {/* DÉCONNEXION */}
      <div className="px-4 mb-8">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2.5 p-4 rounded-xl bg-transparent hover:bg-red-500/5 text-red-500 font-bold transition-all border border-red-500/20 active:bg-red-500/10"
        >
          <LogOut size={18} />
          <span className="text-sm">Se déconnecter</span>
        </button>
      </div>

      {/* FOOTER */}
      <div className="px-4 flex flex-col items-center justify-center gap-2 mb-4">
        <div className="flex items-center gap-4 text-xs text-[#645A8A] font-space-grotesk">
          <button onClick={() => showToast('Conditions disponibles bientôt', 'success')} className="hover:text-white transition-colors">Conditions d'utilisation</button>
          <span>•</span>
          <button onClick={() => showToast('Confidentialité disponible bientôt', 'success')} className="hover:text-white transition-colors">Confidentialité</button>
        </div>
        <p className="text-[10px] text-[#3D3060] font-mono mt-1">ImoFlex v1.0.0 (Production)</p>
      </div>

      <BottomNav />
    </div>
  );
}
