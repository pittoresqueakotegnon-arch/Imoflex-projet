import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Search, Building2, MapPin, Zap, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary } from '../../lib/supabase';
import { formatMontant, getOptimizedUrl, propertyTypeLabel } from '../../lib/utils';
import { useToast } from '../../components/Toast';

export default function WebFavoris() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [favorites, setFavorites] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('favorites')
        .select(`
          id,
          created_at,
          listings:listing_id (
            id,
            title,
            city,
            neighborhood,
            monthly_rent,
            bedrooms,
            property_type,
            availability_status,
            status,
            accepts_progressive_payment,
            listing_photos (
              id,
              photo_url,
              is_cover
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const items: ListingSummary[] = (data || [])
        .map((f: any) => f.listings)
        .filter((l: any) => l && l.status === 'publiee');

      setFavorites(items);
    } catch (err) {
      console.error('[WebFavoris] Fetch error:', err);
      showToast('Impossible de charger vos favoris', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const removeFavorite = async (listingId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;

    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('listing_id', listingId);

      if (error) throw error;
      setFavorites((prev) => prev.filter((item) => item.id !== listingId));
      showToast('Annonce retirée des favoris', 'info');
    } catch (_err) {
      showToast('Erreur lors du retrait du favori', 'error');
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: '#F1EBFF', color: 'var(--imx-accent)' }}
        >
          <Heart size={32} />
        </div>
        <h1 className="text-2xl font-black mb-2" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
          Vos favoris
        </h1>
        <p className="text-sm max-w-md mx-auto mb-8" style={{ color: 'var(--imx-text-secondary)' }}>
          Connectez-vous pour retrouver vos logements enregistrés et les consulter sur n'importe quel appareil.
        </p>
        <Link
          to="/web/login?from=/web/favoris"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90"
          style={{ background: 'var(--imx-accent)' }}
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const filteredFavorites = favorites.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.title.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      (l.neighborhood && l.neighborhood.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-pink-50 text-pink-600 uppercase tracking-wider flex items-center gap-1">
              <Heart size={11} className="fill-pink-600" /> Vos coups de cœur
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Mes Logements Favoris
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {favorites.length} bien{favorites.length > 1 ? 's' : ''} enregistré{favorites.length > 1 ? 's' : ''} pour comparaison et suivi.
          </p>
        </div>

        <Link
          to="/web/annonces"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-colors bg-white hover:bg-gray-50 text-gray-800 shadow-2xs"
          style={{ borderColor: 'var(--imx-border)' }}
        >
          <Search size={15} />
          Explorer d'autres biens
        </Link>
      </div>

      {/* Search filter if favorites > 2 */}
      {favorites.length > 2 && (
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer vos favoris par ville ou titre..."
            className="w-full pl-10 pr-4 py-2 rounded-xl text-xs border bg-white outline-none focus:border-[var(--imx-accent)] transition-all"
            style={{ borderColor: 'var(--imx-border)' }}
          />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border bg-white p-3 animate-pulse" style={{ borderColor: 'var(--imx-border)' }}>
              <div className="h-48 bg-gray-100 rounded-xl mb-3" />
              <div className="h-5 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div
          className="text-center py-16 px-6 rounded-2xl border bg-white shadow-2xs"
          style={{ borderColor: 'var(--imx-border)' }}
        >
          <div className="w-14 h-14 rounded-2xl bg-pink-50 flex items-center justify-center mx-auto mb-3 text-pink-500">
            <Heart size={28} />
          </div>
          <h2 className="text-base font-bold mb-1 text-gray-800" style={{ fontFamily: 'Sora' }}>
            Aucun favori pour le moment
          </h2>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-6">
            Explorez les biens disponibles et cliquez sur l'icône cœur pour conserver vos logements préférés et les comparer facilement.
          </p>
          <Link
            to="/web/annonces"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg"
            style={{ background: 'var(--imx-accent)' }}
          >
            Découvrir les annonces
          </Link>
        </div>
      ) : filteredFavorites.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
          <p className="text-xs text-gray-500">Aucun favori ne correspond à votre recherche « {search} ».</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFavorites.map((listing) => {
            const cover = listing.listing_photos?.find((p) => p.is_cover) || listing.listing_photos?.[0];
            const imgUrl = cover ? getOptimizedUrl(cover.photo_url, 'medium') : null;

            return (
              <div
                key={listing.id}
                className="group relative flex flex-col rounded-2xl overflow-hidden border bg-white shadow-xs hover:shadow-lg transition-all duration-300"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                {/* Photo & tags */}
                <Link to={`/web/annonce/${listing.id}`} className="block relative h-52 overflow-hidden bg-gray-100">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={listing.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Building2 size={44} />
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold shadow-xs ${
                        listing.availability_status === 'disponible'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gray-800 text-white'
                      }`}
                    >
                      {listing.availability_status === 'disponible' ? 'Disponible' : 'Réservé'}
                    </span>

                    {listing.accepts_progressive_payment && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 bg-[var(--imx-accent)] text-white shadow-xs">
                        <Zap size={10} /> Progressif
                      </span>
                    )}
                  </div>
                </Link>

                {/* Remove button */}
                <button
                  onClick={(e) => removeFavorite(listing.id, e)}
                  title="Retirer des favoris"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 backdrop-blur-xs border shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 hover:scale-110 transition-all z-20"
                  style={{ borderColor: 'var(--imx-border)' }}
                >
                  <Trash2 size={14} />
                </button>

                {/* Card body */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xl font-black text-[var(--imx-accent)]" style={{ fontFamily: 'Sora' }}>
                      {formatMontant(listing.monthly_rent)}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">/ mois</span>
                  </div>

                  <Link to={`/web/annonce/${listing.id}`}>
                    <h3 className="font-bold text-sm text-gray-900 group-hover:text-[var(--imx-accent)] transition-colors line-clamp-1 mb-1">
                      {listing.title}
                    </h3>
                  </Link>

                  <p className="text-xs text-gray-500 flex items-center gap-1 mb-4">
                    <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="truncate">
                      {listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}
                    </span>
                  </p>

                  <div className="mt-auto pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--imx-border)' }}>
                    <span className="text-gray-400 font-medium text-[11px]">
                      {propertyTypeLabel(listing.property_type ?? '')}
                      {listing.bedrooms ? ` · ${listing.bedrooms} ch.` : ''}
                    </span>

                    <Link
                      to={`/web/annonce/${listing.id}`}
                      className="font-bold text-[11px] text-[var(--imx-accent)] hover:underline"
                    >
                      Voir le bien →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

