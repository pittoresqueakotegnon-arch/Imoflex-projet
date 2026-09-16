import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Check, UserCheck, MessageCircle, ChevronDown, MoreVertical, Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ContactRequest } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { HeaderBell } from '../../components/HeaderBell';
import { useToast } from '../../components/Toast';
import { PullToRefresh } from '../../components/PullToRefresh';

interface RequestWithDetails extends ContactRequest {
  listing_title?: string;
  requester_name?: string;
  requester_phone?: string;
}

// ─── Dropdown custom (remplace le <select> natif pour garder le style arrondi) ──
interface FilterDropdownProps {
  value: string;
  onChange: (val: string) => void;
  listings: { id: string; title: string }[];
}

const FilterDropdown: React.FC<FilterDropdownProps> = ({ value, onChange, listings }) => {
  const [open, setOpen] = React.useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allOptions = [{ id: 'all', title: 'Tous les logements' }, ...listings];
  const selected = allOptions.find(o => o.id === value) || allOptions[0];

  const truncate = (s: string, n = 35) => s.length > n ? s.substring(0, n - 3) + '...' : s;

  // Fermer si clic dehors
  useEffect(() => {
    const handleOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOut);
    return () => document.removeEventListener('mousedown', handleOut);
  }, []);

  return (
    <div ref={ref} className="relative px-5 pb-1">
      {/* Bouton principal */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between font-nunito text-[13px] font-semibold text-[var(--imx-text-primary)] rounded-xl px-3.5 py-3 outline-none transition-all active:scale-[0.98]"
        style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}
      >
        <span>{truncate(selected.title)}</span>
        <ChevronDown
          size={14}
          className="text-[var(--imx-text-secondary)] transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Liste déroulante */}
      {open && (
        <div
          className="absolute left-5 right-5 z-[500] mt-1 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
        >
          {allOptions.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className="w-full text-left px-4 py-3 text-[13px] font-nunito font-600 transition-all"
              style={{
                color: opt.id === value ? 'var(--imx-accent)' : 'var(--imx-text-primary)',
                background: opt.id === value ? 'var(--imx-accent-xlight)' : 'transparent',
                fontWeight: opt.id === value ? 700 : 600,
              }}
            >
              {truncate(opt.title)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────

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

  const fetchRequests = useCallback(async () => {
    if (!profile?.id) return;
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
  }, [profile?.id, showToast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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

  const pendingRequests = requests.filter((request) => request.status !== 'traitee');
  const handledRequests = requests.filter((request) => request.status === 'traitee');
  const listingCount = new Set(requests.map((request) => request.listing_id)).size;

  if (requests.length === 0) {
    return (
      <div className="page-container premium-page">
        <header className="premium-header px-5 pt-6 pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-nunito font-black text-[var(--imx-text-primary)]">Demandes</h1>
            <p className="text-[12px] mt-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>Boîte de réception locative</p>
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
    <div className="page-container premium-page">
      {/* Header */}
      <header className="premium-header px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-nunito font-black text-[var(--imx-text-primary)]">Demandes</h1>
          <p className="text-[12px] mt-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
            {pendingRequests.length} à traiter · {listingCount} logement{listingCount > 1 ? 's' : ''}
          </p>
        </div>
        <HeaderBell />
      </header>

      <PullToRefresh onRefresh={fetchRequests}>
        <div className="px-5 pt-1 pb-4">
          <div className="rounded-2xl px-4 py-3 grid grid-cols-2" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: '0 6px 18px rgba(35, 23, 67, 0.04)' }}>
            <div className="pr-4" style={{ borderRight: '1px solid var(--imx-border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>À traiter</p>
              <p className="font-nunito font-black text-[18px] mt-0.5" style={{ color: 'var(--imx-accent)' }}>{pendingRequests.length}</p>
            </div>
            <div className="pl-4">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>Traitées</p>
              <p className="font-nunito font-black text-[18px] mt-0.5 text-[var(--imx-text-primary)]">{handledRequests.length}</p>
            </div>
          </div>
        </div>
        {/* Filtre par logement — Dropdown custom (sans select natif) */}
        {allListings.length > 1 && (
          <FilterDropdown
            value={selectedListingFilter}
            onChange={setSelectedListingFilter}
            listings={allListings}
          />
        )}

      <div className="px-5 pt-3 space-y-5 flex-1 pb-8">
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
            <h2 className="text-[11px] font-semibold flex items-center gap-1.5 mb-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
              <Building2 size={13} color="var(--imx-accent)" />
              <span className="truncate">{listingTitle}</span>
            </h2>
            <div className="space-y-3">
              {groupRequests.map(req => (
                <article key={req.id} className="rounded-[20px] p-4 flex flex-col gap-3" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: '0 6px 18px rgba(35, 23, 67, 0.04)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 flex gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-nunito font-black text-[14px]" style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}>
                        {req.requester_name?.charAt(0).toUpperCase() || 'L'}
                      </div>
                      <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px] leading-tight">
                          {req.requester_name || 'Locataire potentiel'}
                        </h3>
                        <span className="text-[9px] font-bold px-2 py-1 rounded-md" style={{ background: req.status === 'traitee' ? 'var(--imx-surface-2)' : 'var(--imx-accent-xlight)', color: req.status === 'traitee' ? 'var(--imx-text-secondary)' : 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}>
                          {req.status === 'traitee' ? 'TRAITÉE' : 'À TRAITER'}
                        </span>
                      </div>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                        Reçue le {new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </p>
                      </div>
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
                                <Phone size={14} color="var(--imx-accent)" />
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
                                className="flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface-2)] transition-colors"
                              >
                                <MessageCircle size={14} color="var(--imx-accent)" />
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
                              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-[var(--imx-accent)] hover:bg-[var(--imx-accent-xlight)] transition-colors text-left"
                            >
                              <UserCheck size={14} color="var(--imx-accent)" />
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

                  {req.message && (
                    <p className="text-[12px] leading-relaxed px-3 py-2.5 rounded-xl" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                      « {req.message} »
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--imx-border)' }}>
                    <span className="text-[11px] font-semibold truncate max-w-[130px]" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                      {req.requester_phone || 'Téléphone non renseigné'}
                    </span>
                    {req.status === 'traitee' ? (
                      <span className="text-[10px] font-bold px-2.5 py-2 rounded-xl" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                        Déjà traitée
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(`/pro/activer/${req.listing_id}?request_id=${req.id}`)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold text-white active:scale-[0.98] transition-transform"
                        style={{ background: 'var(--imx-accent)' }}
                      >
                        Traiter <ArrowRight size={13} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
      </PullToRefresh>

      <BottomNav />
    </div>
  );
};

export default Demandes;
