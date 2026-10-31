import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Phone, Check, X, Building2 } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { formatMontant, getOptimizedUrl } from '../../../lib/utils';
import { useToast } from '../../../components/Toast';

export default function WebAgenceDemandes() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [demandes, setDemandes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'en_attente' | 'acceptee' | 'refusee'>('all');

  const fetchDemandes = useCallback(async () => {
    if (!user) return;
    try {
      // 1. Get agency listings
      const { data: listings } = await supabase
        .from('listings')
        .select('id, title, city, neighborhood, monthly_rent, listing_photos(photo_url, is_cover)')
        .eq('owner_id', user.id);

      if (!listings || listings.length === 0) {
        setDemandes([]);
        setLoading(false);
        return;
      }

      const listingIds = listings.map((l) => l.id);
      const listingMap = new Map(listings.map((l) => [l.id, l]));

      // 2. Get contact requests
      const { data: requests, error } = await supabase
        .from('contact_requests')
        .select('*')
        .in('listing_id', listingIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const merged = (requests || []).map((r) => ({
        ...r,
        listing: listingMap.get(r.listing_id),
      }));

      setDemandes(merged);
    } catch (err) {
      console.error('[WebAgenceDemandes] Fetch error:', err);
      showToast('Erreur lors du chargement des demandes', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    fetchDemandes();
  }, [fetchDemandes]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('contact_requests')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      setDemandes((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d))
      );
      showToast('Statut du prospect mis à jour', 'success');
    } catch (_err: unknown) {
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  const filtered = demandes.filter((d) => {
    if (statusFilter === 'all') return true;
    return d.status === statusFilter;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
              Gestion de la relation client
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Demandes de Visite & Prospects
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Traitez les candidatures et demandes de contact reçues pour votre portefeuille de mandats.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl">
          {[
            { id: 'all', label: `Toutes (${demandes.length})` },
            { id: 'en_attente', label: 'En attente' },
            { id: 'acceptee', label: 'Validées' },
            { id: 'refusee', label: 'Refusées' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === f.id
                  ? 'bg-white text-[var(--imx-accent)] shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
          <ClipboardList size={48} className="mx-auto mb-3 opacity-30 text-gray-400" />
          <h3 className="text-base font-bold text-gray-800 mb-1">Aucune demande trouvée</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {statusFilter !== 'all'
              ? 'Aucune demande ne correspond à ce filtre.'
              : 'Dès qu\'un prospect contactera votre agence pour un mandat, ses coordonnées et son message apparaîtront ici.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((d) => {
            const listing = d.listing;
            const cover = listing?.listing_photos?.find((p: any) => p.is_cover) || listing?.listing_photos?.[0];
            const coverUrl = cover ? getOptimizedUrl(cover.photo_url, 'thumb') : null;

            return (
              <div
                key={d.id}
                className="p-5 rounded-2xl border bg-white shadow-xs hover:shadow-md transition-shadow flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                {/* Info candidat & message */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-base text-gray-900">
                      {d.requester_name || 'Prospect anonyme'}
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        d.status === 'acceptee'
                          ? 'bg-emerald-50 text-emerald-700'
                          : d.status === 'refusee'
                          ? 'bg-red-50 text-red-600'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {d.status === 'acceptee' ? 'Contact validé' : d.status === 'refusee' ? 'Refusé' : 'En attente'}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {d.message && (
                    <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-xl border border-gray-100 mb-3 leading-relaxed">
                      « {d.message} »
                    </p>
                  )}

                  {d.contact_phone && (
                    <div className="flex items-center gap-3">
                      <a
                        href={`tel:${d.contact_phone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 text-[var(--imx-accent)] hover:bg-purple-100 transition-colors"
                      >
                        <Phone size={13} />
                        {d.contact_phone}
                      </a>
                      <a
                        href={`https://wa.me/${d.contact_phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        WhatsApp
                      </a>
                    </div>
                  )}
                </div>

                {/* Mandat associé & actions */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-gray-100">
                  {listing && (
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 border border-gray-100 w-full sm:w-64">
                      <div className="w-10 h-10 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
                        {coverUrl ? (
                          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Building2 size={20} className="m-auto text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/web/annonce/${listing.id}`} className="font-bold text-xs text-gray-900 hover:text-[var(--imx-accent)] truncate block">
                          {listing.title}
                        </Link>
                        <p className="text-[11px] text-gray-400 truncate">{listing.city} · {formatMontant(listing.monthly_rent)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {d.status !== 'acceptee' && (
                      <button
                        onClick={() => updateStatus(d.id, 'acceptee')}
                        className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                        title="Valider le contact"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    {d.status !== 'refusee' && (
                      <button
                        onClick={() => updateStatus(d.id, 'refusee')}
                        className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        title="Archiver ou refuser"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
