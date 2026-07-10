import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, MapPin, Building2, Bed, Wallet, Coins, Zap, Droplets, Car, Wifi } from 'lucide-react';
import { useListing } from '../../hooks/useListings';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import EmptyState from '../../components/EmptyState';
import { formatMontant } from '../../lib/utils';

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  electricity: <Zap size={14} />,
  electricite: <Zap size={14} />,
  water:       <Droplets size={14} />,
  eau:         <Droplets size={14} />,
  parking:     <Car size={14} />,
  wifi:        <Wifi size={14} />,
};

const Annonce: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const { listing, loading, error } = useListing(id!);

  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
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

  const handleToggleFavorite = () => {
    if (!user) {
      showToast('Connectez-vous pour ajouter à vos favoris', 'info');
      navigate('/login');
      return;
    }
    setIsFavorite(!isFavorite);
    showToast(isFavorite ? 'Retiré des favoris' : 'Ajouté aux favoris', 'success');
  };

  const handleContactClick = () => {
    if (!user) {
      showToast('Connectez-vous pour contacter le propriétaire', 'info');
      navigate('/login');
      return;
    }
    navigate(`/contact/${listing?.id}`);
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="h-56 bg-[#1A1240] animate-pulse" />
        <div className="px-4 py-4 space-y-3">
          <div className="h-6 bg-[#1A1240] rounded animate-pulse" />
          <div className="h-20 bg-[#1A1240] rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <EmptyState
        icon={<Building2 size={48} className="text-[#8B7BB5]" />}
        title="Annonce non trouvée"
        description="Cette annonce n'existe pas ou a été supprimée."
        action={{ label: 'Retour au marché', href: '/' }}
      />
    );
  }

  const photos = listing.listing_photos || [];
  const currentPhoto = photos[currentPhotoIndex];

  const statusConfig = {
    disponible: { label: 'DISPONIBLE', className: 'badge-solid-green' },
    reserve:    { label: 'RÉSERVÉ',    className: 'badge-solid-amber' },
    occupe:     { label: 'OCCUPÉ',     className: 'badge-solid-amber' },
  }[listing.availability_status] ?? { label: 'N/A', className: 'badge-dim' };

  return (
    <div className="page-container pb-24">
      {/* ── Header ────────────────────────────────────────── */}
      <header className="sticky-header px-4 py-3.5 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="text-[#E8E0FF] hover:text-[#A855F7] transition-colors p-1 -ml-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button
          onClick={handleToggleFavorite}
          className="text-[#E8E0FF] hover:text-[#A855F7] transition-colors p-1 -mr-1"
        >
          <Heart size={22} className={isFavorite ? 'fill-red-500 text-red-500' : ''} />
        </button>
      </header>

      {/* ── Carousel photo ────────────────────────────────── */}
      <div
        className="w-full bg-[#261C55] relative overflow-hidden"
        style={{ height: '240px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {photos.length > 0 ? (
          <>
            <img
              src={currentPhoto.photo_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
            />
            <img
              src={currentPhoto.photo_url}
              alt={`Photo ${currentPhotoIndex + 1}`}
              className="relative w-full h-full object-contain"
            />
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
          <div className="w-full h-full flex flex-col items-center justify-center text-[#4A3D7A]">
            <Building2 size={48} />
            <span className="text-sm mt-2">Pas de photo</span>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {photos.length > 1 && (
        <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              onClick={() => setCurrentPhotoIndex(idx)}
              className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all"
              style={{
                border: `2px solid ${idx === currentPhotoIndex ? '#A855F7' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              <img src={photo.photo_url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── Prix & infos ──────────────────────────────────── */}
      <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(123,63,228,0.1)' }}>
        <div className="flex items-end justify-between mb-2">
          <div>
            <span className="font-nunito font-900 text-3xl text-white" style={{ letterSpacing: '-0.02em' }}>
              {formatMontant(listing.monthly_rent)}
            </span>
            <span className="text-[#8B7BB5] text-sm ml-1" style={{ fontFamily: 'Space Grotesk' }}>FCFA/mois</span>
          </div>
          <span className={statusConfig.className}>{statusConfig.label}</span>
        </div>
        <h1 className="font-nunito font-800 text-xl text-[#E8E0FF] mb-1.5">{listing.title}</h1>
        <div className="flex items-center gap-1 text-[#8B7BB5]">
          <MapPin size={13} />
          <span className="text-xs" style={{ fontFamily: 'Space Grotesk' }}>
            {listing.city}{listing.neighborhood && `, ${listing.neighborhood}`}
          </span>
        </div>
      </div>

      {/* ── Stats ─────────────────────────────────────────── */}
      <div className="px-4 py-4 grid grid-cols-3 gap-2.5" style={{ borderBottom: '1px solid rgba(123,63,228,0.1)' }}>
        {listing.bedrooms && (
          <div className="stat-box items-center text-center">
            <Bed size={18} className="text-[#A855F7] mb-1" />
            <span className="font-nunito font-800 text-white text-base">{listing.bedrooms}</span>
            <span className="text-[#8B7BB5] text-[11px]">Chambre{listing.bedrooms > 1 ? 's' : ''}</span>
          </div>
        )}
        {listing.deposit_amount && (
          <div className="stat-box items-center text-center">
            <Wallet size={18} className="text-[#A855F7] mb-1" />
            <span className="font-nunito font-800 text-white text-sm">{formatMontant(listing.deposit_amount)}</span>
            <span className="text-[#8B7BB5] text-[11px]">Caution</span>
          </div>
        )}
        {listing.advance_amount && (
          <div className="stat-box items-center text-center">
            <Coins size={18} className="text-[#A855F7] mb-1" />
            <span className="font-nunito font-800 text-white text-sm">{formatMontant(listing.advance_amount)}</span>
            <span className="text-[#8B7BB5] text-[11px]">Avance</span>
          </div>
        )}
      </div>

      {/* ── Équipements ───────────────────────────────────── */}
      {listing.amenities && listing.amenities.length > 0 && (
        <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(123,63,228,0.1)' }}>
          <div className="flex flex-wrap gap-2">
            {listing.amenities.map((amenity) => (
              <div
                key={amenity}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#E8E0FF] text-xs"
                style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <span className="text-[#A855F7]">
                  {AMENITY_ICONS[amenity.toLowerCase()] || <Building2 size={13} />}
                </span>
                {amenity}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Paiement progressif ───────────────────────────── */}
      {listing.accepts_progressive_payment && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 text-[#A855F7] text-sm">
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
        <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(123,63,228,0.1)' }}>
          <h2 className="font-nunito font-800 text-[#E8E0FF] text-base mb-2">Description</h2>
          <p className="text-[#8B7BB5] text-sm leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Space Grotesk' }}>
            {listing.description}
          </p>
        </div>
      )}

      {/* ── Barre bas fixe ────────────────────────────────── */}
      <div
        className="fixed bottom-0 flex gap-2 items-center"
        style={{
          left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '390px',
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px)) 16px',
          background: 'rgba(18,13,42,0.97)',
          borderTop: '1px solid rgba(123,63,228,0.15)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <button
          onClick={handleToggleFavorite}
          className="btn-icon flex-shrink-0"
          style={{ borderRadius: '14px', width: '48px', height: '48px', minWidth: '48px' }}
        >
          <Heart size={20} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-[#E8E0FF]'} />
        </button>
        <button
          onClick={handleContactClick}
          className="btn-primary flex-1 min-w-0"
          style={{ height: '48px', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          Demander une visite
        </button>
      </div>
    </div>
  );
};

export default Annonce;
