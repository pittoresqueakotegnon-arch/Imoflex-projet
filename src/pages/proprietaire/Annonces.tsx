import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Home, Eye, Trash2, Clock, CheckCircle2, AlertCircle, Archive } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary, AvailabilityStatus } from '../../lib/supabase';
import { updateAvailability } from '../../hooks/useListings';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { DemandeSuppressionModal } from '../../components/DemandeSuppressionModal';

interface AnnounceListItem extends ListingSummary {
  contactRequestsCount: number;
}

const Annonces: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [listings, setListings] = useState<AnnounceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListingForDelete, setSelectedListingForDelete] = useState<{
    id: string;
    title: string;
    owner_id: string;
  } | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    const fetchListings = async () => {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('id, title, city, neighborhood, availability_status, status, rejection_reason, created_at, owner_id, monthly_rent, listing_photos(photo_url, is_cover)')
          .eq('owner_id', profile.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const listingsWithCounts: AnnounceListItem[] = [];

        for (const listing of data || []) {
          const { count, error: countError } = await supabase
            .from('contact_requests')
            .select('id', { count: 'exact' })
            .eq('listing_id', listing.id);

          if (!countError) {
            listingsWithCounts.push({
              ...(listing as ListingSummary),
              contactRequestsCount: count || 0,
            });
          }
        }

        setListings(listingsWithCounts);
      } catch (error) {
        console.error('Error fetching listings:', error);
        showToast('Erreur lors du chargement des annonces', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [profile?.id, showToast]);

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
              <div key={listing.id} className="card p-3.5 flex flex-col gap-3">
                {/* Main Row */}
                <div className="flex gap-3.5">
                  {/* Cover Photo */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--imx-surface-2)]">
                    {coverPhoto?.photo_url ? (
                      <img
                        src={coverPhoto.photo_url}
                        alt={listing.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[var(--imx-text-muted)]">
                        <Home size={24} />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <h3 className="font-nunito font-700 text-[var(--imx-text-primary)] text-sm truncate leading-tight">
                          {listing.title}
                        </h3>
                        <p className="text-[10px] text-[var(--imx-text-secondary)] mt-0.5 truncate" style={{ fontFamily: 'Space Grotesk' }}>
                          {listing.neighborhood || listing.city}
                        </p>
                      </div>
                      {/* Prix loyer mensuel */}
                      {(listing as any).monthly_rent && (
                        <span className="text-[10px] font-bold text-[var(--imx-accent-light)] whitespace-nowrap flex-shrink-0" style={{ fontFamily: 'Space Grotesk' }}>
                          {new Intl.NumberFormat('fr-FR').format((listing as any).monthly_rent)} FCFA/mois
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <StatusBadge status={listing.availability_status} />
                      
                      {/* Status Badges */}
                      {isPublished && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      )}

                      {isDeletionPending && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <Clock size={10} /> Suppression en attente
                        </span>
                      )}

                      {isDeleted && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/20">
                          <Archive size={10} /> Archivée
                        </span>
                      )}

                      {isWaitingMod && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                          <Clock size={10} /> En attente de validation
                        </span>
                      )}

                      {isRejected && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20"
                          title={(listing as any).rejection_reason || ''}
                        >
                          <AlertCircle size={10} /> Rejetée
                        </span>
                      )}
                    </div>
                  </div>
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

                {/* Sélecteur de disponibilité */}
                {isPublished && !isDeletionPending && !isDeleted && (
                  <div className="flex items-center justify-between pt-1 pb-1">
                    <label className="text-[10px] text-[var(--imx-text-secondary)] font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
                      Disponibilité du bien
                    </label>
                    <select
                      value={listing.availability_status}
                      onChange={(e) => handleAvailabilityChange(listing.id, e.target.value as AvailabilityStatus)}
                      className="bg-[var(--imx-surface-2)] text-[var(--imx-text-primary)] text-[10px] rounded-lg px-2 py-1 outline-none font-semibold border border-[var(--imx-border)] focus:border-[var(--imx-accent-light)] transition-colors cursor-pointer"
                    >
                      <option value="disponible">✅ Disponible</option>
                      <option value="reserve">⏳ Indisponible temp.</option>
                      <option value="occupe">🏠 Occupé (Loué)</option>
                    </select>
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--imx-surface-2)]">
                  <div className="text-[10px] text-[var(--imx-text-secondary)] font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
                    {listing.contactRequestsCount} demande{listing.contactRequestsCount !== 1 ? 's' : ''}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Voir l'annonce */}
                    <Link
                      to={`/annonce/${listing.id}`}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-[var(--imx-surface-2)] text-[var(--imx-text-primary)] hover:bg-white/10 transition-colors"
                    >
                      <Eye size={11} />
                      Voir
                    </Link>

                    {/* Gérer les demandes */}
                    {listing.availability_status === 'disponible' && isPublished && (
                      <Link
                        to={`/pro/activer/${listing.id}`}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-purple-500/15 text-[var(--imx-accent-light)] hover:bg-purple-500/25 transition-colors"
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
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                        isDeletionPending
                          ? 'bg-amber-500/10 text-amber-400/60 cursor-not-allowed border border-amber-500/20'
                          : isDeleted
                          ? 'bg-slate-500/10 text-slate-500 cursor-not-allowed'
                          : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95 border border-red-500/20'
                      }`}
                    >
                      <Trash2 size={11} />
                      {isDeletionPending ? 'En attente' : isDeleted ? 'Archivée' : 'Supprimer'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de demande de suppression */}
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
