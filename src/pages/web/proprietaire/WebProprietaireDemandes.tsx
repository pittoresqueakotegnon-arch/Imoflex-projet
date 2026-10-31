import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Phone, Check, X, Building2, MapPin } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { formatMontant, getOptimizedUrl } from '../../../lib/utils';
import { useToast } from '../../../components/Toast';

export default function WebProprietaireDemandes() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [demandes, setDemandes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDemandes = useCallback(async () => {
    if (!user) return;
    try {
      // 1. Get owner listings
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
      console.error('[WebProprietaireDemandes] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

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
      showToast('Statut de la demande mis à jour', 'success');
    } catch (_err: unknown) {
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
          Demandes des Candidats Locataires
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Consultez les messages reçus de personnes souhaitant visiter ou louer vos biens.
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : demandes.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
          <ClipboardList size={48} className="mx-auto mb-3 opacity-30 text-gray-400" />
          <h3 className="text-base font-bold text-gray-800 mb-1">Aucune demande reçue</h3>
          <p className="text-xs text-gray-500 mb-6 max-w-sm mx-auto">
            Dès qu'un visiteur enverra une demande de contact pour vos biens, elle apparaîtra ici avec son numéro de téléphone.
          </p>
          <Link
            to="/web/pro/publier"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ background: 'var(--imx-accent)' }}
          >
            Publier un autre bien
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {demandes.map((d) => {
            const cover = d.listing?.listing_photos?.find((p: any) => p.is_cover) || d.listing?.listing_photos?.[0];
            const coverUrl = cover ? getOptimizedUrl(cover.photo_url, 'thumb') : null;

            return (
              <div
                key={d.id}
                className="p-5 rounded-2xl border bg-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Building2 size={24} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={d.listing?.id ? `/web/annonce/${d.listing.id}` : '#'}
                        className="font-bold text-sm text-[#17132B] hover:text-[#7B3FE4] transition-colors truncate"
                      >
                        {d.listing?.title || 'Logement'}
                      </Link>
                      <span className="text-xs font-bold text-[#7B3FE4]">
                        {d.listing?.monthly_rent ? formatMontant(d.listing.monthly_rent) : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                      <MapPin size={12} className="text-[#7B3FE4]" />
                      <span>{d.listing?.neighborhood ? `${d.listing.neighborhood}, ` : ''}{d.listing?.city}</span>
                    </div>

                    <p className="text-xs text-gray-700 mt-2 p-2 rounded-lg bg-gray-50 border leading-relaxed" style={{ borderColor: 'var(--imx-border)' }}>
                      « {d.message} »
                    </p>

                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                      <span className="font-semibold text-gray-800">
                        Contact : <a href={`tel:${d.contact_phone}`} className="text-[#7B3FE4] underline">{d.contact_phone}</a>
                      </span>
                      <span>• {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                {/* Status & actions */}
                <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-shrink-0 pt-3 md:pt-0 border-t md:border-0 border-gray-100">
                  <a
                    href={`https://wa.me/${d.contact_phone?.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                  >
                    <Phone size={13} />
                    WhatsApp
                  </a>

                  {d.status === 'nouvelle' ? (
                    <>
                      <button
                        onClick={() => updateStatus(d.id, 'traitee')}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-[#7B3FE4] hover:opacity-90"
                      >
                        <Check size={13} /> Accepter
                      </button>
                      <button
                        onClick={() => updateStatus(d.id, 'refusee')}
                        className="p-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-red-500 hover:bg-red-50"
                        title="Décliner"
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 capitalize">
                      {d.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
