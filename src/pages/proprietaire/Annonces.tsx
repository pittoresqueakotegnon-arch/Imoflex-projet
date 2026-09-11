import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Home, Eye, Trash2, Clock, CheckCircle2, AlertCircle, Archive, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary, AvailabilityStatus } from '../../lib/supabase';
import { updateAvailability } from '../../hooks/useListings';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { DemandeSuppressionModal } from '../../components/DemandeSuppressionModal';
import { PullToRefresh } from '../../components/PullToRefresh';

interface AnnounceListItem extends ListingSummary {
  contactRequestsCount: number;
}

const Annonces: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [listings, setListings] = useState<AnnounceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAvailabilityMenuId, setOpenAvailabilityMenuId] = useState<string | null>(null);
  const [selectedListingForDelete, setSelectedListingForDelete] = useState<{
    id: string;
    title: string;
    owner_id: string;
  } | null>(null);

  const fetchListings = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, city, neighborhood, availability_status, status, rejection_reason, created_at, owner_id, monthly_rent, listing_photos(photo_url, is_cover)')
        .eq('owner_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const listingData = data || [];
      if (listingData.length === 0) { setListings([]); return; }

      // Requête unique pour compter les contact_requests de toutes les annonces (anti N+1)
      const listingIds = listingData.map(l => l.id);
      const { data: contactData } = await supabase
        .from('contact_requests')
        .select('listing_id')
        .in('listing_id', listingIds);

      const countMap: Record<string, number> = {};
      (contactData || []).forEach(cr => {
        countMap[cr.listing_id] = (countMap[cr.listing_id] || 0) + 1;
      });

      const listingsWithCounts: AnnounceListItem[] = listingData.map(listing => ({
        ...(listing as ListingSummary),
        contactRequestsCount: countMap[listing.id] || 0,
      }));

      setListings(listingsWithCounts);
    } catch (error) {
      console.error('Error fetching listings:', error);
      showToast('Erreur lors du chargement des annonces', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);


  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleAvailabilityChange = async (listingId: string, status: AvailabilityStatus) => {
    try {
      await updateAvailability(listingId, status);
      setListings(prev =>
        prev.map(item =>
          item.id === listingId
            ? { ...item, availability_status: status }
            : item
        )
      );
      showToast('Statut de disponibilité mis à jour', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la mise à jour du statut';
      showToast(msg, 'error');
    }
  };

  const handleDeletionRequested = (listingId: string) => {
    setListings(prev =>
      prev.map(item =>
        item.id === listingId
          ? { ...item, status: 'suppression_demandee' }
          : item
      )
    );
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card h-36 animate-pulse"></div>
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="sticky-header px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-nunito font-900 text-lg text-[var(--imx-text-primary)]">Mes annonces</h1>
          <p className="text-[var(--imx-text-secondary)] text-xs mt-0.5" style={{ fontFamily: 'Space Grotesk' }}>Gestion de vos biens</p>
        </div>
        <Link to="/pro/publier" className="btn-primary btn-sm">
          <Plus size={14} /> Nouvelle
        </Link>
      </header>

      <PullToRefresh onRefresh={fetchListings}>
        {listings.length === 0 ? (
        <EmptyState
          title="Aucune annonce publiée"
          description="Publiez votre premier bien sur la marketplace ImoFlex."
          action={{ label: 'Commencer', href: '/pro/publier' }}
        />
      ) : (
        <div className="px-4 py-4 space-y-3.5 flex-1 pb-10">
          {listings.map(listing => {
            const coverPhoto = listing.listing_photos?.find(p => p.is_cover) || listing.listing_photos?.[0];
            const isDeletionPending = (listing as any).status === 'suppression_demandee';
            const isDeleted = (listing as any).status === 'supprimee';
            const isPublished = (listing as any).status === 'publiee';
            const isWaitingMod = (listing as any).status === 'en_attente';
            const isRejected = (listing as any).status === 'rejetee';

            return (
              <div key={listing.id} className="bg-white rounded-[24px] p-4 flex flex-col gap-4 shadow-sm border border-gray-100 overflow-hidden relative">
                {/* Main Row */}
                <div className="flex gap-4">
                  {/* Cover Photo */}
                  <div className="w-20 h-20 rounded-[16px] overflow-hidden flex-shrink-0 bg-gray-50 shadow-inner">
                    {coverPhoto?.photo_url ? (
                      <img
                        src={coverPhoto.photo_url}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Home size={28} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <h3 className="font-nunito font-900 text-[#17132B] text-[15px] truncate leading-tight">
                          {listing.title}
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-1 truncate font-space-grotesk font-medium">
                          {listing.neighborhood || listing.city}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isPublished && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-500">
                            <CheckCircle2 size={10} /> Active
                          </span>
                        )}

                        {isDeletionPending && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-500">
                            <Clock size={10} /> Suppression en attente
                          </span>
                        )}

                        {isDeleted && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md bg-gray-50 text-gray-500">
                            <Archive size={10} /> Archivée
                          </span>
                        )}

                        {isWaitingMod && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-500">
                            <Clock size={10} /> En attente de validation
                          </span>
                        )}

                        {isRejected && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-500"
                            title={(listing as any).rejection_reason || ''}
                          >
                            <AlertCircle size={10} /> Rejetée
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Prix & Statut */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={listing.availability_status} />
                  </div>
                  {(listing as any).monthly_rent && (
                    <span className="text-[12px] font-space-grotesk font-bold text-[#7B3FE4] whitespace-nowrap bg-[#7B3FE4]/10 px-2.5 py-1 rounded-lg">
                      {new Intl.NumberFormat('fr-FR').format((listing as any).monthly_rent)} FCFA<span className="text-[10px] font-semibold text-[#7B3FE4]/70">/mois</span>
                    </span>
                  )}
                </div>

                {/* Status explainer banner */}
                {isDeletionPending && (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 flex items-center gap-1.5 font-space-grotesk">
                    <Clock size={12} className="flex-shrink-0" />
                    <span>Votre demande de suppression est actuellement examinée par l'administration.</span>
                  </div>
                )}
                {isDeleted && (
                  <div className="p-2 rounded-lg bg-slate-500/10 border border-slate-500/20 text-[10px] text-slate-400 flex items-center gap-1.5 font-space-grotesk">
                    <Archive size={12} className="flex-shrink-0" />
                    <span>Cette annonce a été archivée et n'est plus visible publiquement.</span>
                  </div>
                )}

                {/* Sélecteur de disponibilité avec menu flottant contextuel */}
                {isPublished && !isDeletionPending && !isDeleted && (
                  <div className="flex items-center justify-between pt-1 pb-1">
                    <span className="text-[10px] text-[var(--imx-text-secondary)] font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
                      Disponibilité du bien
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenAvailabilityMenuId(openAvailabilityMenuId === listing.id ? null : listing.id);
                        }}
                        className="flex items-center gap-1.5 bg-[var(--imx-surface-2)] hover:bg-white/10 text-[var(--imx-text-primary)] text-[10px] rounded-lg px-2.5 py-1.5 font-semibold border border-[var(--imx-border)] focus:border-[var(--imx-accent-light)] transition-colors cursor-pointer"
                      >
                        {listing.availability_status === 'disponible' && (
                          <>
                            <CheckCircle2 size={12} className="text-emerald-400" />
                            <span>Disponible</span>
                          </>
                        )}
                        {listing.availability_status === 'reserve' && (
                          <>
                            <Clock size={12} className="text-amber-400" />
                            <span>Indisponible temp.</span>
                          </>
                        )}
                        {listing.availability_status === 'occupe' && (
                          <>
                            <Home size={12} className="text-blue-400" />
                            <span>Occupé (Loué)</span>
                          </>
                        )}
                        <ChevronDown size={11} className="text-[var(--imx-text-secondary)] ml-0.5" />
                      </button>

                      {openAvailabilityMenuId === listing.id && (
                        <>
                          {/* Backdrop transparent pour fermer au clic dehors */}
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenAvailabilityMenuId(null);
                            }}
                          />
                          {/* Menu contextuel flottant */}
                          <div
                            className="absolute right-0 top-full mt-1 w-52 bg-[var(--imx-surface)] border border-[var(--imx-border)] rounded-2xl shadow-2xl z-50 py-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                handleAvailabilityChange(listing.id, 'disponible');
                                setOpenAvailabilityMenuId(null);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition-colors ${
                                listing.availability_status === 'disponible'
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <CheckCircle2 size={14} className="text-emerald-400" />
                                <span>Disponible</span>
                              </div>
                              {listing.availability_status === 'disponible' && <Check size={12} />}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                handleAvailabilityChange(listing.id, 'reserve');
                                setOpenAvailabilityMenuId(null);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition-colors ${
                                listing.availability_status === 'reserve'
                                  ? 'bg-amber-500/15 text-amber-400'
                                  : 'text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <Clock size={14} className="text-amber-400" />
                                <span>Indisponible temp.</span>
                              </div>
                              {listing.availability_status === 'reserve' && <Check size={12} />}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                handleAvailabilityChange(listing.id, 'occupe');
                                setOpenAvailabilityMenuId(null);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold transition-colors ${
                                listing.availability_status === 'occupe'
                                  ? 'bg-blue-500/15 text-blue-400'
                                  : 'text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <Home size={14} className="text-blue-400" />
                                <span>Occupé (Loué)</span>
                              </div>
                              {listing.availability_status === 'occupe' && <Check size={12} />}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-3">
                  <div className="text-[11px] text-gray-500 font-semibold font-space-grotesk">
                    {listing.contactRequestsCount} demande{listing.contactRequestsCount !== 1 ? 's' : ''}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Voir l'annonce */}
                    <Link
                      to={`/annonce/${listing.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                      <Eye size={12} />
                      Voir
                    </Link>

                    {/* Gérer les demandes */}
                    {listing.availability_status === 'disponible' && isPublished && (
                      <Link
                        to={`/pro/activer/${listing.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-[#7B3FE4]/10 text-[#7B3FE4] hover:bg-[#7B3FE4]/20 transition-colors"
                      >
                        Demandes
                      </Link>
                    )}

                    {/* Demander la suppression */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedListingForDelete({
                          id: listing.id,
                          title: listing.title,
                          owner_id: listing.owner_id || profile?.id || '',
                        })
                      }
                      disabled={isDeletionPending || isDeleted}
                      title={
                        isDeletionPending
                          ? 'Une demande de suppression est déjà en cours'
                          : isDeleted
                          ? 'Annonce déjà archivée'
                          : 'Demander la suppression de cette annonce'
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                        isDeletionPending
                          ? 'bg-amber-50 text-amber-500/60 cursor-not-allowed'
                          : isDeleted
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                          : 'bg-red-50 text-red-500 hover:bg-red-100 active:scale-95'
                      }`}
                    >
                      <Trash2 size={12} />
                      {isDeletionPending ? 'En attente' : isDeleted ? 'Archivée' : 'Supprimer'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </PullToRefresh>

      {/* Modal de demande de suppression - Doit être en dehors de PullToRefresh pour que position:fixed marche correctement */}
      {selectedListingForDelete && (
        <DemandeSuppressionModal
          isOpen={!!selectedListingForDelete}
          listing={selectedListingForDelete}
          onClose={() => setSelectedListingForDelete(null)}
          onSuccess={handleDeletionRequested}
        />
      )}

      <BottomNav />
    </div>
  );
};

export default Annonces;
