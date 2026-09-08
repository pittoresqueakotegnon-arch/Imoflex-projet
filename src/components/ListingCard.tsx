import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, MapPin, Building2, Bed, Zap } from 'lucide-react';
import { ListingSummary } from '../lib/supabase';
import { formatMontant } from '../lib/utils';
import StatusBadge from './StatusBadge';
import { OptimizedImage } from './OptimizedImage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface ListingCardProps {
  listing: ListingSummary;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  horizontal?: boolean; // mode carte horizontale (favoris)
  priority?: boolean; // charge l'image de manière eager
}

export const ListingCard: React.FC<ListingCardProps> = ({
  listing,
  isFavorite = false,
  onToggleFavorite,
  horizontal = false,
  priority = false,
}) => {
  const coverPhoto = listing.listing_photos?.find(p => p.is_cover) || listing.listing_photos?.[0];
  const isNew = listing.created_at && new Date(listing.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Derive thumb URL
  const getThumbUrl = (url?: string) => {
    if (!url) return null;
    // New format (base URL without extension) -> we append _thumb.webp
    if (!url.match(/\.[a-zA-Z0-9]+(\?.*)?$/)) {
      return `${url}_thumb.webp`;
    }
    // Old format fallback
    return `${url}?width=600&format=webp`;
  };
  const thumbUrl = getThumbUrl(coverPhoto?.photo_url);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Ignore if not on a device that supports haptics
    }
    onToggleFavorite?.();
  };

  // ── MODE HORIZONTAL (page Favoris) ─────────────────────────────────────
  if (horizontal) {
    return (
      <Link to={`/annonce/${listing.id}`} className="block">
        <div className="listing-card-h">
          {/* Image */}
          <div className="w-[130px] flex-shrink-0 bg-[var(--imx-surface-2)] relative overflow-hidden">
            {thumbUrl ? (
              <OptimizedImage 
                src={thumbUrl} 
                alt={listing.title} 
                loading={priority ? "eager" : "lazy"} 
                fetchPriority={priority ? "high" : "auto"}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--imx-text-muted)]">
                <Building2 size={32} />
              </div>
            )}
            {/* Status / New badge */}
            <div className="absolute top-2 left-2">
              {isNew ? (
                <span className="badge-new">Nouveau</span>
              ) : (
                <StatusBadge status={listing.availability_status} />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-3 flex flex-col justify-between min-w-0 relative">
            {/* Heart */}
            <button
              onClick={handleFavoriteClick}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-sm active:scale-75 transition-transform duration-200 z-10"
            >
              <Heart
                size={16}
                className={isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400'}
              />
            </button>

            <div className="pr-10 mb-1">
              <div className="font-nunito font-900 text-[var(--imx-accent)] text-sm mb-0.5">
                {formatMontant(listing.monthly_rent)} / mois
              </div>
              <h3 className="font-nunito font-800 text-[var(--imx-text-primary)] text-xs leading-tight line-clamp-2 mb-1">
                {listing.title}
              </h3>
              <div className="flex items-center gap-1 text-[var(--imx-text-secondary)]">
                <MapPin size={11} />
                <span className="text-[11px] line-clamp-1 font-space-grotesk">
                  {listing.neighborhood || listing.city}
                  {listing.neighborhood ? ` · ${listing.city}` : ''}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-auto">
              {listing.bedrooms && (
                <div className="flex items-center gap-1 text-[var(--imx-text-secondary)] text-[11px] bg-[var(--imx-surface-2)] px-2 py-1 rounded-md font-space-grotesk">
                  <Bed size={12} /> {listing.bedrooms} ch.
                </div>
              )}
              {listing.accepts_progressive_payment && (
                <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md px-2 py-1 text-[10px] font-bold flex items-center gap-1 w-fit">
                  <Zap size={10} className="fill-emerald-500" /> Échelonné
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // ── MODE VERTICAL (marketplace, annonces) ──────────────────────────────
  return (
    <Link to={`/annonce/${listing.id}`} className="block">
      <div className="card overflow-hidden">
        {/* Image - plus haute (210px) */}
        <div className="relative overflow-hidden bg-[var(--imx-surface-2)] h-[210px]">
          {thumbUrl ? (
            <OptimizedImage 
              src={thumbUrl} 
              alt={listing.title} 
              className="w-full h-full"
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--imx-text-muted)]">
              <Building2 size={48} />
            </div>
          )}

          {/* Badge VÉRIFIÉ / NOUVEAU — en haut à gauche */}
          <div className="absolute top-3 left-3">
            {isNew ? (
              <span className="badge-new bg-white/90 shadow-sm backdrop-blur-md">Nouveau</span>
            ) : (
              <StatusBadge status={listing.availability_status} />
            )}
          </div>

          {/* Bouton favori — en haut à droite, cercle blanc élégant */}
          <button
            onClick={handleFavoriteClick}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-md active:scale-75 transition-transform duration-200"
          >
            <Heart
              size={16}
              className={isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-400'}
            />
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 flex flex-col gap-1.5">
          {/* Prix très visible */}
          <div className="font-nunito font-900 text-[var(--imx-accent)] text-lg leading-none">
            {formatMontant(listing.monthly_rent)} <span className="text-[11px] font-bold text-[var(--imx-text-muted)] uppercase tracking-wider">/ mois</span>
          </div>
          
          <h3 className="font-nunito font-800 text-[var(--imx-text-primary)] text-sm leading-tight line-clamp-2 mt-0.5">
            {listing.title}
          </h3>
          
          <div className="flex items-center gap-1 text-[var(--imx-text-secondary)] mt-0.5">
            <MapPin size={12} />
            <span className="text-xs font-space-grotesk">
              {listing.neighborhood || listing.city}
              {listing.neighborhood ? ` · ${listing.city}` : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-1">
            {listing.bedrooms && (
              <div className="flex items-center gap-1.5 text-[var(--imx-text-secondary)] text-xs bg-[var(--imx-surface-2)] px-2 py-1 rounded-md font-space-grotesk">
                <Bed size={13} /> {listing.bedrooms} ch.
              </div>
            )}
            {listing.accepts_progressive_payment && (
              <div className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-md px-2 py-1 text-[10px] font-bold flex items-center gap-1 w-fit">
                <Zap size={11} className="fill-emerald-500" /> Paiement Échelonné
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ListingCard;
