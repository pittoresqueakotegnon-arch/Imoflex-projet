import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Building2, MapPin, Search } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { formatMontant, getOptimizedUrl } from '../../../lib/utils';

export default function WebLocataireDemandes() {
  const { user } = useAuth();
  const [demandes, setDemandes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDemandes = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('contact_requests')
        .select(`
          id,
          message,
          contact_phone,
          status,
          created_at,
          listing_id,
          listings:listing_id (
            id,
            title,
            city,
            neighborhood,
            monthly_rent,
            listing_photos (
              photo_url,
              is_cover
            )
          )
        `)
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDemandes(data || []);
    } catch (err) {
      console.error('[WebLocataireDemandes] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDemandes();
  }, [fetchDemandes]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
              Parcours Candidat
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Mes Demandes de Location
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Suivez l'état de vos candidatures et demandes de visite transmises aux propriétaires.
          </p>
        </div>

        <Link
          to="/web/annonces"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-colors bg-white hover:bg-gray-50 text-gray-800 shadow-2xs"
          style={{ borderColor: 'var(--imx-border)' }}
        >
          <Search size={15} />
          Trouver un autre bien
        </Link>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : demandes.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border bg-white shadow-2xs" style={{ borderColor: 'var(--imx-border)' }}>
          <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3 text-[var(--imx-accent)]">
            <ClipboardList size={28} />
          </div>
          <h3 className="text-base font-bold text-gray-800 mb-1" style={{ fontFamily: 'Sora' }}>
            Aucune demande envoyée
          </h3>
          <p className="text-xs text-gray-500 mb-6 max-w-sm mx-auto">
            Lorsque vous contactez un propriétaire pour visiter ou réserver un logement, votre demande et son suivi s'affichent ici.
          </p>
          <Link
            to="/web/annonces"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:opacity-90"
            style={{ background: 'var(--imx-accent)' }}
          >
            Explorer les logements disponibles
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {demandes.map((d) => {
            const listing = d.listings;
            const cover = listing?.listing_photos?.find((p: any) => p.is_cover) || listing?.listing_photos?.[0];
            const coverUrl = cover ? getOptimizedUrl(cover.photo_url, 'thumb') : null;

            return (
              <div
                key={d.id}
                className="p-5 sm:p-6 rounded-2xl border bg-white shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-5"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border" style={{ borderColor: 'var(--imx-border)' }}>
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Building2 size={28} />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <Link
                        to={listing?.id ? `/web/annonce/${listing.id}` : '#'}
                        className="font-bold text-base text-[#17132B] hover:text-[var(--imx-accent)] transition-colors truncate"
                      >
                        {listing?.title || 'Logement ImoFlex'}
                      </Link>
                      {listing?.monthly_rent && (
                        <span className="text-xs font-black text-[var(--imx-accent)]" style={{ fontFamily: 'Sora' }}>
                          {formatMontant(listing.monthly_rent)} / mois
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                      <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{listing?.neighborhood ? `${listing.neighborhood}, ` : ''}{listing?.city}</span>
                    </div>

                    {d.message && (
                      <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs text-gray-700 italic max-w-xl">
                        « {d.message} »
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-2 flex-shrink-0 pt-3 md:pt-0 border-t md:border-0 border-gray-100">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      d.status === 'acceptee' || d.status === 'traitee'
                        ? 'bg-emerald-50 text-emerald-700'
                        : d.status === 'refusee'
                        ? 'bg-red-50 text-red-600'
                        : 'bg-purple-50 text-[var(--imx-accent)]'
                    }`}
                  >
                    {d.status === 'acceptee' || d.status === 'traitee'
                      ? 'Demande validée'
                      : d.status === 'refusee'
                      ? 'Refusée'
                      : 'En attente de réponse'}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    Envoyée le {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  {listing?.id && (
                    <Link
                      to={`/web/annonce/${listing.id}`}
                      className="text-xs font-bold text-[var(--imx-accent)] hover:underline mt-1 hidden md:inline-block"
                    >
                      Consulter l'annonce →
                    </Link>
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

