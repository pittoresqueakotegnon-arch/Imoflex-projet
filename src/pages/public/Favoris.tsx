import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Listing } from '../../lib/supabase';
import ListingCard from '../../components/ListingCard';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { Heart } from 'lucide-react';

const Favoris: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    const loadFavorites = async () => {
      setLoading(true);
      setError(null);

      if (user) {
        try {
          const { data, error: err } = await supabase
            .from('favorites')
            .select('listing_id, listings(*, listing_photos(*))')
            .eq('user_id', user.id);

          if (err) {
            setError(err.message);
          } else {
            const ids = (data || []).map((fav) => fav.listing_id);
            setFavoriteIds(ids);
            const favoriteListings = (data || [])
              .map((fav) => fav.listings as Listing | null)
              .filter((l): l is Listing => l !== null);
            setFavorites(favoriteListings);
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
              .select('*, listing_photos(*)')
              .in('id', listingIds)
              .eq('status', 'publiee');

            if (err) setError(err.message);
            else setFavorites((data || []) as Listing[]);
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
      try {
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('listing_id', listingId);
        setFavoriteIds(favoriteIds.filter((id) => id !== listingId));
        setFavorites(favorites.filter((f) => f.id !== listingId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de suppression');
      }
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-4">
          <h1 className="font-nunito font-800 text-xl text-[#E8E0FF]">Mes favoris</h1>
        </header>
        <div className="px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[#1A1240] rounded-2xl animate-pulse" />
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
          <h1 className="font-nunito font-800 text-xl text-[#E8E0FF] flex-1">
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
            <svg width="64" height="64" viewBox="0 0 24 24" fill="#4A3D7A" stroke="none">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </div>
          <h2 className="font-nunito font-800 text-[#E8E0FF] text-xl mb-2 text-center">
            Aucun favori pour l'instant
          </h2>
          <p className="text-[#8B7BB5] text-sm text-center mb-8 max-w-[240px] leading-relaxed">
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
