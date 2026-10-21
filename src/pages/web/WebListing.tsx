import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  MapPin, Building2, Bed, Zap, Droplets, Car, Wifi,
  Snowflake, Armchair, ShieldCheck, ChevronLeft, ChevronRight,
  Heart, Share2, ArrowLeft, MessageSquare,
  CheckCircle2, Clock, Home
} from 'lucide-react';
import { useListing } from '../../hooks/useListings';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { formatMontant, getOptimizedUrl, propertyTypeLabel } from '../../lib/utils';
import { getShareUrl } from '../../lib/domainConfig';

/* ─────────────────────────────────────────────────────────────
   WebListing — Fiche détaillée d'une annonce (version web)
───────────────────────────────────────────────────────────── */

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  electricity:   <Zap size={15} />,
  electricite:   <Zap size={15} />,
  'électricité': <Zap size={15} />,
  water:         <Droplets size={15} />,
  eau:           <Droplets size={15} />,
  'eau courante': <Droplets size={15} />,
  parking:       <Car size={15} />,
  wifi:          <Wifi size={15} />,
  climatisation: <Snowflake size={15} />,
  meuble:        <Armchair size={15} />,
  'meublé':      <Armchair size={15} />,
  securite:      <ShieldCheck size={15} />,
  'sécurité':    <ShieldCheck size={15} />,
};

