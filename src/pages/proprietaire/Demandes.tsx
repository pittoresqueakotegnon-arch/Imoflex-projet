import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Check, UserCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ContactRequest } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { HeaderBell } from '../../components/HeaderBell';
import { useToast } from '../../components/Toast';

interface RequestWithDetails extends ContactRequest {
  listing_title?: string;
  requester_name?: string;
  requester_phone?: string;
}

const Demandes: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<RequestWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAsRead, setMarkingAsRead] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id) return;

    const fetchRequests = async () => {
      try {
        // Get owner's listings
        const { data: listings, error: listingsError } = await supabase
          .from('listings')
          .select('id, title')
          .eq('owner_id', profile.id);

        if (listingsError) throw listingsError;

        const listingIds = listings?.map(l => l.id) || [];
        if (listingIds.length === 0) {
          setRequests([]);
          setLoading(false);
          return;
        }

        // Get contact requests for these listings
        const { data: contactData, error: contactError } = await supabase
          .from('contact_requests')
          .select('id, requester_id, listing_id, message, status, created_at, contact_phone')
          .in('listing_id', listingIds)
          .order('created_at', { ascending: false });

        if (contactError) throw contactError;

        const requesterIds = [...new Set((contactData || []).map(r => r.requester_id))];
        let usersById: Record<string, { full_name: string; phone: string }> = {};

        if (requesterIds.length > 0) {
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, full_name, phone')
            .in('id', requesterIds);

          if (usersError) throw usersError;
          usersById = (usersData || []).reduce((acc, u) => {
            acc[u.id] = { full_name: u.full_name, phone: u.phone };
            return acc;
          }, {} as Record<string, { full_name: string; phone: string }>);
        }

        const enrichedRequests: RequestWithDetails[] = (contactData || []).map(req => {
          const listing = listings?.find(l => l.id === req.listing_id);
          const user = usersById[req.requester_id];
          return {
            ...req,
            listing_title: listing?.title,
            requester_name: user?.full_name,
            requester_phone: req.contact_phone || user?.phone,
          };
        });

        setRequests(enrichedRequests);
      } catch (error) {
        console.error('Error fetching requests:', error);
        showToast('Erreur lors du chargement des demandes', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [profile?.id, showToast]);

  const handleMarkAsRead = async (requestId: string) => {
    setMarkingAsRead(requestId);
    try {
      const { error } = await supabase
        .from('contact_requests')
        .update({ status: 'traitee' })
        .eq('id', requestId);

      if (error) throw error;

      setRequests(requests.map(r =>
        r.id === requestId ? { ...r, status: 'traitee' } : r
      ));

      showToast('Demande marquée comme traitée', 'success');
    } catch (error) {
      console.error('Error marking as read:', error);
      showToast('Erreur lors de la mise à jour', 'error');
    } finally {
      setMarkingAsRead(null);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card h-28 animate-pulse"></div>
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-nunito font-900 text-white">Demandes reçues</h1>
          </div>
          <HeaderBell />
        </header>
        <EmptyState
          title="Aucune demande reçue"
          description="Les demandes de contact de vos locataires potentiels apparaîtront ici."
        />
        <BottomNav />
      </div>
    );
  }

  // Group requests by listing
  const groupedRequests = requests.reduce((acc, req) => {
    const title = req.listing_title || 'Non spécifié';
    if (!acc[title]) acc[title] = [];
    acc[title].push(req);
    return acc;
  }, {} as Record<string, RequestWithDetails[]>);

  return (
    <div className="page-container">
      {/* Header */}
      <header className="sticky-header px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-nunito font-900 text-white">Demandes reçues</h1>
          <p className="text-[#8B7BB5] text-xs mt-0.5" style={{ fontFamily: 'Space Grotesk' }}>Boîte de réception</p>
        </div>
        <HeaderBell />
      </header>

      <div className="px-4 py-4 space-y-5 flex-1 pb-6">
        {Object.entries(groupedRequests).map(([listingTitle, groupRequests]) => (
          <div key={listingTitle} className="space-y-2.5">
            <h2 className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-1">
              {listingTitle}
            </h2>
            <div className="space-y-3">
              {groupRequests.map(req => {
                const isNew = req.status === 'nouvelle';
                return (
                  <div key={req.id} className="card p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-nunito font-800 text-white text-base leading-tight">
                          {req.requester_name}
                        </h3>
                        <p className="text-[#8B7BB5] text-xs italic mt-1.5 leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
                          « {req.message} »
                        </p>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#261C55]">
                      <span className="text-[#8B7BB5] text-xs font-mono bg-[#261C55] px-2 py-0.5 rounded">
                        {req.requester_phone || 'N/A'}
                      </span>

                      <div className="flex flex-wrap justify-end gap-2">
                        {req.requester_phone && (
                          <a
                            href={`tel:${req.requester_phone}`}
                            className="btn-ghost btn-sm flex items-center gap-1.5"
                          >
                            <Phone size={12} />
                            Appeler
                          </a>
                        )}

                        <button
                          onClick={() => navigate(`/pro/activer/${req.listing_id}?request_id=${req.id}`)}
                          className="btn-ghost btn-sm flex items-center gap-1.5 text-[#A855F7]"
                        >
                          <UserCheck size={12} />
                          Sélectionner
                        </button>

                        {isNew && (
                          <button
                            onClick={() => handleMarkAsRead(req.id)}
                            disabled={markingAsRead === req.id}
                            className="btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Check size={12} />
                            Traitée
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
};

export default Demandes;
