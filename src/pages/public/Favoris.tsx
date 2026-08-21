import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary } from '../../lib/supabase';
import { queueSyncAction } from '../../lib/offlineSyncManager';
import { getCachedFavorites, setCachedFavorites } from '../../lib/offlineStorage';
import ListingCard from '../../components/ListingCard';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import PullToRefresh from '../../components/PullToRefresh';

const Favoris: React.FC = () => {
  const { user } = useAuth();

  const [favorites, setFavorites] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const loadFavorites = useCallback(async () => {
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
  }, [user]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

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
      <PullToRefresh onRefresh={loadFavorites}>
        <div className="flex-1 flex flex-col min-h-0">
          {error ? (
            <EmptyState
              title="Erreur"
              description={error}
              action={{ label: 'Réessayer', onClick: () => window.location.reload() }}
            />
          ) : favorites.length === 0 ? (
            <EmptyState
              imageSrc="/assets/empty/favorites.jpg"
              title="Aucun favori pour l'instant"
              description="Touchez le cœur sur une annonce pour la retrouver ici facilement."
              action={{
                label: "Explorer les logements",
                href: "/"
              }}
            />
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
        </div>
      </PullToRefresh>

      <BottomNav />
    </div>
  );
};

export default Favoris;
