import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2, CheckCircle2, XCircle, Clock, Eye,
  User, Phone, Mail, Home, Loader2, Calendar
} from 'lucide-react';
import { supabase, ListingDeletionRequest } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../hooks/useAuth';
import { logAction } from '../../lib/audit';

interface EnrichedDeletionRequest extends ListingDeletionRequest {
  listingDetails?: {
    id: string;
    title: string;
    city: string;
    neighborhood?: string;
    property_type: string;
    monthly_rent: number;
    availability_status: string;
    status: string;
    listing_photos?: { photo_url: string; is_cover: boolean }[];
  };
  ownerProfile?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
  adminProfile?: {
    id: string;
    full_name: string;
  };
}

type TabFilter = 'pending' | 'approved' | 'rejected' | 'all';

export const AdminDemandesSuppression: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [tab, setTab] = useState<TabFilter>('pending');
  const [requests, setRequests] = useState<EnrichedDeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modales
  const [approveModal, setApproveModal] = useState<EnrichedDeletionRequest | null>(null);
  const [rejectModal, setRejectModal] = useState<EnrichedDeletionRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [detailModal, setDetailModal] = useState<EnrichedDeletionRequest | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('listing_deletion_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (tab !== 'all') {
        query = query.eq('status', tab);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rawRequests = (data || []) as ListingDeletionRequest[];
      if (rawRequests.length === 0) {
        setRequests([]);
        return;
      }

      // Récupération des données jointes : listings, owners, admins
      const listingIds = [...new Set(rawRequests.map(r => r.listing_id))];
      const ownerIds = [...new Set(rawRequests.map(r => r.owner_id))];
      const adminIds = [...new Set(rawRequests.filter(r => r.admin_id).map(r => r.admin_id as string))];
      const allUserIds = [...new Set([...ownerIds, ...adminIds])];

      const [{ data: listingsData }, { data: usersData }] = await Promise.all([
        supabase
          .from('listings')
          .select('id, title, city, neighborhood, property_type, monthly_rent, availability_status, status, listing_photos(photo_url, is_cover)')
          .in('id', listingIds),
        supabase
          .from('users')
          .select('id, full_name, email, phone')
          .in('id', allUserIds),
      ]);

      const listingsMap = (listingsData || []).reduce((acc, l) => {
        acc[l.id] = l;
        return acc;
      }, {} as Record<string, any>);

      const usersMap = (usersData || []).reduce((acc, u) => {
        acc[u.id] = u;
        return acc;
      }, {} as Record<string, any>);

      const enriched: EnrichedDeletionRequest[] = rawRequests.map(req => ({
        ...req,
        listingDetails: listingsMap[req.listing_id],
        ownerProfile: usersMap[req.owner_id],
        adminProfile: req.admin_id ? usersMap[req.admin_id] : undefined,
      }));

      setRequests(enriched);
    } catch (err: any) {
      console.error('Erreur lors du chargement des demandes de suppression:', err);
      showToast('Erreur lors du chargement des demandes', 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, showToast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // APPROBATION
  const handleApprove = async () => {
    if (!approveModal || !profile) return;
    const req = approveModal;
    setActionLoading(req.id);

    try {
      // 1 & 2. Approuver la suppression et soft-delete via la fonction RPC sécurisée (SECURITY DEFINER)
      const { error: rpcError } = await supabase.rpc('approve_listing_deletion', {
        p_request_id: req.id,
        p_admin_id: profile.id,
        p_listing_id: req.listing_id,
      });

      if (rpcError) throw rpcError;

      // 3. Notifier le propriétaire
      await supabase.from('notifications').insert({
        user_id: req.owner_id,
        type: 'suppression_annonce_approuvee',
        title: 'Annonce supprimée',
        body: `Votre demande de suppression pour l'annonce "${req.listingDetails?.title || 'votre bien'}" a été validée par l'administration.`,
        related_id: req.listing_id,
      });

      // 4. Audit Log
      await logAction({
        userId: profile.id,
        action: 'suppression_demande_approuvee',
        entityType: 'listings',
        entityId: req.listing_id,
        details: {
          requestId: req.id,
          reason: req.reason,
          customReason: req.custom_reason,
        },
      });

      showToast('Demande approuvée. L\'annonce a été retirée de la marketplace.', 'success');
      setApproveModal(null);
      fetchRequests();
    } catch (err: any) {
      console.error('Erreur lors de l\'approbation de la demande:', err);
      showToast('Erreur lors de l\'approbation', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // REFUS
  const handleReject = async () => {
    if (!rejectModal || !profile) return;
    if (!rejectionReason.trim()) {
      showToast('Le motif de refus est obligatoire', 'error');
      return;
    }

    const req = rejectModal;
    setActionLoading(req.id);

    try {
      const now = new Date().toISOString();

      // 1. Mettre à jour la demande
      const { error: reqError } = await supabase
        .from('listing_deletion_requests')
        .update({
          status: 'rejected',
          admin_id: profile.id,
          admin_note: rejectionReason.trim(),
          reviewed_at: now,
        })
        .eq('id', req.id);

      if (reqError) throw reqError;

      // 2. Réactiver l'annonce (remettre en ligne)
      const { error: listingError } = await supabase
        .from('listings')
        .update({
          status: 'publiee',
          is_published: true,
          moderated_at: now,
          moderated_by: profile.id,
        })
        .eq('id', req.listing_id);

      if (listingError) throw listingError;

      // 3. Notifier le propriétaire
      await supabase.from('notifications').insert({
        user_id: req.owner_id,
        type: 'suppression_annonce_rejetee',
        title: 'Demande de suppression refusée',
        body: `Votre demande de suppression pour l'annonce "${req.listingDetails?.title || 'votre bien'}" a été refusée. Raison : ${rejectionReason.trim()}`,
        related_id: req.listing_id,
      });

      // 4. Audit Log
      await logAction({
        userId: profile.id,
        action: 'suppression_demande_refusee',
        entityType: 'listings',
        entityId: req.listing_id,
        details: {
          requestId: req.id,
          reason: req.reason,
          adminNote: rejectionReason.trim(),
        },
      });

      showToast('Demande refusée. L\'annonce est de nouveau active.', 'success');
      setRejectModal(null);
      setRejectionReason('');
      fetchRequests();
    } catch (err: any) {
      console.error('Erreur lors du refus de la demande:', err);
      showToast('Erreur lors du refus de la demande', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const tabConfig: { key: TabFilter; label: string; color: string }[] = [
    { key: 'pending', label: 'En attente', color: '#FBBF24' },
    { key: 'approved', label: 'Approuvées', color: '#22C55E' },
    { key: 'rejected', label: 'Refusées', color: '#EF4444' },
    { key: 'all', label: 'Toutes', color: 'var(--adm-text-muted)' },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold font-nunito" style={{ color: 'var(--adm-text)' }}>
            Demandes de suppression d'annonces
          </h1>
          <p className="text-xs font-space-grotesk mt-1" style={{ color: 'var(--adm-text-muted)' }}>
            Examinez et validez ou refusez les demandes de suppression soumises par les propriétaires.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-3 overflow-x-auto scrollbar-hide" style={{ borderColor: 'var(--adm-border)' }}>
        {tabConfig.map(t => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap"
              style={{
                background: isActive ? 'rgba(124, 58, 237, 0.15)' : 'var(--adm-surface)',
                color: isActive ? 'var(--adm-accent)' : 'var(--adm-text-muted)',
                borderColor: isActive ? 'rgba(124, 58, 237, 0.3)' : 'var(--adm-border)',
                borderWidth: 1,
              }}
            >
              <span>{t.label}</span>
              {t.key === 'pending' && requests.length > 0 && tab === 'pending' && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-extrabold">
                  {requests.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl border h-40 animate-pulse" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }} />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="py-12 rounded-2xl border flex flex-col items-center justify-center text-center p-6" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center bg-purple-500/10 text-purple-400 mb-3">
            <Trash2 size={24} />
          </div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--adm-text)' }}>
            Aucune demande de suppression
          </h3>
          <p className="text-xs max-w-sm mt-1" style={{ color: 'var(--adm-text-muted)' }}>
            {tab === 'pending'
              ? 'Il n\'y a actuellement aucune demande de suppression en attente de modération.'
              : 'Aucune demande trouvée pour ce filtre.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {requests.map(req => {
            const coverPhoto = req.listingDetails?.listing_photos?.find(p => p.is_cover)?.photo_url ||
              req.listingDetails?.listing_photos?.[0]?.photo_url;
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const isRejected = req.status === 'rejected';

            return (
              <div
                key={req.id}
                className="rounded-2xl border p-5 transition-all hover:border-purple-500/30 flex flex-col lg:flex-row gap-5 justify-between"
                style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}
              >
                {/* Left: Listing & Owner info */}
                <div className="flex gap-4 min-w-0 flex-1">
                  {/* Photo Cover */}
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden flex-shrink-0 bg-white/5 border border-white/10">
                    {coverPhoto ? (
                      <img src={coverPhoto} alt={req.listingDetails?.title || 'Annonce'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <Home size={32} />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="text-base font-bold truncate font-nunito" style={{ color: 'var(--adm-text)' }}>
                          {req.listingDetails?.title || 'Annonce introuvable'}
                        </h3>
                        <p className="text-xs font-space-grotesk mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--adm-text-muted)' }}>
                          <span>{req.listingDetails?.neighborhood ? `${req.listingDetails.neighborhood}, ` : ''}{req.listingDetails?.city || 'Localisation inconnue'}</span>
                          {req.listingDetails?.monthly_rent && (
                            <>
                              <span>•</span>
                              <span className="font-bold text-purple-400">
                                {new Intl.NumberFormat('fr-FR').format(req.listingDetails.monthly_rent)} FCFA/mois
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <Clock size={12} /> En attente
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle2 size={12} /> Approuvée
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
                            <XCircle size={12} /> Refusée
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Propriétaire info bar */}
                    <div className="p-2.5 rounded-xl border flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                      <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--adm-text)' }}>
                        <User size={13} className="text-purple-400" />
                        <span>{req.ownerProfile?.full_name || 'Propriétaire inconnu'}</span>
                      </div>
                      {req.ownerProfile?.email && (
                        <div className="flex items-center gap-1.5" style={{ color: 'var(--adm-text-muted)' }}>
                          <Mail size={13} />
                          <span>{req.ownerProfile.email}</span>
                        </div>
                      )}
                      {req.ownerProfile?.phone && (
                        <div className="flex items-center gap-1.5" style={{ color: 'var(--adm-text-muted)' }}>
                          <Phone size={13} />
                          <span>{req.ownerProfile.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Motif de suppression */}
                    <div className="space-y-1 text-xs font-space-grotesk">
                      <p style={{ color: 'var(--adm-text-dim)' }}>
                        <span className="font-semibold text-purple-300">Motif de la demande :</span>{' '}
                        <span className="font-bold" style={{ color: 'var(--adm-text)' }}>{req.reason}</span>
                      </p>
                      {req.custom_reason && (
                        <p className="p-2 rounded-lg bg-black/20 border border-white/5 text-[11px] italic" style={{ color: 'var(--adm-text-muted)' }}>
                          « {req.custom_reason} »
                        </p>
                      )}
                      <p className="text-[10px] flex items-center gap-1 pt-1" style={{ color: 'var(--adm-text-dim)' }}>
                        <Calendar size={11} />
                        Demandée le {new Date(req.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {/* Decision info if processed */}
                    {req.reviewed_at && (
                      <div className="mt-2 p-2.5 rounded-xl border text-[11px]" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                        <p className="font-semibold" style={{ color: isApproved ? '#22c55e' : '#ef4444' }}>
                          Décision : {isApproved ? 'Suppression approuvée' : 'Demande refusée'}
                        </p>
                        {req.adminProfile?.full_name && (
                          <p className="text-[10px] mt-0.5" style={{ color: 'var(--adm-text-muted)' }}>
                            Traité par {req.adminProfile.full_name} le {new Date(req.reviewed_at).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                        {req.admin_note && (
                          <p className="text-[11px] mt-1 italic text-red-300">
                            Motif du refus : « {req.admin_note} »
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex lg:flex-col justify-end gap-2 border-t lg:border-t-0 lg:border-l pt-3 lg:pt-0 lg:pl-5 flex-shrink-0" style={{ borderColor: 'var(--adm-border)' }}>
                  <button
                    type="button"
                    onClick={() => setDetailModal(req)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                    style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }}
                  >
                    <Eye size={14} />
                    <span>Voir détails</span>
                  </button>

                  {isPending && (
                    <>
                      <button
                        type="button"
                        onClick={() => setApproveModal(req)}
                        disabled={actionLoading === req.id}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        <span>Approuver</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRejectModal(req);
                          setRejectionReason('');
                        }}
                        disabled={actionLoading === req.id}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all shadow-md shadow-red-600/20 disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        <span>Refuser</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODALE DÉTAIL ── */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-lg rounded-2xl p-6 border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }}
          >
            <div className="flex items-start justify-between border-b pb-3" style={{ borderColor: 'var(--adm-border)' }}>
              <div>
                <h2 className="text-lg font-bold font-nunito">Détail de la demande de suppression</h2>
                <p className="text-xs font-space-grotesk" style={{ color: 'var(--adm-text-muted)' }}>
                  Identifiant : {detailModal.id}
                </p>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Content summary */}
            <div className="space-y-3 text-xs font-space-grotesk">
              <div className="p-3 rounded-xl border space-y-1" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                <p className="font-semibold text-purple-400">Annonce concernée</p>
                <p className="text-sm font-bold">{detailModal.listingDetails?.title || 'Titre inconnu'}</p>
                <p style={{ color: 'var(--adm-text-muted)' }}>
                  {detailModal.listingDetails?.city} • {new Intl.NumberFormat('fr-FR').format(detailModal.listingDetails?.monthly_rent || 0)} FCFA/mois
                </p>
                <p className="text-[11px]" style={{ color: 'var(--adm-text-dim)' }}>
                  Statut actuel annonce : <span className="font-bold text-amber-300">{detailModal.listingDetails?.status}</span>
                </p>
              </div>

              <div className="p-3 rounded-xl border space-y-1" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                <p className="font-semibold text-purple-400">Propriétaire demandeur</p>
                <p className="font-bold">{detailModal.ownerProfile?.full_name}</p>
                <p style={{ color: 'var(--adm-text-muted)' }}>Email : {detailModal.ownerProfile?.email || 'N/A'}</p>
                <p style={{ color: 'var(--adm-text-muted)' }}>Téléphone : {detailModal.ownerProfile?.phone || 'N/A'}</p>
              </div>

              <div className="p-3 rounded-xl border space-y-1" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                <p className="font-semibold text-purple-400">Motif de suppression</p>
                <p className="font-bold">{detailModal.reason}</p>
                {detailModal.custom_reason && (
                  <p className="italic mt-1" style={{ color: 'var(--adm-text-muted)' }}>« {detailModal.custom_reason} »</p>
                )}
                <p className="text-[10px] mt-1" style={{ color: 'var(--adm-text-dim)' }}>
                  Date de soumission : {new Date(detailModal.created_at).toLocaleString('fr-FR')}
                </p>
              </div>

              {detailModal.reviewed_at && (
                <div className="p-3 rounded-xl border space-y-1" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                  <p className="font-semibold text-purple-400">Traitement administratif</p>
                  <p>Statut : <span className="font-bold uppercase">{detailModal.status}</span></p>
                  {detailModal.admin_note && <p>Note : « {detailModal.admin_note} »</p>}
                  <p className="text-[10px]" style={{ color: 'var(--adm-text-dim)' }}>
                    Exécuté le {new Date(detailModal.reviewed_at).toLocaleString('fr-FR')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALE APPROBATION ── */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md rounded-2xl p-6 border shadow-2xl space-y-4"
            style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base">Confirmer la suppression</h3>
                <p className="text-xs" style={{ color: 'var(--adm-text-muted)' }}>
                  Validation administrative
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--adm-text-muted)' }}>
              Êtes-vous sûr de vouloir approuver la suppression de cette annonce ?
              <br />
              <strong className="text-white mt-1 block">Cette annonce ne sera plus visible publiquement sur la marketplace ImoFlex.</strong>
            </p>

            <div className="p-3 rounded-xl border text-xs" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
              <p className="font-bold truncate">{approveModal.listingDetails?.title}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--adm-text-muted)' }}>
                Motif propriétaire : {approveModal.reason}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApproveModal(null)}
                disabled={actionLoading === approveModal.id}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={actionLoading === approveModal.id}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-md shadow-emerald-600/30 disabled:opacity-50"
              >
                {actionLoading === approveModal.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                <span>Confirmer la suppression</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODALE REFUS ── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md rounded-2xl p-6 border shadow-2xl space-y-4"
            style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400">
                <XCircle size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base">Refuser la demande</h3>
                <p className="text-xs" style={{ color: 'var(--adm-text-muted)' }}>
                  L'annonce restera active sur ImoFlex
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--adm-text)' }}>
                Pourquoi cette demande est-elle refusée ? <span className="text-red-400">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Indiquez la raison du refus qui sera transmise au propriétaire..."
                rows={3}
                required
                className="w-full rounded-xl p-3 text-xs border resize-none focus:outline-none focus:border-purple-500"
                style={{
                  background: 'var(--adm-surface-alt)',
                  borderColor: 'var(--adm-border)',
                  color: 'var(--adm-text)',
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                disabled={actionLoading === rejectModal.id}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={actionLoading === rejectModal.id}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all shadow-md shadow-red-600/30 disabled:opacity-50"
              >
                {actionLoading === rejectModal.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )}
                <span>Confirmer le refus</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDemandesSuppression;