export default function WebListing() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { listing, loading, error } = useListing(id!);

  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isOwnerVerified, setIsOwnerVerified] = useState(false);
  const [favLoading, setFavLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const photos = listing?.listing_photos ?? [];

  // Charger statut favori
  useEffect(() => {
    if (!user || !id) return;
    supabase
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('listing_id', id)
      .maybeSingle()
      .then(({ data }) => setIsFavorite(!!data));
  }, [user, id]);

  // Vérifier si le propriétaire est vérifié
  useEffect(() => {
    if (!listing?.owner_id) return;
    supabase
      .from('users')
      .select('owner_verification_status')
      .eq('id', listing.owner_id)
      .maybeSingle()
      .then(({ data }) => setIsOwnerVerified(data?.owner_verification_status === 'verifie'));
  }, [listing?.owner_id]);

  const toggleFavorite = useCallback(async () => {
    if (!user) { navigate('/web/login'); return; }
    if (favLoading) return;
    setFavLoading(true);
    try {
      if (isFavorite) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('listing_id', id);
        setIsFavorite(false);
      } else {
        await supabase.from('favorites').upsert({ user_id: user.id, listing_id: id }, { onConflict: 'user_id,listing_id' });
        setIsFavorite(true);
      }
    } finally {
      setFavLoading(false);
    }
  }, [user, id, isFavorite, favLoading, navigate]);

  const handleShare = () => {
    const urlToCopy = id ? getShareUrl(`/web/annonce/${id}`) : getShareUrl();
    navigator.clipboard.writeText(urlToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-80 rounded-2xl" style={{ background: 'var(--imx-surface-2)' }} />
          <div className="h-6 rounded w-2/3" style={{ background: 'var(--imx-surface-2)' }} />
          <div className="h-4 rounded w-1/3" style={{ background: 'var(--imx-surface-2)' }} />
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-8">
        <Building2 size={40} style={{ color: 'var(--imx-text-muted)' }} className="mb-3 opacity-30" />
        <p className="font-semibold mb-1" style={{ color: 'var(--imx-text-primary)' }}>
          Annonce introuvable
        </p>
        <p className="text-sm mb-4" style={{ color: 'var(--imx-text-muted)' }}>
          Cette annonce n'existe pas ou a été supprimée.
        </p>
        <Link to="/web/annonces" className="text-sm font-medium" style={{ color: 'var(--imx-accent)' }}>
          ← Retour aux annonces
        </Link>
      </div>
    );
  }

  const mainPhoto = photos[currentPhotoIdx];
  const mainImgUrl = mainPhoto ? getOptimizedUrl(mainPhoto.photo_url, 'hd') : null;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-5" style={{ color: 'var(--imx-text-muted)' }}>
        <Link to="/web" className="hover:underline">Accueil</Link>
        <span>/</span>
        <Link to="/web/annonces" className="hover:underline">Annonces</Link>
        <span>/</span>
        <span className="truncate max-w-xs" style={{ color: 'var(--imx-text-primary)' }}>{listing.title}</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-8">

        {/* ── Left column: photos + details ── */}
        <div className="flex-1 min-w-0">

          {/* Photo gallery */}
          <div className="relative rounded-2xl overflow-hidden mb-4" style={{ height: '360px', background: 'var(--imx-surface-2)' }}>
            {mainImgUrl ? (
              <img
                src={mainImgUrl}
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 size={60} style={{ color: 'var(--imx-border)' }} />
              </div>
            )}

            {/* Navigation arrows */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentPhotoIdx(i => Math.max(0, i - 1))}
                  disabled={currentPhotoIdx === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCurrentPhotoIdx(i => Math.min(photos.length - 1, i + 1))}
                  disabled={currentPhotoIdx === photos.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
                  style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
                >
                  <ChevronRight size={20} />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {photos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPhotoIdx(i)}
                      className="rounded-full transition-all"
                      style={{
                        width: i === currentPhotoIdx ? '20px' : '6px',
                        height: '6px',
                        background: i === currentPhotoIdx ? 'white' : 'rgba(255,255,255,0.5)',
                      }}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Status badge */}
            <div className="absolute top-3 left-3">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={
                  listing.availability_status === 'disponible'
                    ? { background: '#10B981', color: '#fff' }
                    : { background: 'rgba(0,0,0,0.6)', color: '#fff' }
                }
              >
                {listing.availability_status === 'disponible' ? 'Disponible' : 'Réservé'}
              </span>
            </div>

            {/* Actions */}
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                onClick={toggleFavorite}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'rgba(0,0,0,0.5)', color: isFavorite ? '#EF4444' : '#fff' }}
              >
                <Heart size={16} fill={isFavorite ? '#EF4444' : 'transparent'} />
              </button>
              <button
                onClick={handleShare}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
              >
                {copied ? <CheckCircle2 size={16} /> : <Share2 size={16} />}
              </button>
            </div>
          </div>

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              {photos.map((photo, i) => {
                const url = getOptimizedUrl(photo.photo_url, 'thumb');
                return (
                  <button
                    key={photo.id}
                    onClick={() => setCurrentPhotoIdx(i)}
                    className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all"
                    style={{
                      border: i === currentPhotoIdx
                        ? '2px solid var(--imx-accent)'
                        : '2px solid var(--imx-border)',
                    }}
                  >
                    {url && <img src={url} alt="" className="w-full h-full object-cover" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Title and location */}
          <h1
            className="text-2xl lg:text-3xl font-black mb-2"
            style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}
          >
            {listing.title}
          </h1>

          <div className="flex items-center gap-1.5 mb-6">
            <MapPin size={15} style={{ color: 'var(--imx-accent)' }} />
            <span className="text-sm" style={{ color: 'var(--imx-text-secondary)' }}>
              {listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}
            </span>
            {listing.address && (
              <span className="text-sm" style={{ color: 'var(--imx-text-muted)' }}>
                — {listing.address}
              </span>
            )}
          </div>

          {/* Quick info chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)' }}>
              <Home size={14} />
              {propertyTypeLabel(listing.property_type)}
            </span>
            {listing.bedrooms && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)' }}>
                <Bed size={14} />
                {listing.bedrooms} chambre{listing.bedrooms > 1 ? 's' : ''}
              </span>
            )}
            {listing.accepts_progressive_payment && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold" style={{ background: 'var(--imx-accent)', color: '#fff' }}>
                <Zap size={14} />
                Paiement progressif
              </span>
            )}
            {isOwnerVerified && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium" style={{ background: '#ECFDF5', color: '#10B981' }}>
                <ShieldCheck size={14} />
                Propriétaire vérifié
              </span>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <div className="mb-6">
              <h2 className="font-bold text-[15px] mb-2" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
                Description
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--imx-text-secondary)', whiteSpace: 'pre-wrap' }}>
                {listing.description}
              </p>
            </div>
          )}

          {/* Amenities */}
          {listing.amenities && listing.amenities.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-[15px] mb-3" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
                Équipements et services
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {listing.amenities.map(a => (
                  <div
                    key={a}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                    style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)' }}
                  >
                    <span style={{ color: 'var(--imx-accent)' }}>
                      {AMENITY_ICONS[a.toLowerCase()] ?? <CheckCircle2 size={14} />}
                    </span>
                    {a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* House rules */}
          {listing.house_rules && (
            <div>
              <h2 className="font-bold text-[15px] mb-2" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
                Règles de la maison
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--imx-text-secondary)', whiteSpace: 'pre-wrap' }}>
                {listing.house_rules}
              </p>
            </div>
          )}
        </div>

        {/* ── Right column: price + CTA ── */}
        <div className="lg:w-80 flex-shrink-0">
          <div
            className="sticky top-4 rounded-2xl p-5"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: 'var(--imx-card-shadow)' }}
          >
            {/* Price */}
            <div className="mb-4">
              <p className="text-3xl font-black" style={{ color: 'var(--imx-accent)', fontFamily: 'Sora' }}>
                {formatMontant(listing.monthly_rent)}
              </p>
              <p className="text-sm" style={{ color: 'var(--imx-text-muted)' }}>par mois</p>
            </div>

            {/* Deposit / Advance */}
            {(listing.deposit_amount || listing.advance_amount) && (
              <div className="space-y-2 mb-4 pb-4" style={{ borderBottom: '1px solid var(--imx-border)' }}>
                {listing.deposit_amount && listing.deposit_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--imx-text-muted)' }}>Caution</span>
                    <span className="font-medium" style={{ color: 'var(--imx-text-primary)' }}>
                      {formatMontant(listing.deposit_amount)}
                    </span>
                  </div>
                )}
                {listing.advance_amount && listing.advance_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--imx-text-muted)' }}>Avance</span>
                    <span className="font-medium" style={{ color: 'var(--imx-text-primary)' }}>
                      {formatMontant(listing.advance_amount)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Progressive info */}
            {listing.accepts_progressive_payment && (
              <div
                className="flex items-start gap-2 p-3 rounded-xl mb-4 text-sm"
                style={{ background: 'rgba(123,63,228,0.08)', border: '1px solid rgba(123,63,228,0.2)' }}
              >
                <Zap size={16} style={{ color: 'var(--imx-accent)', flexShrink: 0, marginTop: '1px' }} />
                <p style={{ color: 'var(--imx-text-secondary)' }}>
                  Ce logement accepte le paiement progressif — payez en plusieurs fois par Mobile Money.
                </p>
              </div>
            )}

            {/* CTA */}
            {listing.availability_status === 'disponible' ? (
              <Link
                to={user ? `/contact/${listing.id}` : '/web/login'}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:opacity-90 mb-3"
                style={{ background: 'var(--imx-accent)' }}
              >
                <MessageSquare size={16} />
                Contacter le propriétaire
              </Link>
            ) : (
              <div
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-semibold text-sm mb-3"
                style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-muted)' }}
              >
                <Clock size={16} />
                Logement non disponible
              </div>
            )}

            {!user && (
              <p className="text-xs text-center" style={{ color: 'var(--imx-text-muted)' }}>
                <Link to="/web/login" className="underline" style={{ color: 'var(--imx-accent)' }}>Connectez-vous</Link>
                {' '}pour contacter le propriétaire
              </p>
            )}

            {/* Back */}
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm transition-colors mt-3 hover:bg-[var(--imx-surface-2)]"
              style={{ color: 'var(--imx-text-secondary)', border: '1px solid var(--imx-border)' }}
            >
              <ArrowLeft size={14} />
              Retour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
