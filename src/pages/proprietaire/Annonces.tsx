import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Home } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Listing } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';

interface AnnounceListItem extends Listing {
  contactRequestsCount: number;
}

const Annonces: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [listings, setListings] = useState<AnnounceListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;

    const fetchListings = async () => {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('id, title, city, neighborhood, availability_status, status, rejection_reason, created_at, owner_id, listing_photos(photo_url, is_cover)')
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
              ...(listing as Listing),
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

  if (loading) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card h-32 animate-pulse"></div>
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
          <h1 className="font-nunito font-900 text-lg text-white">Mes annonces</h1>
          <p className="text-[#8B7BB5] text-xs mt-0.5" style={{ fontFamily: 'Space Grotesk' }}>Gestion de vos biens</p>
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
        <div className="px-4 py-4 space-y-3 flex-1 pb-6">
          {listings.map(listing => {
            const coverPhoto = listing.listing_photos?.find(p => p.is_cover) || listing.listing_photos?.[0];

            return (
              <div key={listing.id} className="card p-3.5 flex gap-3.5">
                {/* Cover Photo */}
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-[#261C55]">
                  {coverPhoto?.photo_url ? (
                    <img
                      src={coverPhoto.photo_url}
                      alt={listing.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#4A3D7A]">
                      <Home size={24} />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <h3 className="font-nunito font-700 text-white text-sm truncate leading-tight">
                        {listing.title}
                      </h3>
                      <p className="text-[10px] text-[#8B7BB5] mt-0.5 truncate" style={{ fontFamily: 'Space Grotesk' }}>
                        {listing.neighborhood || listing.city}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-2 pt-2 border-t border-[#261C55]">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={listing.availability_status} />
                      {/* Moderation status */}
                      {(listing as any).status === 'en_attente' && (
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}>
                          En attente
                        </span>
                      )}
                      {(listing as any).status === 'rejetee' && (
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
                          title={(listing as any).rejection_reason || ''}
                        >
                          Rejetée
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#8B7BB5] font-semibold" style={{ fontFamily: 'Space Grotesk' }}>
                        {listing.contactRequestsCount} demande{listing.contactRequestsCount !== 1 ? 's' : ''}
                      </span>
                      {listing.availability_status === 'disponible' && (listing as any).status === 'publiee' && (
                        <Link
                          to={`/pro/activer/${listing.id}`}
                          className="btn-primary btn-sm py-1.5"
                          style={{ height: '30px', fontSize: '10px' }}
                        >
                          Activer
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Annonces;
