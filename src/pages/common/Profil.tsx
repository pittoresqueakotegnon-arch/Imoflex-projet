import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import BottomNav from '../../components/BottomNav';
import {
  ShieldCheck, Receipt, Wallet, MessageCircle, HelpCircle,
  ChevronRight, KeyRound, Home, User, Camera, Trash2,
  ClipboardList, Heart, AlertTriangle, Pencil, Save, X,
  Building2, Users, Plus, ArrowUpRight, Clock3, Star,
} from 'lucide-react';
import { LegalModal } from '../../components/LegalModal';
import { useWallet } from '../../hooks/useWallet';
import { useOwnerVerification } from '../../hooks/useOwnerVerification';
import { OWNER_VERIFICATION_STATUS_META } from '../../lib/ownerVerification';
import { formatMontant } from '../../lib/utils';

// ─── Compression image avatar ─────────────────────────────────────────────────
const compressImage = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 500;
        let w = img.width;
        let h = img.height;
        if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
        else { if (h > MAX) { w *= MAX / h; h = MAX; } }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Erreur compression'))),
          'image/jpeg',
          0.8,
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });

// ─── Composant ligne de menu ───────────────────────────────────────────────────
function ProfilRow({
  icon, iconColor, label, trailing, onClick, to, href,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  to?: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${iconColor}18`, color: iconColor }}
        >
          {icon}
        </span>
        <span
          className="text-sm text-[var(--imx-text-primary)] font-semibold truncate"
          style={{ fontFamily: 'Space Grotesk' }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 pl-2">
        {trailing && (
          <span className="text-xs text-[var(--imx-text-secondary)] font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
            {trailing}
          </span>
        )}
        <ChevronRight size={15} className="text-[var(--imx-text-muted)]" />
      </div>
    </>
  );

  const cls = 'w-full px-4 py-3.5 flex items-center justify-between hover:bg-[var(--imx-surface-2)] transition-colors text-left';
  if (to) return <Link to={to} className={cls}>{content}</Link>;
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{content}</a>;
  return <button onClick={onClick} className={cls}>{content}</button>;
}

// ─── Label de section ──────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-widest text-[var(--imx-text-muted)] mb-2 px-1"
      style={{ fontFamily: 'Space Grotesk' }}
    >
      {children}
    </p>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface OwnerMetrics {
  listings: number;
  activeLeases: number;
  pendingRequests: number;
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function Profil() {
  const { profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy' | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const isOwner = profile?.role === 'proprietaire';

  const { wallet, loading: walletLoading, error: walletError } = useWallet(
    isOwner ? profile?.id : undefined,
  );
  const { verification, loading: verificationLoading } = useOwnerVerification(isOwner);

  const [ownerMetrics, setOwnerMetrics] = useState<OwnerMetrics | null>(null);
  const [ownerMetricsLoading, setOwnerMetricsLoading] = useState(isOwner);

  // ── Chargement metriques proprietaire ────────────────────────────────────────
  useEffect(() => {
    let active = true;
    if (!isOwner || !profile?.id) {
      setOwnerMetrics(null);
      setOwnerMetricsLoading(false);
      return () => { active = false; };
    }

    const fetch = async () => {
      setOwnerMetricsLoading(true);
      try {
        const [listingsRes, propertiesRes] = await Promise.all([
          supabase.from('listings').select('id', { count: 'exact' }).eq('owner_id', profile.id),
          supabase.from('properties').select('id').eq('owner_id', profile.id).eq('is_active', true),
        ]);
        if (listingsRes.error) throw listingsRes.error;
        if (propertiesRes.error) throw propertiesRes.error;

        const listingIds = (listingsRes.data ?? []).map((l) => l.id);
        const propertyIds = (propertiesRes.data ?? []).map((p) => p.id);

        let activeLeases = 0;
        let pendingRequests = 0;

        if (propertyIds.length > 0) {
          const { count, error } = await supabase
            .from('leases').select('id', { count: 'exact', head: true })
            .in('property_id', propertyIds).eq('status', 'actif');
          if (error) throw error;
          activeLeases = count ?? 0;
        }

        if (listingIds.length > 0) {
          const { count, error } = await supabase
            .from('contact_requests').select('id', { count: 'exact', head: true })
            .in('listing_id', listingIds).eq('status', 'nouvelle');
          if (error) throw error;
          pendingRequests = count ?? 0;
        }

        if (active) setOwnerMetrics({ listings: listingsRes.count ?? 0, activeLeases, pendingRequests });
      } catch (err) {
        console.error('[Profil] owner metrics error:', err);
        if (active) setOwnerMetrics(null);
      } finally {
        if (active) setOwnerMetricsLoading(false);
      }
    };

    fetch();
    return () => { active = false; };
  }, [isOwner, profile?.id]);

  // ── Edition coordonnees ───────────────────────────────────────────────────────
  const openContactEditor = () => {
    if (!profile) return;
    setEditFullName(profile.full_name || '');
    setEditPhone(profile.phone || '');
    setEditingContact(true);
  };

  const handleContactSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || savingContact) return;
    const fullName = editFullName.trim().replace(/\s+/g, ' ');
    const phoneDigits = editPhone.replace(/\D/g, '');
    const phone = phoneDigits ? `+${phoneDigits}` : '';

    if (fullName.length < 2 || fullName.length > 150) {
      showToast('Le nom doit contenir entre 2 et 150 caracteres.', 'error'); return;
    }
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      showToast('Saisissez un numero de telephone international valide.', 'error'); return;
    }

    setSavingContact(true);
    try {
      const { error } = await supabase.rpc('update_current_user_contact', {
        p_full_name: fullName, p_phone: phone,
      });
      if (error) throw error;
      await refreshProfile();
      setEditingContact(false);
      showToast('Vos informations ont ete mises a jour.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Impossible de mettre a jour vos informations.';
      showToast(msg.includes('deja utilise') ? 'Ce numero est deja associe a un autre compte.' : msg, 'error');
    } finally {
      setSavingContact(false);
    }
  };

  // ── Upload avatar ─────────────────────────────────────────────────────────────
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);
    try {
      const blob = await compressImage(file);
      const fileName = `${profile.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars').upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw new Error(uploadError.message);
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: updateError } = await supabase.from('users')
        .update({ avatar_url: publicUrl }).eq('id', profile.id);
      if (updateError) throw new Error(updateError.message);
      await refreshProfile();
      showToast('Photo de profil mise a jour', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de la mise a jour', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const handleSignOut = async () => { await signOut(); navigate('/'); };

  const handleDeleteAccount = async () => {
    if (!profile?.id) return;
    setDeletingAccount(true);
    try {
      const { callEdgeFunction } = await import('../../lib/fedapay');
      await callEdgeFunction('delete-account', {});
      await signOut();
      showToast('Votre compte a ete supprime avec succes.', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Erreur suppression compte:', err);
      showToast('Impossible de supprimer le compte. Contactez le support.', 'error');
    } finally {
      setDeletingAccount(false);
      setShowDeleteAccountConfirm(false);
    }
  };

  // ─── Etat non connecte ────────────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="page-container flex flex-col items-center justify-center px-6">
        <div className="card p-8 text-center w-full max-w-sm">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 mx-auto"
            style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}
          >
            <User size={28} color="var(--imx-accent-glow)" />
          </div>
          <p className="section-title mb-2">Non connecte</p>
          <p className="text-sm mb-6 text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
            Connectez-vous pour acceder a votre profil
          </p>
          <button className="btn-primary w-full" onClick={() => navigate('/login')}>
            Se connecter
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ─── Derivations ──────────────────────────────────────────────────────────────
  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'XX';

  const mmTrailing = profile.preferred_operator
    ? profile.preferred_operator.toUpperCase()
    : 'Non renseigne';

  const ownerVerificationStatus = profile.owner_verification_status ?? verification.verification_status ?? 'non_verifie';
  const ownerVerificationMeta = OWNER_VERIFICATION_STATUS_META[ownerVerificationStatus];

  const metricVal = (v: number | undefined) =>
    ownerMetricsLoading || v === undefined ? '---' : String(v);

  const walletBalance = walletLoading
    ? '---'
    : wallet
      ? formatMontant(wallet.available_balance)
      : walletError
        ? 'Indisponible'
        : 'A activer';

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="page-container premium-page">

      {/* Header */}
      <header className="premium-header px-4 py-4 text-center">
        <h1
          className="text-sm font-semibold text-[var(--imx-text-secondary)] tracking-wider uppercase"
          style={{ fontFamily: 'Space Grotesk' }}
        >
          {isOwner ? 'Espace proprietaire' : 'Parametres du compte'}
        </h1>
      </header>

      <div className="px-4 py-5 space-y-5 flex-1 pb-6">

        {/* VUE PROPRIETAIRE */}
        {isOwner ? (
          <>
            {/* Hero card proprietaire */}
            <section
              className="overflow-hidden rounded-[28px] text-white"
              style={{
                background: 'linear-gradient(145deg, #6D36D4 0%, #482095 100%)',
                boxShadow: '0 20px 48px rgba(91,55,185,0.28)',
              }}
            >
              <div className="relative overflow-hidden p-5">
                <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full border border-white/10 bg-white/[0.05]" />
                <div className="pointer-events-none absolute -bottom-14 left-4 h-32 w-32 rounded-full border border-white/[0.07]" />

                <div className="relative flex items-start gap-4">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-[22px] border border-white/30 bg-white/15 shadow-lg">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.full_name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="font-nunito text-[23px] font-black tracking-wide text-white">{initials}</span>
                      )}
                    </div>
                    <label
                      className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-[#5A2AB0] bg-white text-[#5A2AB0] shadow-sm transition-transform active:scale-95"
                      title="Modifier la photo"
                    >
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                      {uploadingAvatar
                        ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#5A2AB0] border-t-transparent" />
                        : <Camera size={13} />}
                    </label>
                  </div>

                  {/* Infos */}
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55" style={{ fontFamily: 'Space Grotesk' }}>
                      Compte professionnel
                    </p>
                    <h2 className="mt-1 truncate font-nunito text-[21px] font-black leading-tight">{profile.full_name}</h2>
                    <p className="mt-0.5 truncate text-[12px] text-white/70" style={{ fontFamily: 'Space Grotesk' }}>
                      {profile.phone || profile.email}
                    </p>
                    {ownerVerificationStatus === 'verifie' && (
                      <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white">
                        <ShieldCheck size={10} /> Proprietaire verifie
                      </span>
                    )}
                  </div>
                </div>

                {/* Lien verification */}
                <Link
                  to="/pro/verification"
                  className="relative mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.10] px-3.5 py-3 transition-colors hover:bg-white/[0.14]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/15">
                      {ownerVerificationStatus === 'verifie' ? <ShieldCheck size={16} /> : <Clock3 size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-bold">
                        {verificationLoading ? 'Chargement...' : ownerVerificationMeta.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-white/60">
                        Identite et retraits securises
                      </span>
                    </span>
                  </span>
                  <ChevronRight size={17} className="flex-shrink-0 text-white/70" />
                </Link>
              </div>

              {/* Solde portefeuille */}
              <Link
                to="/pro/wallet"
                className="block border-t border-white/10 bg-black/[0.10] px-5 py-4 transition-colors hover:bg-black/[0.15]"
              >
                <div className="flex items-end justify-between gap-3">
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-white/55" style={{ fontFamily: 'Space Grotesk' }}>
                      Solde disponible
                    </span>
                    <span className="mt-1 block font-nunito text-[24px] font-black tracking-tight">
                      {walletBalance}
                    </span>
                  </span>
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-white/85">
                    Portefeuille <ArrowUpRight size={14} />
                  </span>
                </div>
              </Link>
            </section>

            {/* Metriques (3 cartes) */}
            <section className="grid grid-cols-3 gap-2">
              {[
                { to: '/pro/annonces', icon: <Building2 size={16} />, value: metricVal(ownerMetrics?.listings), label: 'Annonces', badge: false },
                { to: '/pro/locataires', icon: <Users size={16} />, value: metricVal(ownerMetrics?.activeLeases), label: 'Locations', badge: false },
                { to: '/pro/demandes', icon: <ClipboardList size={16} />, value: metricVal(ownerMetrics?.pendingRequests), label: 'A traiter',
                  badge: !ownerMetricsLoading && (ownerMetrics?.pendingRequests ?? 0) > 0 },
              ].map(({ to, icon, value, label, badge }) => (
                <Link
                  key={to}
                  to={to}
                  className="relative rounded-2xl border p-3 text-center transition-transform active:scale-[0.97]"
                  style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
                >
                  {badge && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#EF4444]" />
                  )}
                  <span className="flex justify-center text-[var(--imx-accent)]">{icon}</span>
                  <p className="mt-2 font-nunito text-[20px] font-black text-[var(--imx-text-primary)]">{value}</p>
                  <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>
                    {label}
                  </p>
                </Link>
              ))}
            </section>

            {/* Actions rapides */}
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/pro/publier"
                className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[13px] font-black text-white transition-transform active:scale-[0.97]"
                style={{ background: 'var(--imx-accent)', boxShadow: '0 8px 20px rgba(91,55,185,0.22)' }}
              >
                <Plus size={16} /> Publier une annonce
              </Link>
              <Link
                to="/pro/dashboard"
                className="flex items-center justify-center gap-2 rounded-2xl border py-3.5 text-[13px] font-black text-[var(--imx-text-primary)] transition-transform active:scale-[0.97]"
                style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
              >
                Tableau de bord <ArrowUpRight size={15} className="text-[var(--imx-accent)]" />
              </Link>
            </div>

            {/* Profil professionnel (edition) */}
            <div>
              <SectionLabel>Profil professionnel</SectionLabel>
              <div className="card overflow-hidden">
                {editingContact ? (
                  <form onSubmit={handleContactSave} className="p-4 space-y-4">
                    <div>
                      <label htmlFor="owner-full-name" className="block text-xs font-semibold mb-1.5 text-[var(--imx-text-secondary)]">
                        Nom complet
                      </label>
                      <input
                        id="owner-full-name"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        autoComplete="name"
                        maxLength={150}
                        required
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="owner-phone" className="block text-xs font-semibold mb-1.5 text-[var(--imx-text-secondary)]">
                        Numero de telephone
                      </label>
                      <input
                        id="owner-phone"
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+229 97 12 34 56"
                        required
                        className="input-field w-full"
                      />
                      <p className="text-[11px] mt-1.5 text-[var(--imx-text-muted)]">
                        Un changement de numero desactive sa verification.
                      </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingContact(false)}
                        disabled={savingContact}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-primary)' }}
                      >
                        <X size={16} /> Annuler
                      </button>
                      <button type="submit" disabled={savingContact} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                        {savingContact ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                        Enregistrer
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={openContactEditor}
                    className="w-full px-4 py-4 flex items-center justify-between hover:bg-[var(--imx-surface-2)] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(123,63,228,0.10)', color: 'var(--imx-accent)' }}>
                        <User size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--imx-text-primary)] font-semibold truncate" style={{ fontFamily: 'Space Grotesk' }}>
                          Identite et coordonnees
                        </p>
                        <p className="text-xs text-[var(--imx-text-secondary)] truncate mt-0.5">
                          {profile.full_name} &middot; {profile.phone || 'Non renseigne'}
                        </p>
                      </div>
                    </div>
                    <Pencil size={15} className="flex-shrink-0 text-[var(--imx-text-muted)]" />
                  </button>
                )}
              </div>
            </div>

            {/* Finances et securite */}
            <div>
              <SectionLabel>Finances &amp; securite</SectionLabel>
              <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
                <ProfilRow
                  icon={<Wallet size={15} />}
                  iconColor="var(--imx-accent)"
                  label="Coordonnees Mobile Money"
                  trailing={mmTrailing}
                  to="/profil/mobile-money"
                />
                <ProfilRow
                  icon={<KeyRound size={15} />}
                  iconColor="#EF4444"
                  label="Changer le mot de passe"
                  to="/profil/mot-de-passe"
                />
                <ProfilRow
                  icon={<Trash2 size={15} />}
                  iconColor="#EF4444"
                  label="Supprimer mon compte"
                  onClick={() => setShowDeleteAccountConfirm(true)}
                />
              </div>
            </div>
          </>
        ) : (
          /* VUE LOCATAIRE / AUTRE */
          <>
            {/* Avatar + infos */}
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
                  style={{ background: 'var(--imx-surface-2)', border: '2.5px solid var(--imx-accent)' }}
                >
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-nunito font-black text-3xl text-[var(--imx-accent-glow)] tracking-wider">{initials}</span>
                  )}
                </div>
                <label
                  className="absolute bottom-1 -right-1 w-8 h-8 bg-[var(--imx-accent)] rounded-full flex items-center justify-center cursor-pointer border-2 border-[var(--imx-bg-app)] hover:bg-[var(--imx-accent-light)] transition-colors"
                  title="Modifier la photo"
                >
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                  {uploadingAvatar
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Camera size={14} className="text-white" />}
                </label>
              </div>

              <div className="flex flex-col items-start gap-1.5">
                <h2 className="font-nunito font-black text-[22px] leading-none text-[var(--imx-text-primary)]">{profile.full_name}</h2>
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{
                    background: profile.role === 'admin' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                    color: profile.role === 'admin' ? '#FBBF24' : '#60A5FA',
                    border: profile.role === 'admin' ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(59,130,246,0.3)',
                  }}
                >
                  {profile.role === 'locataire' ? 'Locataire' : 'Administrateur'}
                </span>
                <div className="flex flex-col gap-1 mt-0.5">
                  <p className="text-[14px] font-medium text-[var(--imx-text-secondary)] leading-none" style={{ fontFamily: 'Space Grotesk' }}>
                    {profile.phone || profile.email}
                  </p>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${profile.phone_verified ? 'text-[#22C55E]' : 'text-[#FBBF24]'}`}>
                    <ShieldCheck size={11} />
                    {profile.phone_verified ? 'Telephone verifie' : 'Telephone non verifie'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions rapides */}
            <div className="flex gap-2">
              <button
                className="flex-1 py-3 rounded-[14px] flex items-center justify-center gap-2 transition-colors"
                style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
                onClick={() => navigate('/profil/mot-de-passe')}
              >
                <KeyRound size={16} className="text-[var(--imx-accent)]" />
                <span className="font-semibold text-[13px] text-[var(--imx-text-primary)]" style={{ fontFamily: 'Space Grotesk' }}>
                  Mot de passe
                </span>
              </button>
              <button
                className="flex-1 py-3 rounded-[14px] flex items-center justify-center gap-2 transition-colors"
                style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
                onClick={() => navigate('/profil/mobile-money')}
              >
                <Wallet size={16} className="text-[#FBBF24]" />
                <span className="font-semibold text-[13px] text-[var(--imx-text-primary)]" style={{ fontFamily: 'Space Grotesk' }}>
                  Mobile Money
                </span>
              </button>
            </div>

            {/* Mes informations */}
            <div>
              <SectionLabel>Mes informations</SectionLabel>
              <div className="card overflow-hidden">
                {editingContact ? (
                  <form onSubmit={handleContactSave} className="p-4 space-y-4">
                    <div>
                      <label htmlFor="profile-full-name" className="block text-xs font-semibold mb-1.5 text-[var(--imx-text-secondary)]">
                        Nom complet
                      </label>
                      <input
                        id="profile-full-name"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        autoComplete="name"
                        maxLength={150}
                        required
                        className="input-field w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-phone" className="block text-xs font-semibold mb-1.5 text-[var(--imx-text-secondary)]">
                        Numero de telephone
                      </label>
                      <input
                        id="profile-phone"
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+229 97 12 34 56"
                        required
                        className="input-field w-full"
                      />
                      <p className="text-[11px] mt-1.5 text-[var(--imx-text-muted)]">
                        Un changement de numero desactive sa verification.
                      </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingContact(false)}
                        disabled={savingContact}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-primary)' }}
                      >
                        <X size={16} /> Annuler
                      </button>
                      <button type="submit" disabled={savingContact} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                        {savingContact ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
                        Enregistrer
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={openContactEditor}
                    className="w-full px-4 py-4 flex items-center justify-between hover:bg-[var(--imx-surface-2)] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.10)', color: '#60A5FA' }}>
                        <User size={15} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--imx-text-primary)] font-semibold truncate" style={{ fontFamily: 'Space Grotesk' }}>
                          Nom et telephone
                        </p>
                        <p className="text-xs text-[var(--imx-text-secondary)] truncate mt-0.5">
                          {profile.full_name} &middot; {profile.phone || 'Non renseigne'}
                        </p>
                      </div>
                    </div>
                    <Pencil size={15} className="flex-shrink-0 text-[var(--imx-text-muted)]" />
                  </button>
                )}
              </div>
            </div>

            {/* Mon espace */}
            <div>
              <SectionLabel>Mon espace</SectionLabel>
              <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
                <ProfilRow icon={<Home size={15} />} iconColor="#60A5FA" label="Mon logement et loyer" to="/dashboard" />
                <ProfilRow icon={<Receipt size={15} />} iconColor="#22C55E" label="Historique et quittances" to="/historique" />
                <ProfilRow icon={<ClipboardList size={15} />} iconColor="#F59E0B" label="Mes demandes envoyees" to="/mes-demandes" />
                <ProfilRow icon={<Heart size={15} />} iconColor="#EF4444" label="Mes favoris" to="/favoris" />
              </div>
            </div>

            {/* Securite */}
            <div>
              <SectionLabel>Securite</SectionLabel>
              <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
                <ProfilRow icon={<Wallet size={15} />} iconColor="#FBBF24" label="Numero Mobile Money" trailing={mmTrailing} to="/profil/mobile-money" />
                <ProfilRow icon={<KeyRound size={15} />} iconColor="#EF4444" label="Changer le mot de passe" to="/profil/mot-de-passe" />
                <ProfilRow icon={<Trash2 size={15} />} iconColor="#EF4444" label="Supprimer mon compte" onClick={() => setShowDeleteAccountConfirm(true)} />
              </div>
            </div>
          </>
        )}

        {/* Support et aide (commun aux deux roles) */}
        <div>
          <SectionLabel>Support &amp; aide</SectionLabel>
          <div className="card divide-y divide-[var(--imx-border)] overflow-hidden">
            <ProfilRow
              icon={<MessageCircle size={15} />}
              iconColor="#22C55E"
              label="Centre d'aide et WhatsApp"
              href="https://wa.me/22901291159?text=Bonjour%20ImoFlex%20Support"
            />
            <ProfilRow
              icon={<HelpCircle size={15} />}
              iconColor="#60A5FA"
              label="FAQ / Mode d'emploi"
              to="/aide"
            />
            <ProfilRow
              icon={<Star size={15} />}
              iconColor="#F59E0B"
              label="Noter l'application"
              href="https://wa.me/22901291159"
            />
          </div>
        </div>

        {/* Deconnexion */}
        <button
          onClick={() => setShowSignOutConfirm(true)}
          className="w-full flex items-center justify-center font-bold text-sm transition-all border text-[#EF4444] hover:bg-[#EF4444]/5"
          style={{ height: '52px', borderRadius: '16px', fontFamily: 'Sora', borderColor: 'rgba(239,68,68,0.4)' }}
        >
          Se deconnecter
        </button>

        {/* Mentions legales + version */}
        <div className="text-center pb-4 space-y-2">
          <button
            onClick={() => setLegalModalTab('terms')}
            className="text-[11px] text-[var(--imx-text-muted)] hover:text-[var(--imx-text-secondary)] transition-colors underline"
            style={{ fontFamily: 'Space Grotesk' }}
          >
            Conditions d'utilisation &amp; Confidentialite
          </button>
          <p className="text-[10px] text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>
            ImoFlex v1.0.0 &middot; Production
          </p>
        </div>
      </div>

      {/* Modal deconnexion */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="w-full max-w-[340px] rounded-[24px] p-6 shadow-2xl"
            style={{ background: 'var(--imx-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-nunito font-black text-lg text-[var(--imx-text-primary)] text-center mb-2">
              Se deconnecter ?
            </h3>
            <p className="text-sm text-center mb-6 text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
              Vous devrez vous reconnecter pour acceder a votre compte.
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
                Deconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal suppression compte */}
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
            <div className="flex flex-col items-center mb-5">
              <div
                className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-3"
                style={{ border: '2px solid rgba(239,68,68,0.3)' }}
              >
                <Trash2 size={28} className="text-[#EF4444]" />
              </div>
              <h3 className="font-nunito font-black text-[18px] text-[var(--imx-text-primary)] text-center">
                Supprimer mon compte
              </h3>
            </div>

            <div
              className="rounded-2xl p-4 mb-5 space-y-2.5"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#EF4444] uppercase tracking-wide" style={{ fontFamily: 'Space Grotesk' }}>
                <AlertTriangle size={14} /> Avant de continuer
              </div>
              {[
                'Toutes vos donnees personnelles seront supprimees.',
                'Vos annonces, demandes et historique seront anonymises.',
                'Cette action est irreversible - votre compte ne pourra pas etre recupere.',
                'Vous serez deconnecte(e) definitivement.',
              ].map((warn, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[#EF4444] text-[11px] mt-0.5 flex-shrink-0">-</span>
                  <p className="text-[12px] text-[var(--imx-text-secondary)] leading-snug" style={{ fontFamily: 'Space Grotesk' }}>
                    {warn}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-center text-[var(--imx-text-muted)] mb-5 leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
              En continuant, vous envoyez une demande de suppression a notre equipe. Votre compte sera traite sous 48h.
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
                {deletingAccount ? 'Suppression...' : 'Confirmer'}
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
