import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ContactRequest, Listing } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import { formatDateShort } from '../../lib/utils';
import { MessageSquare } from 'lucide-react';

interface ContactRequestWithListing extends ContactRequest {
  listings?: Listing;
}

const getStatusConfig = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    nouvelle: { label: 'EN ATTENTE', className: 'badge-solid-amber' },
    traitee:  { label: 'TRAITÉE',    className: 'badge-solid-green' },
  };
  return map[status] ?? { label: status.toUpperCase(), className: 'badge-dim' };
};

const MesDemandes: React.FC = () => {
  const { user } = useAuth();

  const [requests, setRequests] = useState<ContactRequestWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            listings(id, title, city, neighborhood, listing_photos(id, photo_url, is_cover))`
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

  const newCount = requests.filter(r => r.status === 'nouvelle').length;

  /* ── States d'attente ─────────────────────────────── */
  if (!user) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-4">
          <h1 className="font-nunito font-800 text-xl text-[#E8E0FF]">Mes demandes envoyées</h1>
        </header>
        <EmptyState
          icon={<MessageSquare size={48} className="text-[#8B7BB5]" />}
          title="Connectez-vous d'abord"
          description="Vous devez être connecté pour voir vos demandes."
          action={{ label: "Se connecter", href: '/login' }}
        />
        <BottomNav />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-4">
          <h1 className="font-nunito font-800 text-xl text-[#E8E0FF]">Mes demandes envoyées</h1>
        </header>
        <div className="px-4 py-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[#1A1240] rounded-2xl animate-pulse" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky-header px-4 py-4">
        <div className="flex items-center gap-3">
          <h1 className="font-nunito font-800 text-xl text-[#E8E0FF] flex-1">
            Mes demandes envoyées
          </h1>
          {newCount > 0 && <span className="badge-new">NOUVEAU</span>}
        </div>
        <p className="text-[#8B7BB5] text-xs mt-0.5" style={{ fontFamily: 'Space Grotesk' }}>
          Suivi des contacts envoyés
        </p>
      </header>

      {/* ── Content ────────────────────────────────────── */}
      {error ? (
        <EmptyState
          title="Erreur"
          description={error}
          action={{ label: 'Réessayer', onClick: () => window.location.reload() }}
        />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={48} className="text-[#8B7BB5]" />}
          title="Aucune demande envoyée"
          description="Vos demandes de contact apparaîtront ici."
          action={{ label: 'Explorer la marketplace', href: '/' }}
        />
      ) : (
        <div className="px-4 py-4 space-y-3 flex-1">
          {requests.map((request) => {
            const listing = request.listings;
            const cfg = getStatusConfig(request.status);

            return (
              <div
                key={request.id}
                className="card p-4"
              >
                {/* Titre + badge statut */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-nunito font-700 text-[#E8E0FF] text-sm leading-tight flex-1 line-clamp-1">
                    {listing?.title || 'Annonce supprimée'}
                  </h3>
                  <span className={cfg.className}>{cfg.label}</span>
                </div>

                {/* Message tronqué en italique */}
                <p className="text-[#8B7BB5] text-xs italic line-clamp-1 mb-2" style={{ fontFamily: 'Space Grotesk' }}>
                  «&nbsp;{request.message.substring(0, 70)}{request.message.length > 70 ? '...' : ''}&nbsp;»
                </p>

                {/* Date */}
                <p className="text-[#4A3D7A] text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                  Envoyé le {formatDateShort(request.created_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default MesDemandes;
