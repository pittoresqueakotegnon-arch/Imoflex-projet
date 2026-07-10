import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, MapPin, Building2 } from 'lucide-react';
import { Listing } from '../lib/supabase';
import { formatMontant } from '../lib/utils';
import StatusBadge from './StatusBadge';

interface ListingCardProps {
  listing: Listing;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  horizontal?: boolean; // mode carte horizontale (favoris)
}

export const ListingCard: React.FC<ListingCardProps> = ({
  listing,
  isFavorite = false,
  onToggleFavorite,
  horizontal = false,
}) => {
  const coverPhoto = listing.listing_photos?.find(p => p.is_cover) || listing.listing_photos?.[0];
  const isNew = listing.created_at && new Date(listing.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onToggleFavorite?.();
  };

  // ── MODE HORIZONTAL (page Favoris) ─────────────────────────────────────
  if (horizontal) {
    return (
      <Link to={`/annonce/${listing.id}`} className="block">
        <div className="listing-card-h">
          {/* Image */}
          <div className="listing-card-h-img">
            {coverPhoto?.photo_url ? (
              <img src={coverPhoto.photo_url} alt={listing.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#4A3D7A]">
                <Building2 size={32} />
              </div>
            )}
            {/* Prix badge collé en bas de l'image */}
            <div
              className="absolute bottom-0 left-0 right-0 py-1.5 px-2 text-center"
              style={{ background: 'linear-gradient(0deg, rgba(123,63,228,0.95) 0%, rgba(123,63,228,0) 100%)' }}
            >
              <span className="text-white font-nunito font-900 text-xs">
                {formatMontant(listing.monthly_rent)} F/mois
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-3 flex flex-col justify-between min-w-0 relative">
            {/* Heart */}
            <button
              onClick={handleFavoriteClick}
              className="absolute top-3 right-3"
            >
              <Heart
                size={18}
                className={isFavorite ? 'fill-red-500 text-red-500' : 'text-[#4A3D7A]'}
              />
            </button>

            <div className="pr-6">
              <h3 className="font-nunito font-800 text-[#E8E0FF] text-sm leading-tight line-clamp-2 mb-1">
                {listing.title}
              </h3>
              <div className="flex items-center gap-1 text-[#8B7BB5]">
                <MapPin size={11} />
                <span className="text-xs line-clamp-1">
                  {listing.neighborhood || listing.city}
                  {listing.neighborhood ? ` · ${listing.city}` : ''}
                </span>
              </div>
            </div>

            {/* Progressive payment */}
            {listing.accepts_progressive_payment && (
              <div className="mt-2">
                <span className="badge badge-violet text-[10px]">ImoFlex ✓</span>
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // ── MODE VERTICAL (marketplace, annonces) ──────────────────────────────
  return (
    <Link to={`/annonce/${listing.id}`} className="block">
      <div className="card overflow-hidden" style={{ borderRadius: '20px' }}>
        {/* Image fixe 160px */}
        <div className="relative overflow-hidden bg-[#261C55]" style={{ height: '160px' }}>
          {coverPhoto?.photo_url ? (
            <img src={coverPhoto.photo_url} alt={listing.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#4A3D7A]">
              <Building2 size={48} />
            </div>
          )}

          {/* Badge VÉRIFIÉ / NOUVEAU — en haut à gauche */}
          <div className="absolute top-3 left-3">
            {isNew ? (
              <span className="badge badge-solid-violet">Nouveau</span>
            ) : (
              <StatusBadge status={listing.availability_status} />
            )}
          </div>

          {/* Bouton favori — en haut à droite */}
          <button
            onClick={handleFavoriteClick}
            className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: 'rgba(18, 13, 42, 0.7)', backdropFilter: 'blur(6px)' }}
          >
            <Heart
              size={16}
              className={isFavorite ? 'fill-red-500 text-red-500' : 'text-[#E8E0FF]'}
            />
          </button>

          {/* Prix — en bas à droite sur fond violet */}
          <div
            className="absolute bottom-3 right-3 px-3 py-1 rounded-lg"
            style={{ background: 'rgba(123, 63, 228, 0.92)', backdropFilter: 'blur(4px)' }}
          >
            <span className="font-nunito font-900 text-white text-xs">
              {formatMontant(listing.monthly_rent)} F/mois
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-3.5">
          <h3 className="font-nunito font-800 text-[#E8E0FF] text-sm leading-tight mb-1.5 line-clamp-2">
            {listing.title}
          </h3>
          <div className="flex items-center gap-1 text-[#8B7BB5]">
            <MapPin size={12} />
            <span className="text-xs">
              {listing.neighborhood || listing.city}
              {listing.neighborhood ? ` · ${listing.city}` : ''}
            </span>
          </div>
          {listing.accepts_progressive_payment && (
            <div className="mt-2">
              <span className="badge badge-violet text-[10px]">✓ Paiement progressif ImoFlex</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ListingCard;
