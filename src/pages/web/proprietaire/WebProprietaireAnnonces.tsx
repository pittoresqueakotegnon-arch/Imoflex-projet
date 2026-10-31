import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, MapPin, Edit3, Trash2, ChevronDown, Check, Eye, Archive, Clock } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase, ListingSummary, AvailabilityStatus } from '../../../lib/supabase';
import { updateAvailability } from '../../../hooks/useListings';
import { formatMontant, getOptimizedUrl, propertyTypeLabel } from '../../../lib/utils';
import { useToast } from '../../../components/Toast';
import { DemandeSuppressionModal } from '../../../components/DemandeSuppressionModal';

type TabFilter = 'all' | 'publiee' | 'en_attente' | 'suppression_demandee' | 'supprimee';

export default function WebProprietaireAnnonces() {
  const { profile, user } = useAuth();
  const { showToast } = useToast();

  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
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
      console.error('[WebProprietaireAnnonces] Fetch error:', err);
      showToast('Erreur lors du chargement de vos annonces', 'error');
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
      showToast('Disponibilité mise à jour', 'success');
    } catch (_err: unknown) {
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  const counts = useMemo(() => ({
    all: listings.length,
    publiee: listings.filter((l) => l.status === 'publiee').length,
    en_attente: listings.filter((l) => l.status === 'en_attente').length,
    suppression_demandee: listings.filter((l) => (l as any).status === 'suppression_demandee').length,
    supprimee: listings.filter((l) => (l as any).status === 'supprimee').length,
  }), [listings]);

  const filteredListings = useMemo(() => {
    if (activeTab === 'all') return listings;
    return listings.filter((l) => (l as any).status === activeTab);
  }, [listings, activeTab]);

  return (
    <div className="max-w-6xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#17132B] tracking-tight" style={{ fontFamily: 'Sora' }}>
            Mes Annonces Immobilières
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {counts.publiee} annonce{counts.publiee > 1 ? 's' : ''} en ligne sur la marketplace · {counts.all} au total
          </p>
        </div>

        <Link
          to="/web/pro/publier"
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90"
          style={{ background: 'var(--imx-accent)' }}
        >
          <Plus size={16} />
          Publier un bien
        </Link>
      </div>

      {/* Filter Tabs — Défilement fluide bord à bord sur mobile */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5 sm:mb-6 text-xs font-semibold no-scrollbar -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
            activeTab === 'all'
              ? 'bg-[#7B3FE4] text-white shadow-sm'
              : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
          style={activeTab !== 'all' ? { borderColor: 'var(--imx-border)' } : {}}
        >
          Toutes
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('publiee')}
          className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
            activeTab === 'publiee'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
          style={activeTab !== 'publiee' ? { borderColor: 'var(--imx-border)' } : {}}
        >
          En ligne
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'publiee' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
            {counts.publiee}
          </span>
        </button>

        {counts.en_attente > 0 && (
          <button
            onClick={() => setActiveTab('en_attente')}
            className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
              activeTab === 'en_attente'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
            style={activeTab !== 'en_attente' ? { borderColor: 'var(--imx-border)' } : {}}
          >
            En modération
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'en_attente' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'}`}>
              {counts.en_attente}
            </span>
          </button>
        )}

        {counts.suppression_demandee > 0 && (
          <button
            onClick={() => setActiveTab('suppression_demandee')}
            className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
              activeTab === 'suppression_demandee'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
            style={activeTab !== 'suppression_demandee' ? { borderColor: 'var(--imx-border)' } : {}}
          >
            Suppression demandée
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'suppression_demandee' ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-700'}`}>
              {counts.suppression_demandee}
            </span>
          </button>
        )}

        {counts.supprimee > 0 && (
          <button
            onClick={() => setActiveTab('supprimee')}
            className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
              activeTab === 'supprimee'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
            style={activeTab !== 'supprimee' ? { borderColor: 'var(--imx-border)' } : {}}
          >
            Supprimées / Archivées
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'supprimee' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {counts.supprimee}
            </span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
          <Building2 size={48} className="mx-auto mb-3 opacity-30 text-gray-400" />
          <h3 className="text-base font-bold text-gray-800 mb-1">
            {activeTab === 'supprimee'
              ? 'Aucune annonce supprimée'
              : activeTab === 'publiee'
              ? 'Aucune annonce actuellement en ligne'
              : 'Aucune annonce trouvée'}
          </h3>
          <p className="text-xs text-gray-500 mb-6 max-w-sm mx-auto">
            {activeTab === 'all'
              ? "Vous n'avez pas encore d'annonce sur ImoFlex. Publiez votre premier logement pour commencer à recevoir des candidats."
              : 'Basculez sur un autre onglet pour consulter vos autres annonces.'}
          </p>
          {activeTab === 'all' && (
            <Link
              to="/web/pro/publier"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white shadow-sm"
              style={{ background: 'var(--imx-accent)' }}
            >
              <Plus size={16} />
              Publier mon premier bien
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((l) => {
            const cover = l.listing_photos?.find((p) => p.is_cover) || l.listing_photos?.[0];
            const imgUrl = cover ? (getOptimizedUrl(cover.photo_url, 'medium') || cover.photo_url) : null;
            const isMenuOpen = openStatusMenuId === l.id;

            const status = (l as any).status;
            const isPublished = status === 'publiee';
            const isPendingMod = status === 'en_attente';
            const isPendingDelete = status === 'suppression_demandee';
            const isDeleted = status === 'supprimee';

            return (
              <div
                key={l.id}
                className={`rounded-2xl border bg-white overflow-hidden shadow-sm flex flex-col justify-between transition-all ${
                  isDeleted ? 'opacity-85 grayscale-[30%]' : ''
                }`}
                style={{ borderColor: 'var(--imx-border)' }}
              >
                <div>
                  {/* Photo & badges */}
                  <div className="relative h-44 bg-gray-100 overflow-hidden">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={l.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          if (cover?.photo_url && e.currentTarget.src !== cover.photo_url) {
                            e.currentTarget.src = cover.photo_url;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Building2 size={36} />
                      </div>
                    )}

                    {/* Status moderation badge */}
                    <div className="absolute top-2.5 left-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm ${
                          isPublished
                            ? 'bg-emerald-600 text-white'
                            : isPendingMod
                            ? 'bg-amber-500 text-white'
                            : isPendingDelete
                            ? 'bg-orange-500 text-white'
                            : isDeleted
                            ? 'bg-gray-800 text-white'
                            : 'bg-red-500 text-white'
                        }`}
                      >
                        {isPublished
                          ? 'En ligne'
                          : isPendingMod
                          ? 'En modération'
                          : isPendingDelete
                          ? 'Suppression en attente'
                          : isDeleted
                          ? 'Archivée / Supprimée'
                          : 'Rejetée'}
                      </span>
                    </div>

                    {/* Quick view public (only for published listings) */}
                    {isPublished && (
                      <Link
                        to={`/web/annonce/${l.id}`}
                        target="_blank"
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center text-gray-700 hover:bg-white hover:scale-105 transition-all"
                        title="Voir la fiche publique"
                      >
                        <Eye size={14} />
                      </Link>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-lg font-black text-[#7B3FE4]" style={{ fontFamily: 'Sora' }}>
                        {formatMontant(l.monthly_rent)}
                      </span>
                      <span className="text-xs text-gray-400">/ mois</span>
                    </div>

                    <h3 className="font-bold text-sm text-[#17132B] line-clamp-2 mb-2 leading-snug">
                      {l.title}
                    </h3>

                    <div className="flex items-center justify-between gap-2 text-xs text-gray-500 mb-3">
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <MapPin size={12} className="text-[#7B3FE4] flex-shrink-0" />
                        <span className="truncate">{l.neighborhood ? `${l.neighborhood}, ` : ''}{l.city}</span>
                      </div>
                      <span className="text-gray-500 font-medium flex-shrink-0 text-[11px] bg-gray-100/80 px-2 py-0.5 rounded-md border border-gray-200/60">
                        {propertyTypeLabel(l.property_type ?? '')}
                      </span>
                    </div>

                    {/* Status banner */}
                    {isDeleted && (
                      <div className="p-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs flex items-center gap-2 mb-3">
                        <Archive size={14} className="text-gray-500 flex-shrink-0" />
                        <span>Supprimée par l'admin. Retirée de la marketplace.</span>
                      </div>
                    )}

                    {isPendingDelete && (
                      <div className="p-2.5 rounded-xl bg-orange-50 text-orange-700 text-xs flex items-center gap-2 mb-3">
                        <Clock size={14} className="text-orange-500 flex-shrink-0" />
                        <span>Demande de suppression en cours d'examen.</span>
                      </div>
                    )}

                    {/* Availability Dropdown (only for active listings) */}
                    {!isDeleted && (
                      <div className="relative pt-2 border-t" style={{ borderColor: 'var(--imx-border)' }}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">Disponibilité :</span>
                          <button
                            onClick={() => setOpenStatusMenuId(isMenuOpen ? null : l.id)}
                            className="flex items-center gap-1.5 font-bold px-2.5 py-1 rounded-lg border bg-gray-50 hover:bg-gray-100 transition-colors"
                            style={{ borderColor: 'var(--imx-border)' }}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                l.availability_status === 'disponible' ? 'bg-emerald-500' : 'bg-amber-500'
                              }`}
                            />
                            <span className="capitalize">{l.availability_status}</span>
                            <ChevronDown size={13} className="text-gray-400" />
                          </button>
                        </div>

                        {isMenuOpen && (
                          <div
                            className="absolute right-0 bottom-full mb-1 w-40 rounded-xl bg-white border shadow-lg py-1 z-20"
                            style={{ borderColor: 'var(--imx-border)' }}
                          >
                            <button
                              onClick={() => handleStatusChange(l.id, 'disponible')}
                              className="w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-gray-50"
                            >
                              <span className="text-emerald-600 font-semibold">Disponible</span>
                              {l.availability_status === 'disponible' && <Check size={14} className="text-emerald-600" />}
                            </button>
                            <button
                              onClick={() => handleStatusChange(l.id, 'reserve')}
                              className="w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-gray-50"
                            >
                              <span className="text-amber-600 font-semibold">Réservé</span>
                              {l.availability_status === 'reserve' && <Check size={14} className="text-amber-600" />}
                            </button>
                            <button
                              onClick={() => handleStatusChange(l.id, 'occupe')}
                              className="w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-gray-50"
                            >
                              <span className="text-gray-600 font-semibold">Occupé</span>
                              {l.availability_status === 'occupe' && <Check size={14} className="text-gray-600" />}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="px-4 py-3 bg-gray-50/80 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--imx-border)' }}>
                  {isDeleted ? (
                    <span className="flex items-center gap-1.5 font-semibold text-gray-500">
                      <Archive size={13} />
                      Annonce archivée (non modifiable)
                    </span>
                  ) : (
                    <>
                      <Link
                        to={`/web/pro/publier/${l.id}`}
                        className="flex items-center gap-1.5 font-semibold text-gray-700 hover:text-[#7B3FE4] transition-colors"
                      >
                        <Edit3 size={13} />
                        Modifier
                      </Link>

                      {!isPendingDelete && (
                        <button
                          onClick={() => setDeleteModalListing(l)}
                          className="flex items-center gap-1.5 font-semibold text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 size={13} />
                          Supprimer
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Modal */}
      {deleteModalListing && (
        <DemandeSuppressionModal
          isOpen={true}
          listing={{
            id: deleteModalListing.id,
            title: deleteModalListing.title,
            owner_id: deleteModalListing.owner_id || user?.id || '',
          }}
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
