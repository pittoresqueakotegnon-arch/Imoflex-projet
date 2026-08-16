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
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(req.id)}
                      className="p-1.5 -mr-1 rounded-lg text-[var(--imx-text-secondary)] hover:text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)] transition-colors"
                      aria-label="Actions"
                    >
                      <MoreVertical size={18} />
                    </button>
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

      {/* Menu d'actions glissant (Bottom Sheet) */}
      {openMenuId && activeRequest && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setOpenMenuId(null)}
        >
          <div
            className="bg-[var(--imx-surface)] border-t border-[var(--imx-border)] rounded-t-3xl p-5 w-full max-w-md space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-2" />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-nunito font-800 text-[var(--imx-text-primary)] text-base">
                  {activeRequest.requester_name || 'Demande de contact'}
                </h3>
                <p className="text-xs text-[var(--imx-text-secondary)] truncate" style={{ fontFamily: 'Space Grotesk' }}>
                  {activeRequest.listing_title || 'Logement'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenMenuId(null)}
                className="p-1 text-[var(--imx-text-secondary)] hover:text-[var(--imx-text-primary)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              {/* 1. Appeler */}
              {activeRequest.requester_phone ? (
                <a
                  href={`tel:${activeRequest.requester_phone}`}
                  onClick={() => setOpenMenuId(null)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--imx-surface-2)] hover:bg-white/5 text-[var(--imx-text-primary)] transition-all font-semibold text-xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                    <Phone size={16} />
                  </div>
                  <div className="text-left">
                    <div>Appeler</div>
                    <div className="text-[10px] text-[var(--imx-text-secondary)]">{activeRequest.requester_phone}</div>
                  </div>
                </a>
              ) : (
                <div className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--imx-surface-2)] opacity-50 text-[var(--imx-text-secondary)] text-xs">
                  <div className="w-8 h-8 rounded-lg bg-gray-500/20 flex items-center justify-center">
                    <Phone size={16} />
                  </div>
                  <div>Numéro indisponible</div>
                </div>
              )}

              {/* 2. WhatsApp */}
              {activeRequest.requester_phone ? (
                <a
                  href={`https://wa.me/${activeRequest.requester_phone.replace(/\D/g, '')}?text=Bonjour%2C%20je%20suis%20votre%20bailleur%20sur%20ImoFlex.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpenMenuId(null)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all font-semibold text-xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <MessageCircle size={16} />
                  </div>
                  <div className="text-left">
                    <div>WhatsApp</div>
                    <div className="text-[10px] text-emerald-300/80">Ouvrir la conversation</div>
                  </div>
                </a>
              ) : null}

              {/* 3. Accepter ce locataire */}
              <button
                type="button"
                onClick={() => {
                  setOpenMenuId(null);
                  navigate(`/pro/activer/${activeRequest.listing_id}?request_id=${activeRequest.id}`);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[var(--imx-accent-light)] hover:bg-purple-500/20 transition-all font-semibold text-xs"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-[var(--imx-accent-light)] flex items-center justify-center">
                  <UserCheck size={16} />
                </div>
                <div className="text-left">
                  <div>Accepter ce locataire</div>
                  <div className="text-[10px] text-purple-300/80">Créer le bail et activer le contrat</div>
                </div>
              </button>

              {/* 4. Marquer comme traitée */}
              <button
                type="button"
                onClick={() => {
                  handleMarkAsRead(activeRequest.id);
                  setOpenMenuId(null);
                }}
                disabled={activeRequest.status === 'traitee' || markingAsRead === activeRequest.id}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all font-semibold text-xs ${
                  activeRequest.status === 'traitee'
                    ? 'bg-[var(--imx-surface-2)] opacity-50 text-[var(--imx-text-secondary)]'
                    : 'bg-white/5 hover:bg-white/10 text-[var(--imx-text-primary)]'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 text-[var(--imx-text-primary)] flex items-center justify-center">
                  <Check size={16} />
                </div>
                <div className="text-left">
                  <div>{activeRequest.status === 'traitee' ? 'Déjà marquée comme traitée' : 'Marquer comme traitée'}</div>
                  <div className="text-[10px] text-[var(--imx-text-secondary)]">Archiver la demande de contact</div>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOpenMenuId(null)}
              className="w-full py-2 text-center text-xs font-semibold text-[var(--imx-text-secondary)] hover:text-[var(--imx-text-primary)] transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Demandes;
