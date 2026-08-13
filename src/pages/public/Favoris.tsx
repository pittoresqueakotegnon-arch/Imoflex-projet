import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary } from '../../lib/supabase';
import { queueSyncAction } from '../../lib/offlineSyncManager';
import { getCachedFavorites, setCachedFavorites } from '../../lib/offlineStorage';
import ListingCard from '../../components/ListingCard';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';

const Favoris: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [favorites, setFavorites] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    const loadFavorites = async () => {
      setLoading(true);
      setError(null);

      if (user) {
        try {
          const cachedFavs = await getCachedFavorites(user.id);
          if (cachedFavs && cachedFavs.length > 0) {
            setFavorites(cachedFavs);
            setFavoriteIds(cachedFavs.map(f => f.id));
            setLoading(false);
          }

          if (!navigator.onLine && cachedFavs) {
            return;
          }

          const { data, error: err } = await supabase
            .from('favorites')
            .select('listing_id, listings(id, title, city, neighborhood, monthly_rent, listing_photos(id, photo_url, is_cover))')
            .eq('user_id', user.id);

          if (err) {
            if (!cachedFavs) setError(err.message);
          } else {
            const favoriteListings = (data || [])
              .map((fav) => (Array.isArray(fav.listings) ? fav.listings[0] : fav.listings) as ListingSummary | null | undefined)
              .filter((l): l is ListingSummary => !!l);
            setFavorites(favoriteListings);
            setFavoriteIds(favoriteListings.map(f => f.id));
            await setCachedFavorites(user.id, favoriteListings);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erreur de chargement');
        }
      } else {
        const stored = localStorage.getItem('favorites');
        const listingIds = stored ? JSON.parse(stored) : [];
        setFavoriteIds(listingIds);

        if (listingIds.length > 0) {
          try {
            const { data, error: err } = await supabase
              .from('listings')
              .select('id, title, city, neighborhood, monthly_rent, listing_photos(id, photo_url, is_cover)')
              .in('id', listingIds)
              .eq('status', 'publiee');

            if (err) setError(err.message);
            else setFavorites((data || []) as ListingSummary[]);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur de chargement');
          }
        }
      }

      setLoading(false);
    };

    loadFavorites();
  }, [user]);

  const handleToggleFavorite = async (listingId: string) => {
    if (!user) {
      const updated = favoriteIds.filter((id) => id !== listingId);
      setFavoriteIds(updated);
      localStorage.setItem('favorites', JSON.stringify(updated));
      setFavorites(favorites.filter((f) => f.id !== listingId));
    } else {
      // Optimistic UI update
      const newFavIds = favoriteIds.filter((id) => id !== listingId);
      const newFavs = favorites.filter((f) => f.id !== listingId);
      
      setFavoriteIds(newFavIds);
      setFavorites(newFavs);
      setCachedFavorites(user.id, newFavs); // Update local cache

      if (!navigator.onLine) {
        queueSyncAction('TOGGLE_FAVORITE', { listingId, userId: user.id, isAdding: false });
        return;
      }

      try {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('listing_id', listingId);
      } catch (err) {
        // Rollback on error if needed
        setError(err instanceof Error ? err.message : 'Erreur de suppression');
      }
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-4">
          <h1 className="font-nunito font-800 text-xl text-[var(--imx-text-primary)]">Mes favoris</h1>
        </header>
        <div className="px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[var(--imx-surface)] rounded-2xl animate-pulse" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky-header px-4 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-nunito font-800 text-xl text-[var(--imx-text-primary)] flex-1">
            Mes favoris {favorites.length > 0 && `(${favorites.length})`}
          </h1>
          {favorites.length > 0 && (
            <span className="badge-new">NOUVEAU</span>
          )}
        </div>
      </header>

      {/* ── Content ────────────────────────────────────── */}
      {error ? (
        <EmptyState
          title="Erreur"
          description={error}
          action={{ label: 'Réessayer', onClick: () => window.location.reload() }}
        />
      ) : favorites.length === 0 ? (
        /* État vide : cœur grisé centré, comme dans la maquette */
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-20">
          <div className="mb-6">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--imx-text-muted)" stroke="none">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </div>
          <h2 className="font-nunito font-800 text-[var(--imx-text-primary)] text-xl mb-2 text-center">
            Aucun favori pour l'instant
          </h2>
          <p className="text-[var(--imx-text-secondary)] text-sm text-center mb-8 max-w-[240px] leading-relaxed">
            Touchez le cœur sur une annonce pour la retrouver ici facilement.
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary w-full"
          >
            Explorer la marketplace
          </button>
        </div>
      ) : (
        /* Liste avec cards horizontales */
        <div className="px-4 py-4 flex-1">
          <div className="space-y-3 mb-6">
            {favorites.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isFavorite={favoriteIds.includes(listing.id)}
                onToggleFavorite={() => handleToggleFavorite(listing.id)}
                horizontal
              />
            ))}
          </div>

          {/* Bouton "Comparer les biens sélectionnés" */}
          <button
            className="btn-ghost-violet w-full"
            onClick={() => {}}
            disabled
            style={{ opacity: 0.6 }}
          >
            Comparer les biens sélectionnés
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Favoris;
