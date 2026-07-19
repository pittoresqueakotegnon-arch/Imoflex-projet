import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useListings } from '../../hooks/useListings';
import { useToast } from '../../components/Toast';
import ListingCard from '../../components/ListingCard';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { supabase, PropertyType } from '../../lib/supabase';
import { propertyTypeLabel } from '../../lib/utils';

const PROPERTY_TYPES: { type: PropertyType; label: string }[] = [
  { type: 'studio', label: 'Studio' },
  { type: 'appartement', label: 'Appart' },
  { type: 'chambre', label: 'Chambre' },
  { type: 'maison', label: 'Maison' },
];

const Marketplace: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<PropertyType | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<'recent' | 'price_asc' | 'price_desc'>('recent');

  const filterParams = useMemo(() => {
    const types = searchParams.get('types')?.split(',').filter(t => t) as PropertyType[] | undefined;
    const city = searchParams.get('city');
    const minRent = searchParams.get('minRent') ? parseInt(searchParams.get('minRent')!) : undefined;
    const maxRent = searchParams.get('maxRent') ? parseInt(searchParams.get('maxRent')!) : undefined;
    const bedrooms = searchParams.get('bedrooms') ? parseInt(searchParams.get('bedrooms')!) : undefined;
    const available = searchParams.get('available') === 'true';
    const progressive = searchParams.get('progressive') === 'true';
    return { types, city, minRent, maxRent, bedrooms, available, progressive };
  }, [searchParams]);

  const activeType = filterParams.types?.[0] || selectedType;

  const { listings, loading, error } = useListings({
    search: searchQuery,
    propertyTypes: activeType ? [activeType] : undefined,
    city: filterParams.city ?? undefined,
    minRent: filterParams.minRent,
    maxRent: filterParams.maxRent,
    minBedrooms: filterParams.bedrooms,
    availableOnly: filterParams.available,
    progressiveOnly: filterParams.progressive,
  });

  useEffect(() => {
    const loadFavorites = async () => {
      if (user) {
        try {
          const { data } = await supabase
            .from('favorites')
            .select('listing_id')
            .eq('user_id', user.id);
          if (data) {
            setFavorites(data.map((fav) => fav.listing_id));
          }
        } catch (err) {
          console.error('Error loading favorites:', err);
        }
      } else {
        const stored = localStorage.getItem('favorites');
        setFavorites(stored ? JSON.parse(stored) : []);
      }
    };
    loadFavorites();
  }, [user]);

  const handleToggleFavorite = async (listingId: string) => {
    const isFavorited = favorites.includes(listingId);

    // Optimistic UI update immediately
    setFavorites(prev =>
      isFavorited ? prev.filter((id) => id !== listingId) : [...prev, listingId]
    );

    // If not authenticated, just use localStorage
    if (!user?.id) {
      const stored = localStorage.getItem('favorites');
      const current: string[] = stored ? JSON.parse(stored) : [];
      const updated = isFavorited
        ? current.filter((id) => id !== listingId)
        : [...current, listingId];
      localStorage.setItem('favorites', JSON.stringify(updated));
      return;
    }

    // Authenticated user → sync with Supabase silently
    try {
      if (isFavorited) {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('listing_id', listingId);
      } else {
        await supabase
          .from('favorites')
          .upsert(
            { user_id: user.id, listing_id: listingId },
            { onConflict: 'user_id,listing_id', ignoreDuplicates: true }
          );
      }
    } catch (err) {
      // Silent fail – optimistic update stays, Supabase will sync next reload
      console.warn('Favorite sync error (non-blocking):', err);
    }
  };

  const sortedListings = useMemo(() => {
    const copy = [...listings];
    if (sortMode === 'price_asc') return copy.sort((a, b) => a.monthly_rent - b.monthly_rent);
    if (sortMode === 'price_desc') return copy.sort((a, b) => b.monthly_rent - a.monthly_rent);
    return copy;
  }, [listings, sortMode]);

  const sortLabel = sortMode === 'recent' ? 'Aléatoire' : sortMode === 'price_asc' ? 'Prix ↑' : 'Prix ↓';

  const hasActiveFilter = filterParams.types?.length || filterParams.city || filterParams.minRent || filterParams.maxRent;

  return (
    <div className="page-container">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky-header px-4 pt-5 pb-3">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-1 mb-0.5">
              <span className="text-xs text-[#8B7BB5]">📍</span>
              <span className="text-xs text-[#8B7BB5]" style={{ fontFamily: 'Space Grotesk' }}>Cotonou, Bénin</span>
            </div>
            <h1
              className="text-xl text-[#E8E0FF] leading-tight"
              style={{ fontFamily: 'Nunito', fontWeight: 900 }}
            >
              Trouvez votre logement
            </h1>
          </div>
          <button
            onClick={() => showToast('Vue carte bientôt disponible', 'info')}
            className="btn-icon mt-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: '#1E1545', border: '1.5px solid rgba(255,255,255,0.08)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B7BB5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Quartier, type de bien..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-[#E8E0FF] text-sm"
              style={{ fontFamily: 'Space Grotesk' }}
            />
          </div>
          <Link
            to="/filtres"
            className="btn-icon relative"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            {hasActiveFilter && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#A855F7] rounded-full" />
            )}
          </Link>
        </div>

        {/* Chips de filtre par type */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          <button
            onClick={() => setSelectedType(null)}
            className={`filter-pill ${selectedType === null && !filterParams.types?.length ? 'active' : 'inactive'}`}
          >
            Tout
          </button>
          {PROPERTY_TYPES.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => setSelectedType(selectedType === type ? null : type)}
              className={`filter-pill ${selectedType === type ? 'active' : 'inactive'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Compteur + tri ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-[#8B7BB5] text-xs" style={{ fontFamily: 'Space Grotesk' }}>
          {listings.length} résultat{listings.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setSortMode(prev =>
            prev === 'recent' ? 'price_asc' : prev === 'price_asc' ? 'price_desc' : 'recent'
          )}
          className="text-[#A855F7] text-xs font-semibold flex items-center gap-1"
          style={{ fontFamily: 'Space Grotesk' }}
        >
          Trier · {sortLabel}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      {/* ── Liste ──────────────────────────────────────────── */}
      <div className="px-4 flex-1">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-52 bg-[#1A1240] rounded-[20px] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            title="Erreur de chargement"
            description={error}
            action={{ label: 'Réessayer', onClick: () => window.location.reload() }}
          />
        ) : sortedListings.length === 0 ? (
          <EmptyState
            title="Aucune annonce trouvée"
            description="Essayez de modifier vos critères de recherche"
            action={{ label: 'Réinitialiser les filtres', onClick: () => navigate('/') }}
          />
        ) : (
          <div className="space-y-4 pb-6">
            {sortedListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isFavorite={favorites.includes(listing.id)}
                onToggleFavorite={() => handleToggleFavorite(listing.id)}
              />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Marketplace;
