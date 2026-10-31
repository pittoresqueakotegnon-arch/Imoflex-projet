import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, MapPin, Search, ChevronDown, Check, Eye } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase, ListingSummary, AvailabilityStatus } from '../../../lib/supabase';
import { updateAvailability } from '../../../hooks/useListings';
import { formatMontant, getOptimizedUrl, propertyTypeLabel } from '../../../lib/utils';
import { useToast } from '../../../components/Toast';
import { DemandeSuppressionModal } from '../../../components/DemandeSuppressionModal';

export default function WebAgenceAnnonces() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'disponible' | 'loue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);
  const [deleteModalListing, setDeleteModalListing] = useState<ListingSummary | null>(null);

  const fetchListings = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('listings')
        .select(`
          id,
          title,
          city,
          neighborhood,
          monthly_rent,
          bedrooms,
          property_type,
          availability_status,
          status,
          rejection_reason,
          created_at,
          owner_id,
          listing_photos (
            photo_url,
            is_cover
          )
        `)
        .eq('owner_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setListings((data as ListingSummary[]) || []);
    } catch (err) {
      console.error('[WebAgenceAnnonces] Fetch error:', err);
      showToast('Erreur lors du chargement des mandats', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleStatusChange = async (listingId: string, status: AvailabilityStatus) => {
    try {
      await updateAvailability(listingId, status);
      setListings((prev) =>
        prev.map((l) => (l.id === listingId ? { ...l, availability_status: status } : l))
      );
      setOpenStatusMenuId(null);
      showToast('Disponibilité du mandat mise à jour', 'success');
    } catch (_err: unknown) {
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  const filteredListings = listings.filter((l) => {
    if (filterStatus !== 'all' && l.availability_status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.title.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        (l.neighborhood && l.neighborhood.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
              Gestion de Portefeuille
            </span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Portefeuille de Mandats Locatifs
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Supervisez les logements confiés en gestion par vos clients propriétaires.
          </p>
        </div>

        <Link
          to="/web/agence/publier"
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg"
          style={{ background: 'var(--imx-accent)' }}
        >
          <Plus size={16} />
          Publier un nouveau mandat
        </Link>
      </div>

      {/* Barre de filtres & recherche */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl border bg-white shadow-xs" style={{ borderColor: 'var(--imx-border)' }}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par titre, ville, quartier..."
            className="w-full pl-10 pr-4 py-2 rounded-xl text-sm border bg-gray-50/50 outline-none focus:bg-white focus:border-[var(--imx-accent)] transition-all"
            style={{ borderColor: 'var(--imx-border)' }}
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {(['all', 'disponible', 'loue'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterStatus === st
                  ? 'bg-[var(--imx-accent)] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {st === 'all' ? `Tous (${listings.length})` : st === 'disponible' ? 'Disponibles' : 'Loués'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
          <Building2 size={48} className="mx-auto mb-3 opacity-30 text-gray-400" />
          <h3 className="text-base font-bold text-gray-800 mb-1">
            {searchQuery || filterStatus !== 'all' ? 'Aucun mandat ne correspond à vos filtres' : 'Aucun mandat enregistré'}
          </h3>
          <p className="text-xs text-gray-500 mb-6 max-w-sm mx-auto">
            {searchQuery || filterStatus !== 'all'
              ? 'Essayez de modifier votre recherche ou de réinitialiser le filtre de statut.'
              : 'Commencez à ajouter les biens de vos clients pour collecter les loyers et recevoir des prospects.'}
          </p>
          <Link
            to="/web/agence/publier"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Plus size={16} /> Ajouter un mandat
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((l) => {
            const cover = l.listing_photos?.find((p) => p.is_cover) || l.listing_photos?.[0];
            const photoUrl = cover ? (getOptimizedUrl(cover.photo_url, 'medium') || cover.photo_url) : null;

            return (
              <div
                key={l.id}
                className="group rounded-2xl border bg-white overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                {/* Photo & badges */}
                <div className="relative h-48 bg-gray-100 overflow-hidden">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={l.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        if (cover?.photo_url && e.currentTarget.src !== cover.photo_url) {
                          e.currentTarget.src = cover.photo_url;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Building2 size={40} />
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/95 backdrop-blur-sm text-gray-800 shadow-xs">
                      {propertyTypeLabel(l.property_type ?? '')}
                    </span>
                  </div>

                  {/* Status Dropdown */}
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={() => setOpenStatusMenuId(openStatusMenuId === l.id ? null : l.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-xs transition-transform active:scale-95 ${
                        l.availability_status === 'disponible'
                          ? 'bg-emerald-600 text-white'
                          : l.availability_status === 'reserve'
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-800 text-white'
                      }`}
                    >
                      {l.availability_status === 'disponible' ? 'Disponible' : l.availability_status === 'reserve' ? 'Réservé' : 'Loué'}
                      <ChevronDown size={11} />
                    </button>

                    {openStatusMenuId === l.id && (
                      <div
                        className="absolute right-0 mt-1.5 w-36 rounded-xl border bg-white shadow-xl py-1 z-20"
                        style={{ borderColor: 'var(--imx-border)' }}
                      >
                        {(['disponible', 'reserve', 'loue'] as AvailabilityStatus[]).map((st) => (
                          <button
                            key={st}
                            onClick={() => handleStatusChange(l.id, st)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <span className="capitalize">{st === 'disponible' ? 'Disponible' : st === 'reserve' ? 'Réservé' : 'Loué'}</span>
                            {l.availability_status === st && <Check size={12} className="text-emerald-600" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-lg font-black text-[var(--imx-accent)]" style={{ fontFamily: 'Sora' }}>
                      {formatMontant(l.monthly_rent)}
                    </span>
                    <span className="text-xs text-gray-400">/ mois</span>
                  </div>

                  <h3 className="font-bold text-sm text-gray-900 line-clamp-1 mb-1">
                    {l.title}
                  </h3>

                  <p className="text-xs text-gray-500 flex items-center gap-1 mb-4">
                    <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="truncate">{l.neighborhood ? `${l.neighborhood}, ` : ''}{l.city}</span>
                  </p>

                  <div className="mt-auto pt-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--imx-border)' }}>
                    <span className="text-[11px] text-gray-400 font-medium">
                      {l.bedrooms ? `${l.bedrooms} chambre${l.bedrooms > 1 ? 's' : ''}` : 'Non spécifié'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {(l as any).status === 'supprimee' ? (
                        <span className="text-xs font-semibold text-gray-400 px-2 py-1 bg-gray-100 rounded-lg">
                          Archivée
                        </span>
                      ) : (
                        <>
                          <Link
                            to={`/web/annonce/${l.id}`}
                            className="p-2 rounded-xl border text-gray-500 hover:text-[var(--imx-accent)] hover:bg-purple-50 transition-colors"
                            title="Voir la fiche publique"
                            style={{ borderColor: 'var(--imx-border)' }}
                          >
                            <Eye size={14} />
                          </Link>
                          {(l as any).status !== 'suppression_demandee' && (
                            <button
                              onClick={() => setDeleteModalListing(l)}
                              className="px-2.5 py-1.5 rounded-xl border text-[11px] font-bold text-red-600 hover:bg-red-50 transition-colors"
                              style={{ borderColor: 'var(--imx-border)' }}
                            >
                              Retirer
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteModalListing && (
        <DemandeSuppressionModal
          listing={{
            id: deleteModalListing.id,
            title: deleteModalListing.title,
            owner_id: deleteModalListing.owner_id || '',
          }}
          isOpen={true}
          onClose={() => setDeleteModalListing(null)}
          onSuccess={() => {
            setDeleteModalListing(null);
            fetchListings();
          }}
        />
      )}
    </div>
  );
}
