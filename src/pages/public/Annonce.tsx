import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, MapPin, Building2, Bed, Wallet, Coins, Zap, Droplets, Car, Wifi, ChevronLeft, ChevronRight, Snowflake, Armchair, ShieldCheck, Sparkles, Share2 } from 'lucide-react';
import { useListing } from '../../hooks/useListings';
import { useToast } from '../../components/Toast';
import { useAuthGate } from '../../hooks/useAuthGate';
import { AuthGateModal } from '../../components/AuthGateModal';
import EmptyState from '../../components/EmptyState';
import ImageGalleryModal from '../../components/ImageGalleryModal';
import { OptimizedImage } from '../../components/OptimizedImage';
import { formatMontant, getOptimizedUrl } from '../../lib/utils';
import { haptics } from '../../lib/haptics';
import { Share } from '@capacitor/share';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  electricity: <Zap size={14} />,
  electricite: <Zap size={14} />,
  'électricité': <Zap size={14} />,
  water:       <Droplets size={14} />,
  eau:         <Droplets size={14} />,
  'eau courante': <Droplets size={14} />,
  parking:     <Car size={14} />,
  wifi:        <Wifi size={14} />,
  climatisation: <Snowflake size={14} />,
  meuble:      <Armchair size={14} />,
  'meublé':    <Armchair size={14} />,
  securite:    <ShieldCheck size={14} />,
  'sécurité':  <ShieldCheck size={14} />,
  balcon:      <Building2 size={14} />,
};

