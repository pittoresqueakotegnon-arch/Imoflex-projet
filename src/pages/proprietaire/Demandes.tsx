import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Check, UserCheck, MessageCircle, ChevronDown, MoreVertical, X } from 'lucide-react';
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
  const [allListings, setAllListings] = useState<{ id: string; title: string }[]>([]);
  const [selectedListingFilter, setSelectedListingFilter] = useState<string>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
        setAllListings(listings || []);
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

  const activeRequest = requests.find(r => r.id === openMenuId);

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
            <h1 className="text-xl font-nunito font-900 text-[var(--imx-text-primary)]">Demandes reçues</h1>
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

  return (
    <div className="page-container">
      {/* Header */}
      <header className="sticky-header px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-nunito font-900 text-[var(--imx-text-primary)]">Demandes reçues</h1>
          <p className="text-[var(--imx-text-secondary)] text-xs mt-0.5" style={{ fontFamily: 'Space Grotesk' }}>Boîte de réception</p>
        </div>
        <HeaderBell />
      </header>

      {/* Filtre par logement */}
      {allListings.length > 1 && (
        <div className="px-4 pb-2">
          <div className="relative">
            <select
              value={selectedListingFilter}
              onChange={(e) => setSelectedListingFilter(e.target.value)}
              className="w-full appearance-none font-nunito text-[13px] font-600 text-[var(--imx-text-primary)] rounded-xl px-4 pr-9 py-2.5 outline-none"
              style={{ background: 'var(--imx-surface)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <option value="all">Tous les logements</option>
              {allListings.map(l => (
                <option key={l.id} value={l.id}>{l.title}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--imx-text-secondary)] pointer-events-none" />
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-5 flex-1 pb-6">
        {Object.entries(
          // Appliquer le filtre par logement sélectionné
          (selectedListingFilter === 'all' ? requests : requests.filter(r => r.listing_id === selectedListingFilter))
            .reduce((acc, req) => {
              const title = req.listing_title || 'Non spécifié';
              if (!acc[title]) acc[title] = [];
              acc[title].push(req);
              return acc;
            }, {} as Record<string, RequestWithDetails[]>)
        ).map(([listingTitle, groupRequests]) => (
          <div key={listingTitle} className="space-y-2.5">
            <h2 className="text-[var(--imx-text-secondary)] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-1">
              {listingTitle}
            </h2>
            <div className="space-y-3">
              {groupRequests.map(req => (
                <div key={req.id} className="card p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-nunito font-800 text-[var(--imx-text-primary)] text-base leading-tight">
                          {req.requester_name || 'Locataire potentiel'}
                        </h3>
                        <StatusBadge status={req.status} />
                      </div>
                      <p className="text-[var(--imx-text-secondary)] text-xs italic mt-1.5 leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
                        « {req.message} »
                      </p>
                    </div>

                    {/* Bouton ⋮ avec menu contextuel flottant */}
                    <div className="relative flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === req.id ? null : req.id);
                        }}
                        className="p-1.5 -mr-1 rounded-lg text-[var(--imx-text-secondary)] hover:text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)] transition-colors"
                        aria-label="Options"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {openMenuId === req.id && (
                        <>
                          {/* Backdrop transparent pour fermer au clic dehors */}
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                            }}
                          />
                          {/* Menu flottant contextuel */}
                          <div
                            className="absolute right-0 top-full mt-1 w-52 bg-[var(--imx-surface)] border border-[var(--imx-border)] rounded-2xl shadow-2xl z-50 py-1.5 overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* 1. Appeler */}
                            {req.requester_phone ? (
                              <a
                                href={`tel:${req.requester_phone}`}
                                onClick={() => setOpenMenuId(null)}
                                className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)] transition-colors"
                              >
                                <Phone size={14} className="text-blue-400" />
                                <span>Appeler</span>
                              </a>
                            ) : null}

                            {/* 2. WhatsApp */}
                            {req.requester_phone ? (
                              <a
                                href={`https://wa.me/${req.requester_phone.replace(/\D/g, '')}?text=Bonjour%2C%20je%20suis%20votre%20bailleur%20sur%20ImoFlex.`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOpenMenuId(null)}
                                className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                              >
                                <MessageCircle size={14} className="text-emerald-400" />
                                <span>WhatsApp</span>
                              </a>
                            ) : null}

                            {/* 3. Accepter ce locataire */}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                navigate(`/pro/activer/${req.listing_id}?request_id=${req.id}`);
                              }}
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[var(--imx-accent-light)] hover:bg-purple-500/10 transition-colors text-left"
                            >
                              <UserCheck size={14} className="text-[var(--imx-accent-light)]" />
                              <span>Accepter ce locataire</span>
                            </button>

                            {/* 4. Marquer comme traitée */}
                            {req.status !== 'traitee' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleMarkAsRead(req.id);
                                }}
                                disabled={markingAsRead === req.id}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[var(--imx-text-secondary)] hover:text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)] transition-colors text-left border-t border-[var(--imx-border)]"
                              >
                                <Check size={14} />
                                <span>Marquer comme traitée</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1 pt-2 border-t border-[var(--imx-surface-2)]">
                    <span className="text-[var(--imx-text-secondary)] text-xs font-mono bg-[var(--imx-surface-2)] px-2 py-0.5 rounded">
                      {req.requester_phone || 'N/A'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
};

export default Demandes;
