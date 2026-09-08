import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary } from '../../lib/supabase';
import { queueSyncAction } from '../../lib/offlineSyncManager';
import { getCachedFavorites, setCachedFavorites } from '../../lib/offlineStorage';
import ListingCard from '../../components/ListingCard';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import PullToRefresh from '../../components/PullToRefresh';
import { Heart } from 'lucide-react';
import { ListingCardSkeleton } from '../../components/Skeleton';
import { useAuthGate } from '../../hooks/useAuthGate';
import { AuthGateModal } from '../../components/AuthGateModal';

const Favoris: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isModalOpen, closeModal, modalReason } = useAuthGate();

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
          .select('listing_id, listings(id, title, city, neighborhood, monthly_rent, availability_status, listing_photos(id, photo_url, is_cover))')
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
            .select('id, title, city, neighborhood, monthly_rent, availability_status, listing_photos(id, photo_url, is_cover)')
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
      setCachedFavorites(user.id, newFavs);

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
        setError(err instanceof Error ? err.message : 'Erreur de suppression');
      }
    }
  };

  if (loading) {
    return (
      <div className="page-container bg-white h-screen overflow-y-auto">
        <header className="px-5 pt-6 pb-4 bg-white sticky top-0 z-40 border-b border-gray-100">
          <h1 className="font-nunito font-900 text-[22px] text-[#17132B]">Mes favoris</h1>
          <p className="text-[13px] text-gray-500 font-space-grotesk mt-1 font-medium">
            Vos logements sauvegardés
          </p>
        </header>
        <div className="px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <ListingCardSkeleton key={i} horizontal />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container bg-white h-screen overflow-y-auto">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="px-5 pt-6 pb-4 bg-white sticky top-0 z-40 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-nunito font-900 text-[22px] text-[#17132B]">
              Mes favoris
            </h1>
            <p className="text-[13px] text-gray-500 font-space-grotesk mt-1 font-medium">
              {favorites.length > 0
                ? `${favorites.length} logement${favorites.length > 1 ? 's' : ''} sauvegardé${favorites.length > 1 ? 's' : ''}`
                : 'Vos logements sauvegardés'}
            </p>
          </div>
          {favorites.length > 0 && (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <Heart size={18} className="fill-red-500 text-red-500" />
            </div>
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
              icon={<Heart size={48} className="text-[#7B3FE4]" />}
              title="Aucun favori"
              description="Touchez le cœur sur une annonce pour la retrouver ici facilement."
              action={{
                label: "Explorer les logements",
                href: "/"
              }}
            />
          ) : (
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

              {/* Explorer plus */}
              <button
                className="btn-ghost-violet w-full"
                onClick={() => navigate('/')}
              >
                Explorer d'autres logements
              </button>
            </div>
          )}
        </div>
      </PullToRefresh>

      <AuthGateModal isOpen={isModalOpen} onClose={closeModal} reason={modalReason} />
      <BottomNav />
    </div>
  );
};

export default Favoris;
