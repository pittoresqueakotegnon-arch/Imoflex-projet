import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Plus, ClipboardList, TrendingUp, RefreshCw,
  ArrowUpRight, MapPin, Eye, CheckCircle2, MessageSquare, Phone
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { formatMontant, getOptimizedUrl } from '../../../lib/utils';

export default function WebAgenceDashboard() {
  const { profile, user } = useAuth();
  const [stats, setStats] = useState({
    totalListings: 0,
    activeListings: 0,
    contactRequests: 0,
    totalRentVolume: 0,
  });
  const [recentListings, setRecentListings] = useState<any[]>([]);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      // 1. Listings count, items and rent volume
      const { data: listings, count } = await supabase
        .from('listings')
        .select(`
          id,
          title,
          city,
          neighborhood,
          monthly_rent,
          availability_status,
          status,
          created_at,
          listing_photos (
            photo_url,
            is_cover
          )
        `, { count: 'exact' })
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      const totalListings = count || 0;
      const allListings = listings || [];
      setRecentListings(allListings.slice(0, 5));

      const totalRentVolume = allListings.reduce((sum, l) => sum + (l.monthly_rent || 0), 0);
      const activeListings = allListings.filter(l => l.availability_status === 'disponible').length;

      const listingIds = allListings.map((l) => l.id);

      // 2. Inquiries
      let requestsCount = 0;
      let requestsData: any[] = [];
      if (listingIds.length > 0) {
        const { data: reqs, count: reqCount } = await supabase
          .from('contact_requests')
          .select(`
            id,
            requester_name,
            contact_phone,
            message,
            status,
            created_at,
            listing_id,
            listings:listing_id (title, city)
          `, { count: 'exact' })
          .in('listing_id', listingIds)
          .order('created_at', { ascending: false })
          .limit(4);

        requestsCount = reqCount || 0;
        requestsData = reqs || [];
      }

      setRecentRequests(requestsData);
      setStats({
        totalListings,
        activeListings,
        contactRequests: requestsCount,
        totalRentVolume,
      });
    } catch (err) {
      console.error('[WebAgenceDashboard] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
              Espace Professionnel Agence
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            {profile?.full_name || 'Cabinet & Agence Immobilière'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Supervision de vos mandats de gestion, contacts locataires et diffusion d'annonces.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); fetchData(); }}
            disabled={refreshing}
            title="Actualiser les données"
            className="p-2.5 rounded-xl border bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            style={{ borderColor: 'var(--imx-border)' }}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link
            to="/web/agence/publier"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Plus size={16} />
            Nouveau mandat
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="space-y-8">
          {/* KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Volume loyer */}
            <div
              className="p-5 rounded-2xl text-white shadow-sm flex flex-col justify-between"
              style={{ background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)' }}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-purple-200 uppercase tracking-wider">
                <span>Volume locatif</span>
                <TrendingUp size={16} className="text-purple-300" />
              </div>
              <div className="my-2">
                <p className="text-2xl font-black" style={{ fontFamily: 'Sora' }}>
                  {formatMontant(stats.totalRentVolume)}
                </p>
                <p className="text-xs text-purple-200 mt-1">
                  / mois sous mandat
                </p>
              </div>
              <p className="text-[11px] text-purple-300 pt-2 border-t border-white/10">
                Portefeuille cumulé
              </p>
            </div>

            {/* Total mandats */}
            <div className="p-5 rounded-2xl border bg-white shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--imx-border)' }}>
              <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <span>Mandats totaux</span>
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-[var(--imx-accent)] flex items-center justify-center">
                  <Building2 size={16} />
                </div>
              </div>
              <div className="my-2">
                <p className="text-3xl font-black text-gray-900" style={{ fontFamily: 'Sora' }}>
                  {stats.totalListings}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  biens enregistrés
                </p>
              </div>
              <div className="text-xs pt-2 border-t flex justify-between font-medium text-emerald-600" style={{ borderColor: 'var(--imx-border)' }}>
                <span>{stats.activeListings} en ligne</span>
                <span className="text-gray-400">{stats.totalListings - stats.activeListings} loués/archivés</span>
              </div>
            </div>

            {/* Demandes reçues */}
            <div className="p-5 rounded-2xl border bg-white shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--imx-border)' }}>
              <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <span>Prospects & Visites</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ClipboardList size={16} />
                </div>
              </div>
              <div className="my-2">
                <p className="text-3xl font-black text-[var(--imx-accent)]" style={{ fontFamily: 'Sora' }}>
                  {stats.contactRequests}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  candidatures reçues
                </p>
              </div>
              <div className="text-xs pt-2 border-t flex items-center justify-between font-medium text-purple-600" style={{ borderColor: 'var(--imx-border)' }}>
                <Link to="/web/agence/demandes" className="hover:underline flex items-center gap-1">
                  Traiter les demandes <ArrowUpRight size={13} />
                </Link>
              </div>
            </div>

            {/* Profil Agence Status */}
            <div className="p-5 rounded-2xl border bg-white shadow-sm flex flex-col justify-between" style={{ borderColor: 'var(--imx-border)' }}>
              <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <span>Statut Professionnel</span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <div className="my-2">
                <p className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Sora' }}>
                  Agréé ImoFlex
                </p>
                <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  Compte vérifié
                </p>
              </div>
              <div className="text-xs pt-2 border-t text-gray-500 flex justify-between" style={{ borderColor: 'var(--imx-border)' }}>
                <Link to="/web/agence/profil" className="text-[var(--imx-accent)] font-semibold hover:underline">
                  Modifier IFU & infos
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Actions & Recent Listings */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Derniers mandats ajoutés */}
            <div className="lg:col-span-7 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: 'var(--imx-border)' }}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                    Derniers mandats ajoutés
                  </h2>
                  <p className="text-xs text-gray-500">Vos biens publiés les plus récents</p>
                </div>
                <Link to="/web/agence/annonces" className="text-xs font-semibold text-[var(--imx-accent)] hover:underline flex items-center gap-1">
                  Voir tout ({stats.totalListings}) <ArrowUpRight size={13} />
                </Link>
              </div>

              {recentListings.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  <Building2 size={36} className="mx-auto mb-2 opacity-30 text-gray-400" />
                  Aucun bien publié pour le moment.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--imx-border)' }}>
                  {recentListings.map((l) => {
                    const cover = l.listing_photos?.find((p: any) => p.is_cover) || l.listing_photos?.[0];
                    const photoUrl = cover ? getOptimizedUrl(cover.photo_url, 'thumb') : null;

                    return (
                      <div key={l.id} className="py-3.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 border" style={{ borderColor: 'var(--imx-border)' }}>
                            {photoUrl ? (
                              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <Building2 size={20} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <Link to={`/web/annonce/${l.id}`} className="font-bold text-sm text-gray-900 hover:text-[var(--imx-accent)] transition-colors truncate block">
                              {l.title}
                            </Link>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <MapPin size={11} className="text-gray-400" />
                              <span className="truncate">{l.neighborhood ? `${l.neighborhood}, ` : ''}{l.city}</span>
                              <span className="mx-1">·</span>
                              <span className="font-bold text-[var(--imx-accent)]">{formatMontant(l.monthly_rent)}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            l.availability_status === 'disponible'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {l.availability_status === 'disponible' ? 'Disponible' : 'Loué'}
                          </span>
                          <Link
                            to={`/web/annonce/${l.id}`}
                            className="p-1.5 rounded-lg border text-gray-400 hover:text-[var(--imx-accent)] hover:bg-purple-50 transition-colors"
                            title="Consulter l'annonce"
                            style={{ borderColor: 'var(--imx-border)' }}
                          >
                            <Eye size={14} />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Dernières candidatures et demandes de contact */}
            <div className="lg:col-span-5 rounded-2xl border bg-white p-6 shadow-sm space-y-4" style={{ borderColor: 'var(--imx-border)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                    Demandes récentes
                  </h2>
                  <p className="text-xs text-gray-500">Candidats à contacter en priorité</p>
                </div>
                <Link to="/web/agence/demandes" className="text-xs font-semibold text-[var(--imx-accent)] hover:underline flex items-center gap-1">
                  Voir tout <ArrowUpRight size={13} />
                </Link>
              </div>

              {recentRequests.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-400">
                  <MessageSquare size={36} className="mx-auto mb-2 opacity-30 text-gray-400" />
                  Aucune demande en attente.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRequests.map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-xl border bg-gray-50/60 flex flex-col gap-2"
                      style={{ borderColor: 'var(--imx-border)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-gray-900">{r.requester_name || 'Prospect'}</p>
                          <p className="text-[11px] text-gray-500 truncate max-w-[200px]">
                            Pour : {r.listings?.title || 'Bien'}
                          </p>
                        </div>
                        {r.contact_phone && (
                          <a
                            href={`tel:${r.contact_phone}`}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white border text-gray-700 hover:text-[var(--imx-accent)] transition-colors shadow-2xs"
                            style={{ borderColor: 'var(--imx-border)' }}
                          >
                            <Phone size={11} /> {r.contact_phone}
                          </a>
                        )}
                      </div>
                      {r.message && (
                        <p className="text-xs text-gray-600 line-clamp-2 italic bg-white p-2 rounded-lg border border-gray-100">
                          « {r.message} »
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