const Annonce: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { requireAuth, isModalOpen, closeModal, modalReason } = useAuthGate();
  const { user } = useAuth();

  const { listing, loading, error } = useListing(id!);

  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStart === null) return;
      const diff = touchStart - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        const photos = listing?.listing_photos || [];
        if (diff > 0 && currentPhotoIndex < photos.length - 1) {
          setCurrentPhotoIndex(currentPhotoIndex + 1);
        } else if (diff < 0 && currentPhotoIndex > 0) {
          setCurrentPhotoIndex(currentPhotoIndex - 1);
        }
      }
      setTouchStart(null);
    },
    [touchStart, currentPhotoIndex, listing?.listing_photos]
  );

  useEffect(() => {
    const checkFavorite = async () => {
      if (user?.id && listing?.id) {
        const { data } = await supabase.from('favorites').select('listing_id').eq('user_id', user.id).eq('listing_id', listing.id);
        setIsFavorite(data !== null && data.length > 0);
      } else if (listing?.id) {
        const stored = localStorage.getItem('favorites');
        if (stored) {
          const favs: string[] = JSON.parse(stored);
          setIsFavorite(favs.includes(listing.id));
        }
      }
    };
    checkFavorite();
  }, [user, listing?.id]);

  const handleToggleFavorite = async () => {
    if (!listing?.id) return;
    const newIsFavorite = !isFavorite;
    setIsFavorite(newIsFavorite);
    showToast(newIsFavorite ? 'Ajouté aux favoris' : 'Retiré des favoris', 'success');

    if (!user?.id) {
      const stored = localStorage.getItem('favorites');
      const favs: string[] = stored ? JSON.parse(stored) : [];
      const updatedFavs = newIsFavorite ? [...favs, listing.id] : favs.filter(id => id !== listing.id);
      localStorage.setItem('favorites', JSON.stringify(updatedFavs));
      return;
    }

    try {
      if (newIsFavorite) {
        await supabase.from('favorites').upsert({ user_id: user.id, listing_id: listing.id }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
      } else {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('listing_id', listing.id);
      }
    } catch (err) {
      console.warn('Favorite sync error:', err);
      setIsFavorite(isFavorite);
    }
  };

  const handleContactClick = () => {
    requireAuth(() => {
      navigate(`/contact/${listing?.id}`);
    }, 'contact');
  };

  const photosForPreload = React.useMemo(() => listing?.listing_photos || [], [listing?.listing_photos]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-56 bg-[var(--imx-surface)] animate-pulse" />
        <div className="px-5 py-4 space-y-3">
          <div className="h-6 bg-[var(--imx-surface)] rounded animate-pulse" />
          <div className="h-20 bg-[var(--imx-surface)] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <EmptyState
        icon={<Building2 size={48} className="text-[var(--imx-text-secondary)]" />}
        title="Annonce non trouvée"
        description="Cette annonce n'existe pas ou a été supprimée."
        action={{ label: 'Retour au marché', href: '/' }}
      />
    );
  }

  const photos = photosForPreload;
  const currentPhoto = photos[currentPhotoIndex];

  const isAvailable = listing.availability_status === 'disponible';

  const statusConfig = {
    disponible: { label: 'VÉRIFIÉ ✓', className: 'px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 backdrop-blur-sm' },
    reserve:    { label: 'INDISPONIBLE',    className: 'px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30 backdrop-blur-sm' },
    occupe:     { label: 'OCCUPÉ',     className: 'px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30 backdrop-blur-sm' },
  }[listing.availability_status] ?? { label: 'N/A', className: 'px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wide bg-white/10 text-white/70 border border-white/20 backdrop-blur-sm' };

  const handleShare = async () => {
    haptics.light();
    try {
      await Share.share({
        title: listing?.title || 'Annonce ImoFlex',
        text: `Découvre ce logement sur ImoFlex : ${listing?.title} à ${listing?.city}`,
        url: window.location.href,
        dialogTitle: 'Partager cette annonce',
      });
    } catch (error) {
      console.error('Erreur lors du partage:', error);
    }
  };

  return (
    <div className="page-container pb-24">
      {/* ── Photo & Boutons flottants ─────────────────────── */}
      <div
        className="w-full bg-[var(--imx-surface-2)] relative overflow-hidden rounded-b-[32px] shadow-sm"
        style={{ height: '320px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Boutons flottants superposés */}
        <div
          className="absolute left-4 right-4 z-10 flex items-center justify-between pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
        >
          <button
            onClick={() => { haptics.light(); navigate(-1); }}
            aria-label="Retour au marché"
            className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full text-[var(--imx-text-primary)] bg-white/90 backdrop-blur-md border border-[var(--imx-border)] hover:bg-white transition-all shadow-sm active:scale-95"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              aria-label="Partager"
              className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center text-[var(--imx-text-primary)] bg-white/90 backdrop-blur-md border border-[var(--imx-border)] hover:bg-white transition-all shadow-sm active:scale-95"
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={handleToggleFavorite}
              aria-label="Favoris"
              className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center text-[var(--imx-text-primary)] bg-white/90 backdrop-blur-md border border-[var(--imx-border)] hover:bg-white transition-all shadow-sm active:scale-95"
            >
              <Heart size={20} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
            </button>
          </div>
        </div>

        {photos.length > 0 && currentPhoto ? (
          <>
            <OptimizedImage
              src={getOptimizedUrl(currentPhoto?.photo_url, 'medium') || ''}
              alt={`Photo ${currentPhotoIndex + 1}`}
              className="relative w-full h-full object-cover cursor-pointer"
              loading="eager"
              fetchPriority="high"
              onClick={() => {
                haptics.light();
                setIsGalleryOpen(true);
              }}
            />
            {/* Flèches de navigation carrousel image (gauche & droite) */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPhotoIndex((prev) => (prev === 0 ? photos.length - 1 : prev - 1));
                  }}
                  aria-label="Photo précédente"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/80 bg-black/40 backdrop-blur-sm border border-white/10 hover:bg-black/60 hover:text-white transition-all shadow-md active:scale-95"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPhotoIndex((prev) => (prev === photos.length - 1 ? 0 : prev + 1));
                  }}
                  aria-label="Photo suivante"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center text-white/80 bg-black/40 backdrop-blur-sm border border-white/10 hover:bg-black/60 hover:text-white transition-all shadow-md active:scale-95"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
            {/* Compteur photos */}
            {photos.length > 1 && (
              <div
                className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg text-white text-xs font-grotesk"
                style={{ background: 'rgba(18,13,42,0.8)', backdropFilter: 'blur(6px)' }}
              >
                {currentPhotoIndex + 1}/{photos.length}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-[var(--imx-text-muted)]">
            <Building2 size={48} />
            <span className="text-sm mt-2">Pas de photo</span>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {photos.length > 1 && (
        <div className="px-5 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              onClick={() => setCurrentPhotoIndex(idx)}
              className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all ${
                idx === currentPhotoIndex
                  ? 'ring-2 ring-[var(--imx-accent-light)] ring-offset-2 ring-offset-[#120D2A] shadow-[0_0_12px_rgba(168,85,247,0.5)]'
                  : 'opacity-50 hover:opacity-100 border border-white/10'
              }`}
            >
              <OptimizedImage src={getOptimizedUrl(photo.photo_url, 'thumb') || ''} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── Prix & infos ──────────────────────────────────── */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(123,63,228,0.1)' }}>
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className="font-nunito font-900 text-3xl text-[var(--imx-text-primary)]" style={{ letterSpacing: '-0.02em' }}>
              {listing.monthly_rent.toLocaleString('fr-FR')}
            </span>
            <span className="text-[var(--imx-text-secondary)] text-sm ml-1" style={{ fontFamily: 'Space Grotesk' }}>FCFA/mois</span>
          </div>
          <span className={statusConfig.className}>{statusConfig.label}</span>
        </div>
        <h1 className="font-nunito font-800 text-xl text-[var(--imx-text-primary)] mb-1.5">{listing.title}</h1>
        <div className="flex items-center gap-1 text-[var(--imx-text-secondary)]">
          <MapPin size={13} />
          <span className="text-xs" style={{ fontFamily: 'Space Grotesk' }}>
            {listing.city}{listing.neighborhood && `, ${listing.neighborhood}`}
          </span>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div className="px-5 py-4 grid grid-cols-3 gap-2.5" style={{ borderBottom: '1px solid var(--imx-border)' }}>
        {listing.bedrooms && (
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[var(--imx-surface)] border border-[var(--imx-border)] shadow-sm">
            <Bed size={18} className="text-[var(--imx-accent)] mb-1" />
            <span className="font-nunito font-800 text-[var(--imx-text-primary)] text-base">{listing.bedrooms}</span>
            <span className="text-[var(--imx-text-secondary)] text-[11px] font-space-grotesk">Chambre{listing.bedrooms > 1 ? 's' : ''}</span>
          </div>
        )}
        {listing.deposit_amount && (
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[var(--imx-surface)] border border-[var(--imx-border)] shadow-sm">
            <Wallet size={18} className="text-[var(--imx-accent)] mb-1" />
            <span className="font-nunito font-800 text-[var(--imx-text-primary)] text-sm">{formatMontant(listing.deposit_amount)}</span>
            <span className="text-[var(--imx-text-secondary)] text-[11px] font-space-grotesk">Caution</span>
          </div>
        )}
        {listing.advance_amount && (
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[var(--imx-surface)] border border-[var(--imx-border)] shadow-sm">
            <Coins size={18} className="text-[var(--imx-accent)] mb-1" />
            <span className="font-nunito font-800 text-[var(--imx-text-primary)] text-sm">{formatMontant(listing.advance_amount)}</span>
            <span className="text-[var(--imx-text-secondary)] text-[11px] font-space-grotesk">Avance</span>
          </div>
        )}
      </div>

      {/* ── Équipements ───────────────────────────────────── */}
      {listing.amenities && listing.amenities.length > 0 && (
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(123,63,228,0.1)' }}>
          <div className="flex flex-wrap gap-2">
            {listing.amenities.map((amenity) => (
              <div
                key={amenity}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[var(--imx-text-primary)] text-xs"
                style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
              >
                <span className="text-[var(--imx-accent-light)]">
                  {AMENITY_ICONS[amenity.toLowerCase()] || <Sparkles size={13} />}
                </span>
                {amenity}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Charges incluses ──────────────────────────────── */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--imx-border)' }}>
        <h2 className="font-nunito font-800 text-[var(--imx-text-primary)] text-[15px] mb-3">Charges & Compteurs</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[var(--imx-surface)] border border-[var(--imx-border)]">
            <Droplets size={20} className="text-[#3B82F6] mb-1.5" />
            <span className="text-[10px] font-bold text-[var(--imx-text-secondary)] uppercase tracking-wider font-space-grotesk text-center">Eau</span>
            <span className="text-[12px] font-bold text-[var(--imx-text-primary)] font-nunito mt-0.5">Forfaitaire</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[var(--imx-surface)] border border-[var(--imx-border)]">
            <Zap size={20} className="text-[#F59E0B] mb-1.5" />
            <span className="text-[10px] font-bold text-[var(--imx-text-secondary)] uppercase tracking-wider font-space-grotesk text-center">Électricité</span>
            <span className="text-[12px] font-bold text-[var(--imx-text-primary)] font-nunito mt-0.5">Cash-Power</span>
          </div>
          <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[var(--imx-surface)] border border-[var(--imx-border)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mb-1.5">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            <span className="text-[10px] font-bold text-[var(--imx-text-secondary)] uppercase tracking-wider font-space-grotesk text-center">Vidange</span>
            <span className="text-[12px] font-bold text-[var(--imx-text-primary)] font-nunito mt-0.5">Propriétaire</span>
          </div>
        </div>
      </div>

      {/* ── Paiement progressif ───────────────────────────── */}
      {listing.accepts_progressive_payment && (
        <div className="px-5 py-3">
          <div className="flex items-center gap-2 text-[var(--imx-accent-light)] text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}>
              Paiement progressif ImoFlex disponible
            </span>
          </div>
        </div>
      )}

      {/* ── Description ───────────────────────────────────── */}
      {listing.description && (
        <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(123,63,228,0.1)' }}>
          <h2 className="font-nunito font-800 text-[var(--imx-text-primary)] text-base mb-2">Description</h2>
          <p className="text-[var(--imx-text-secondary)] text-sm leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Space Grotesk' }}>
            {listing.description}
          </p>
        </div>
      )}

      {/* ── Barre bas fixe ────────────────────────────────── */}
      <div
        className="fixed bottom-0 flex gap-3 items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{
          left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '430px',
          padding: '16px 20px calc(16px + env(safe-area-inset-bottom, 0px)) 20px',
          background: 'var(--imx-nav-bg)',
          borderTop: '1px solid var(--imx-border)',
          backdropFilter: 'blur(12px)',
          zIndex: 40
        }}
      >
        <button
          onClick={handleToggleFavorite}
          className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[var(--imx-surface)] border border-[var(--imx-border)] active:scale-95 transition-transform shadow-sm"
        >
          <Heart size={24} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
        </button>
        <button
          onClick={isAvailable ? handleContactClick : undefined}
          disabled={!isAvailable}
          className={`flex-1 h-14 rounded-2xl font-nunito font-900 text-[15px] flex items-center justify-center transition-all ${
            isAvailable 
              ? 'btn-primary'
              : 'bg-[var(--imx-surface-2)] text-[var(--imx-text-muted)] border border-[var(--imx-border)] cursor-not-allowed'
          }`}
        >
          {isAvailable ? 'Demander une visite' : 'Logement indisponible'}
        </button>
      </div>

      {/* Image Gallery Modal */}
      <ImageGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        photos={photos}
        initialIndex={currentPhotoIndex}
      />

      {/* AuthGateModal — déclenchée pour favoris et contact en mode visiteur */}
      <AuthGateModal isOpen={isModalOpen} onClose={closeModal} reason={modalReason} />
    </div>
  );
};

export default Annonce;
