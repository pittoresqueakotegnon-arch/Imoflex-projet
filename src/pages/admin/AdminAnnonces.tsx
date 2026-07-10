import React, { useState, useEffect } from 'react';
import { ChevronRight, Filter, AlertTriangle, CheckCircle, XCircle, Eye, Trash2 } from 'lucide-react';
import { supabase, Listing } from '../../lib/supabase';
import { propertyTypeLabel } from '../../lib/utils';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../hooks/useAuth';
import { logAction } from '../../lib/audit';

interface ListingWithOwner extends Listing {
  ownerName?: string;
  ownerEmail?: string;
  createdAtDisplay?: string;
  status?: string;
  rejection_reason?: string;
}

type TabFilter = 'en_attente' | 'publiee' | 'rejetee';

const AdminAnnonces: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [tab, setTab] = useState<TabFilter>('en_attente');
  const [listings, setListings] = useState<ListingWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ listingId: string; title: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchListings();
  }, [tab]);

  const enrichWithOwners = async (rawListings: Listing[]): Promise<ListingWithOwner[]> => {
    if (rawListings.length === 0) return [];

    const ownerIds = [...new Set(rawListings.map(l => l.owner_id))];
    const { data: owners } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', ownerIds);

    const ownersById = (owners || []).reduce((acc, o) => {
      acc[o.id] = o;
      return acc;
    }, {} as Record<string, { full_name: string; email: string }>);

    return rawListings.map(listing => ({
      ...(listing as Listing),
      ownerName: ownersById[listing.owner_id]?.full_name,
      ownerEmail: ownersById[listing.owner_id]?.email,
      createdAtDisplay: new Date(listing.created_at).toLocaleDateString('fr-FR'),
    }));
  };

  const fetchListings = async () => {
    setLoading(true);
    try {
      // Use status column; fall back to is_published for backward compat
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', tab)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched = await enrichWithOwners(data || []);
      setListings(enriched);
    } catch (error) {
      console.error('Error fetching listings:', error);
      showToast('Erreur lors du chargement des annonces', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (listingId: string) => {
    setActionLoading(listingId);
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          status: 'publiee',
          is_published: true,
          rejection_reason: null,
          moderated_at: new Date().toISOString(),
          moderated_by: profile?.id,
        })
        .eq('id', listingId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Action bloquée (Politique de sécurité RLS) ou annonce introuvable.");

      setListings(prev => prev.filter(l => l.id !== listingId));
      showToast('Annonce approuvée et publiée', 'success');

      if (profile) {
        logAction({
          userId: profile.id,
          action: 'validation_annonce',
          entityType: 'listings',
          entityId: listingId,
        });
      }
    } catch (error) {
      console.error('Error approving listing:', error);
      showToast('Erreur lors de l\'approbation', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    if (!rejectionReason.trim()) {
      showToast('Le motif de rejet est obligatoire', 'error');
      return;
    }

    setActionLoading(rejectModal.listingId);
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          status: 'rejetee',
          is_published: false,
          rejection_reason: rejectionReason.trim(),
          moderated_at: new Date().toISOString(),
          moderated_by: profile?.id,
        })
        .eq('id', rejectModal.listingId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Action bloquée (Politique de sécurité RLS) ou annonce introuvable.");

      setListings(prev => prev.filter(l => l.id !== rejectModal.listingId));
      setRejectModal(null);
      setRejectionReason('');
      showToast('Annonce rejetée', 'success');

      if (profile) {
        logAction({
          userId: profile.id,
          action: 'rejet_annonce',
          entityType: 'listings',
          entityId: rejectModal.listingId,
          details: { reason: rejectionReason.trim() }
        });
      }
    } catch (error) {
      console.error('Error rejecting listing:', error);
      showToast('Erreur lors du rejet', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpublish = async (listingId: string) => {
    setActionLoading(listingId);
    try {
      const { error } = await supabase
        .from('listings')
        .update({
          status: 'en_attente',
          is_published: false,
          moderated_at: new Date().toISOString(),
          moderated_by: profile?.id,
        })
        .eq('id', listingId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Action bloquée (Politique de sécurité RLS) ou annonce introuvable.");

      setListings(prev => prev.filter(l => l.id !== listingId));
      showToast('Annonce dépubliée et remise en attente', 'success');
    } catch (error) {
      console.error('Error unpublishing listing:', error);
      showToast('Erreur lors de la dépublication', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (listingId: string) => {
    if (!confirm('Supprimer définitivement cette annonce et ses photos ?')) return;

    setActionLoading(listingId);
    try {
      const listing = listings.find(l => l.id === listingId);

      if (listing?.listing_photos) {
        for (const photo of listing.listing_photos) {
          const path = photo.photo_url.split('/').pop();
          if (path) {
            await supabase.storage.from('listing-photos').remove([`listings/${listing.owner_id}/${path}`]);
          }
        }
      }

      const { data, error } = await supabase.from('listings').delete().eq('id', listingId).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Action bloquée (Politique de sécurité RLS) ou annonce introuvable.");

      setListings(prev => prev.filter(l => l.id !== listingId));
      showToast('Annonce supprimée', 'success');
    } catch (error) {
      console.error('Error deleting listing:', error);
      showToast('Erreur lors de la suppression', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const tabConfig: { key: TabFilter; label: string; color: string }[] = [
    { key: 'en_attente', label: 'En attente', color: '#FBBF24' },
    { key: 'publiee', label: 'Publiées', color: '#22C55E' },
    { key: 'rejetee', label: 'Rejetées', color: '#EF4444' },
  ];

  if (loading) {
    return (
      <div className="w-full">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border h-40 animate-pulse" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-nunito font-900 mb-2" style={{ color: 'var(--adm-text)' }}>Modération</h1>
        <p className="text-xs font-space-grotesk mb-6" style={{ color: 'var(--adm-text-muted)' }}>
          Approuvez, rejetez ou gérez les annonces publiées.
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
          {tabConfig.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all min-w-0"
              style={{
                background: tab === t.key
                  ? `${t.color}20`
                  : 'var(--adm-surface-alt)',
                border: tab === t.key
                  ? `1.5px solid ${t.color}`
                  : '1.5px solid var(--adm-border)',
                color: tab === t.key ? t.color : 'var(--adm-text-muted)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {listings.length === 0 ? (
          <EmptyState
            title={
              tab === 'en_attente' ? 'Aucune annonce en attente'
                : tab === 'publiee' ? 'Aucune annonce publiée'
                : 'Aucune annonce rejetée'
            }
            description={
              tab === 'en_attente' ? 'Toutes les annonces ont été traitées 🎉'
                : tab === 'publiee' ? 'Rien en ligne pour le moment'
                : 'Aucun rejet enregistré'
            }
          />
        ) : (
          <div className="space-y-3">
            {listings.map(listing => {
              const coverPhoto = listing.listing_photos?.find(p => p.is_cover);

              return (
                <div key={listing.id} className="rounded-xl border p-4" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
                  <div className="flex gap-4 mb-3">
                    {coverPhoto && (
                      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={coverPhoto.photo_url}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate" style={{ color: 'var(--adm-text)' }}>{listing.title}</h3>
                      <p className="text-xs" style={{ color: 'var(--adm-text-muted)' }}>
                        {listing.neighborhood || listing.city} • {propertyTypeLabel(listing.property_type)}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--adm-text-muted)' }}>
                        {listing.monthly_rent.toLocaleString()} FCFA/mois
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--adm-text-muted)' }}>
                        Par {listing.ownerName || 'N/A'} ({listing.ownerEmail || 'N/A'})
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--adm-text-dim)' }}>
                        Créée le {listing.createdAtDisplay}
                      </p>
                    </div>
                  </div>

                  {/* Rejection reason if rejected */}
                  {tab === 'rejetee' && (listing as any).rejection_reason && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-3">
                      <p className="text-red-400 text-xs font-space-grotesk">
                        <span className="font-bold">Motif :</span> {(listing as any).rejection_reason}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {tab === 'en_attente' && (
                      <>
                        <button
                          onClick={() => handleApprove(listing.id)}
                          disabled={actionLoading === listing.id}
                          className="flex-1 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                          style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22C55E' }}
                        >
                          ✓ Approuver
                        </button>
                        <button
                          onClick={() => setRejectModal({ listingId: listing.id, title: listing.title })}
                          disabled={actionLoading === listing.id}
                          className="flex-1 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
                        >
                          ✗ Rejeter
                        </button>
                      </>
                    )}
                    {tab === 'publiee' && (
                      <button
                        onClick={() => handleUnpublish(listing.id)}
                        disabled={actionLoading === listing.id}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                        style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#FBBF24' }}
                      >
                        Dépublier
                      </button>
                    )}
                    {tab === 'rejetee' && (
                      <button
                        onClick={() => handleApprove(listing.id)}
                        disabled={actionLoading === listing.id}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                        style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22C55E' }}
                      >
                        Réhabiliter
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(listing.id)}
                      disabled={actionLoading === listing.id}
                      className="py-2 px-4 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                      style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-xl border p-6 w-full max-w-sm" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
            <h3 className="font-nunito font-900 text-lg mb-2" style={{ color: 'var(--adm-text)' }}>Rejeter l'annonce</h3>
            <p className="text-xs font-space-grotesk mb-4" style={{ color: 'var(--adm-text-muted)' }}>
              « {rejectModal.title} »
            </p>
            <label className="block text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--adm-text-muted)' }}>
              MOTIF DE REJET *
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full h-24 resize-none rounded-lg p-3 outline-none border"
              style={{ background: 'var(--adm-bg)', color: 'var(--adm-text)', borderColor: 'var(--adm-border)' }}
              placeholder="Indiquez la raison du rejet..."
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setRejectModal(null); setRejectionReason(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition"
                style={{ background: 'var(--adm-surface-alt)', color: 'var(--adm-text-muted)', borderColor: 'var(--adm-border)' }}
              >
                Annuler
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModal.listingId}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444' }}
              >
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAnnonces;
