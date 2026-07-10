import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ContactRequest, Listing } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { MessageSquare, Clock, CheckCircle, ChevronRight, MapPin } from 'lucide-react';

interface ContactRequestWithListing extends ContactRequest {
  listings?: Listing & {
    listing_photos?: { id: string; photo_url: string; is_cover: boolean }[];
  };
}

type FilterStatus = 'all' | 'nouvelle' | 'traitee';

const getStatusConfig = (status: string) => {
  const map: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; border: string }> = {
    nouvelle: {
      label: 'En attente',
      icon: <Clock size={11} />,
      bg: 'rgba(251, 191, 36, 0.1)',
      text: '#FBBF24',
      border: 'rgba(251, 191, 36, 0.25)',
    },
    traitee: {
      label: 'Traitée',
      icon: <CheckCircle size={11} />,
      bg: 'rgba(34, 197, 94, 0.1)',
      text: '#22C55E',
      border: 'rgba(34, 197, 94, 0.25)',
    },
  };
  return (
    map[status] ?? {
      label: status,
      icon: null,
      bg: 'rgba(139,123,181,0.1)',
      text: '#8B7BB5',
      border: 'rgba(139,123,181,0.2)',
    }
  );
};

const formatDateShort = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const MesDemandes: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<ContactRequestWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadRequests = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: err } = await supabase
          .from('contact_requests')
          .select(
            `*,
            listings(id, title, city, neighborhood, monthly_rent, listing_photos(id, photo_url, is_cover))`
          )
          .eq('requester_id', user.id)
          .order('created_at', { ascending: false });

        if (err) setError(err.message);
        else setRequests((data || []) as ContactRequestWithListing[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, [user]);

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === 'nouvelle').length;

  /* ── Non connecté ─────────────────────────────────────── */
  if (!user) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-4">
          <h1 className="font-nunito font-800 text-xl text-[#E8E0FF]">Mes demandes</h1>
        </header>
        <EmptyState
          icon={<MessageSquare size={48} className="text-[#8B7BB5]" />}
          title="Connectez-vous d'abord"
          description="Vous devez être connecté pour voir vos demandes."
          action={{ label: 'Se connecter', href: '/login' }}
        />
        <BottomNav />
      </div>
    );
  }

  /* ── Chargement ───────────────────────────────────────── */
  if (loading) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-4">
          <h1 className="font-nunito font-800 text-xl text-[#E8E0FF]">Mes demandes</h1>
        </header>
        <div className="px-4 py-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-[#1A1240] rounded-2xl animate-pulse" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky-header px-4 pt-6 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-nunito font-900 text-xl text-[#E8E0FF]">Mes demandes</h1>
          {pendingCount > 0 && (
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded-full"
              style={{
                background: 'rgba(251, 191, 36, 0.15)',
                color: '#FBBF24',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                fontFamily: 'Space Grotesk',
              }}
            >
              {pendingCount} en attente
            </span>
          )}
        </div>
        <p className="text-[#8B7BB5] text-xs mb-4" style={{ fontFamily: 'Space Grotesk' }}>
          Suivi de vos contacts envoyés aux propriétaires
        </p>

        {/* Filtre pills */}
        <div className="flex gap-2">
          {(['all', 'nouvelle', 'traitee'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
              style={{
                background: filter === s ? '#A855F7' : 'rgba(38, 28, 85, 0.6)',
                color: filter === s ? '#fff' : '#8B7BB5',
                fontFamily: 'Space Grotesk',
              }}
            >
              {s === 'all' ? 'Toutes' : s === 'nouvelle' ? '⏳ En attente' : '✅ Traitées'}
            </button>
          ))}
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────── */}
      {error ? (
        <EmptyState
          title="Erreur"
          description={error}
          action={{ label: 'Réessayer', onClick: () => window.location.reload() }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={48} className="text-[#8B7BB5]" />}
          title={filter === 'all' ? 'Aucune demande' : 'Aucune demande dans cette catégorie'}
          description={
            filter === 'all'
              ? 'Contactez un propriétaire depuis la marketplace pour voir vos demandes ici.'
              : 'Essayez un autre filtre.'
          }
          action={filter === 'all' ? { label: 'Explorer la marketplace', href: '/' } : undefined}
        />
      ) : (
        <div className="px-4 py-4 space-y-3 flex-1 pb-24">
          {filtered.map(request => {
            const listing = request.listings;
            const cfg = getStatusConfig(request.status);
            const coverPhoto = listing?.listing_photos?.find(p => p.is_cover) || listing?.listing_photos?.[0];

            return (
              <button
                key={request.id}
                onClick={() => listing && navigate(`/annonce/${listing.id}`)}
                className="w-full text-left"
              >
                <div
                  className="rounded-2xl p-4 flex gap-3 items-start transition-all"
                  style={{
                    background: 'rgba(26, 18, 64, 0.8)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  {/* Photo miniature */}
                  <div
                    className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden"
                    style={{ background: '#261C55' }}
                  >
                    {coverPhoto ? (
                      <img
                        src={coverPhoto.photo_url}
                        alt={listing?.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">🏠</div>
                    )}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-nunito font-700 text-[#E8E0FF] text-sm leading-tight line-clamp-1 flex-1">
                        {listing?.title || 'Annonce supprimée'}
                      </h3>
                      <ChevronRight size={14} className="text-[#4A3D7A] flex-shrink-0 mt-0.5" />
                    </div>

                    {listing?.city && (
                      <div className="flex items-center gap-1 mb-1.5">
                        <MapPin size={10} className="text-[#8B7BB5]" />
                        <span className="text-[#8B7BB5] text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                          {listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}
                        </span>
                      </div>
                    )}

                    {/* Message tronqué */}
                    <p
                      className="text-[#6B5B9A] text-[11px] italic line-clamp-1 mb-2"
                      style={{ fontFamily: 'Space Grotesk' }}
                    >
                      «&nbsp;{request.message.substring(0, 60)}{request.message.length > 60 ? '...' : ''}&nbsp;»
                    </p>

                    <div className="flex items-center justify-between">
                      {/* Badge statut */}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{
                          background: cfg.bg,
                          color: cfg.text,
                          border: `1px solid ${cfg.border}`,
                          fontFamily: 'Space Grotesk',
                        }}
                      >
                        {cfg.icon}
                        {cfg.label}
                      </span>

                      {/* Date */}
                      <span
                        className="text-[10px] text-[#4A3D7A]"
                        style={{ fontFamily: 'Space Grotesk' }}
                      >
                        {formatDateShort(request.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default MesDemandes;
