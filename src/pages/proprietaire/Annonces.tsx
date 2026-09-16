import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Home, Eye, Trash2, Clock, CheckCircle2, AlertCircle, Archive, ChevronDown, Check, MapPin, MessageCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary, AvailabilityStatus } from '../../lib/supabase';
import { updateAvailability } from '../../hooks/useListings';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
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
      <div className="page-container premium-page">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card h-36 animate-pulse"></div>
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  const publishedCount = listings.filter((listing) => (listing as any).status === 'publiee').length;
  const availableCount = listings.filter((listing) => listing.availability_status === 'disponible').length;
  const totalRequests = listings.reduce((total, listing) => total + listing.contactRequestsCount, 0);

  return (
    <div className="page-container premium-page">
      {/* Header */}
      <header className="premium-header px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-nunito font-black text-[22px] leading-tight text-[var(--imx-text-primary)]">Mes annonces</h1>
          <p className="text-[12px] mt-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
            {publishedCount} publiée{publishedCount > 1 ? 's' : ''} · {availableCount} disponible{availableCount > 1 ? 's' : ''}
          </p>
        </div>
        <Link to="/pro/publier" className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 font-nunito font-black text-[12px] text-white active:scale-[0.98] transition-transform" style={{ background: 'var(--imx-accent)', boxShadow: '0 8px 18px rgba(123, 63, 228, 0.22)' }}>
          <Plus size={16} /> Ajouter
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
        <div className="px-5 pt-2 pb-10 space-y-4 flex-1">
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>Portefeuille locatif</p>
              <p className="font-nunito font-black text-[15px] text-[var(--imx-text-primary)] mt-0.5">{listings.length} bien{listings.length > 1 ? 's' : ''} publié{listings.length > 1 ? 's' : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>Demandes</p>
              <p className="font-nunito font-black text-[15px] text-[var(--imx-accent)] mt-0.5">{totalRequests}</p>
            </div>
          </div>
          {listings.map(listing => {
            const coverPhoto = listing.listing_photos?.find(p => p.is_cover) || listing.listing_photos?.[0];
            const isDeletionPending = (listing as any).status === 'suppression_demandee';
            const isDeleted = (listing as any).status === 'supprimee';
            const isPublished = (listing as any).status === 'publiee';
            const isWaitingMod = (listing as any).status === 'en_attente';
            const isRejected = (listing as any).status === 'rejetee';

            return (
              <article key={listing.id} className="rounded-[22px] p-3.5 flex flex-col gap-3.5 relative" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: '0 6px 20px rgba(35, 23, 67, 0.045)' }}>
                {/* Main Row */}
                <div className="flex gap-4">
                  {/* Cover Photo */}
                  <div className="w-[88px] h-[88px] rounded-[16px] overflow-hidden flex-shrink-0" style={{ background: 'var(--imx-surface-2)' }}>
                    {coverPhoto?.photo_url ? (
                      <img
                        src={coverPhoto.photo_url}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--imx-text-muted)' }}>
                        <Home size={25} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <h3 className="font-nunito font-black text-[15px] leading-[1.25]" style={{ color: 'var(--imx-text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {listing.title}
                        </h3>
                        <p className="text-[11px] mt-1 flex items-center gap-1 truncate" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                          <MapPin size={11} className="shrink-0" /> {listing.neighborhood || listing.city}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-2 mt-auto">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isPublished && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md" style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}>
                            <CheckCircle2 size={10} /> Active
                          </span>
                        )}

                        {isDeletionPending && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                            <Clock size={10} /> Suppression en attente
                          </span>
                        )}

                        {isDeleted && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                            <Archive size={10} /> Archivée
                          </span>
                        )}

                        {isWaitingMod && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                            <Clock size={10} /> En attente de validation
                          </span>
                        )}

                        {isRejected && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md bg-red-50 text-red-500"
                            title={(listing as any).rejection_reason || ''}
                          >
                            <AlertCircle size={10} /> Rejetée
                          </span>
                        )}
                      </div>
                      {(listing as any).monthly_rent && (
                        <p className="font-nunito font-black text-[15px] whitespace-nowrap" style={{ color: 'var(--imx-text-primary)' }}>
                          {new Intl.NumberFormat('fr-FR').format((listing as any).monthly_rent)} <span className="text-[10px] font-bold" style={{ color: 'var(--imx-text-secondary)' }}>FCFA/mois</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status explainer banner */}
                {isDeletionPending && (
                  <div className="p-2.5 rounded-xl text-[10px] flex items-center gap-1.5" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                    <Clock size={12} className="flex-shrink-0" color="var(--imx-accent)" />
                    <span>Votre demande de suppression est actuellement examinée par l'administration.</span>
                  </div>
                )}
                {isDeleted && (
                  <div className="p-2.5 rounded-xl text-[10px] flex items-center gap-1.5" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                    <Archive size={12} className="flex-shrink-0" color="var(--imx-accent)" />
                    <span>Cette annonce a été archivée et n'est plus visible publiquement.</span>
                  </div>
                )}

                {/* Sélecteur de disponibilité avec menu flottant contextuel */}
                {isPublished && !isDeletionPending && !isDeleted && (
                  <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--imx-border)' }}>
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                      Statut de location
                    </span>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenAvailabilityMenuId(openAvailabilityMenuId === listing.id ? null : listing.id);
                        }}
                        className="flex items-center gap-1.5 bg-[var(--imx-surface)] text-[var(--imx-text-primary)] text-[10px] rounded-lg px-2.5 py-1.5 font-semibold border border-[var(--imx-border)] focus:border-[var(--imx-accent-light)] transition-colors cursor-pointer"
                      >
                        {listing.availability_status === 'disponible' && (
                          <>
                            <CheckCircle2 size={12} color="var(--imx-accent)" />
                            <span>Disponible</span>
                          </>
                        )}
                        {listing.availability_status === 'reserve' && (
                          <>
                            <Clock size={12} color="var(--imx-accent)" />
                            <span>Indisponible temp.</span>
                          </>
                        )}
                        {listing.availability_status === 'occupe' && (
                          <>
                            <Home size={12} color="var(--imx-accent)" />
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
                                  ? 'bg-[var(--imx-accent-xlight)] text-[var(--imx-accent)]'
                                  : 'text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <CheckCircle2 size={14} color="var(--imx-accent)" />
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
                                  ? 'bg-[var(--imx-accent-xlight)] text-[var(--imx-accent)]'
                                  : 'text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <Clock size={14} color="var(--imx-accent)" />
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
                                  ? 'bg-[var(--imx-accent-xlight)] text-[var(--imx-accent)]'
                                  : 'text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)]'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <Home size={14} color="var(--imx-accent)" />
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
                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--imx-border)' }}>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                    <MessageCircle size={13} color="var(--imx-accent)" />
                    {listing.contactRequestsCount} demande{listing.contactRequestsCount !== 1 ? 's' : ''}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Voir l'annonce */}
                    <Link
                      to={`/annonce/${listing.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-colors"
                      style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-primary)' }}
                    >
                      <Eye size={12} />
                      Voir
                    </Link>

                    {/* Gérer les demandes */}
                    {listing.availability_status === 'disponible' && isPublished && (
                      <Link
                        to={`/pro/activer/${listing.id}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-white active:scale-[0.98] transition-transform"
                        style={{ background: 'var(--imx-accent)' }}
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
                      className={`flex items-center justify-center w-8 h-8 rounded-xl transition-all ${
                        isDeletionPending
                          ? 'bg-[var(--imx-surface-2)] text-[var(--imx-text-muted)] cursor-not-allowed'
                        : isDeleted
                          ? 'bg-[var(--imx-surface-2)] text-[var(--imx-text-muted)] cursor-not-allowed'
                          : 'bg-[var(--imx-surface-2)] text-[var(--imx-text-secondary)] hover:text-red-500 active:scale-95'
                      }`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </article>
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
