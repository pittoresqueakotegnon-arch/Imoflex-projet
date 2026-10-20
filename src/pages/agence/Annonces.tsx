import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Building2, Eye, Edit3, Trash2, Clock,
  CheckCircle, XCircle, ArrowLeft, Search,
  Home,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { formatMontant } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import { useToast } from '../../components/Toast';
import { getOptimizedUrl } from '../../lib/utils';
import type { ListingSummary } from '../../lib/supabase';

type FilterStatus = 'all' | 'publiee' | 'en_attente' | 'rejetee';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  publiee:   { label: 'Publiée',     color: '#22C55E', bg: 'rgba(34,197,94,0.10)',   icon: CheckCircle },
  en_attente:{ label: 'En attente', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  icon: Clock },
  rejetee:   { label: 'Rejetée',    color: '#EF4444', bg: 'rgba(239,68,68,0.10)',   icon: XCircle },
};

const AgenceAnnonces: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [annonces, setAnnonces] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');

  const fetchAnnonces = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, city, neighborhood, monthly_rent, bedrooms, property_type, availability_status, status, rejection_reason, owner_id, accepts_progressive_payment, created_at, listing_photos(id, photo_url, room_label, display_order, is_cover)')
        .eq('owner_id', profile.id)
        .neq('status', 'supprimee')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAnnonces((data || []) as ListingSummary[]);
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du chargement', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);

  useEffect(() => { fetchAnnonces(); }, [fetchAnnonces]);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette annonce ?')) return;
    try {
      await supabase.from('listings').update({ status: 'suppression_demandee' }).eq('id', id);
      showToast('Demande de suppression envoyée', 'success');
      fetchAnnonces();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  const filtered = annonces.filter((a) => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.title?.toLowerCase().includes(q) && !a.city?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const getCoverPhoto = (a: ListingSummary) => {
    const photos = a.listing_photos || [];
    const cover = photos.find((p) => p.is_cover) || photos[0];
    return cover ? getOptimizedUrl(cover.photo_url, 'thumb') || cover.photo_url : null;
  };

  return (
    <div className="page-container premium-page flex flex-col">
      {/* HEADER */}
      <div className="premium-header px-5 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate('/agence/dashboard')}
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
          >
            <ArrowLeft size={18} color="var(--imx-text-secondary)" />
          </button>
          <div className="flex-1">
            <h1 className="font-nunito font-black text-[20px]" style={{ color: 'var(--imx-text-primary)' }}>
              Mes annonces
            </h1>
            <p className="font-space-grotesk text-[11px]" style={{ color: 'var(--imx-text-muted)' }}>
              {annonces.length} bien{annonces.length !== 1 ? 's' : ''} au total
            </p>
          </div>
          <Link
            to="/agence/publier"
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Plus size={18} />
          </Link>
        </div>

        {/* Barre de recherche */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--imx-text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un bien..."
            className="input-field w-full pl-9 text-sm"
            style={{ height: '42px', fontSize: '13px' }}
          />
        </div>

        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {(['all', 'publiee', 'en_attente', 'rejetee'] as FilterStatus[]).map((f) => {
            const labels: Record<FilterStatus, string> = {
              all: 'Toutes', publiee: 'Publiées', en_attente: 'En attente', rejetee: 'Rejetées',
            };
            const isActive = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                style={{
                  fontFamily: 'Space Grotesk',
                  background: isActive ? 'var(--imx-accent)' : 'var(--imx-surface)',
                  color: isActive ? 'white' : 'var(--imx-text-secondary)',
                  border: `1px solid ${isActive ? 'var(--imx-accent)' : 'var(--imx-border)'}`,
                }}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>
      </div>

      {/* LISTE */}
      <div className="flex-1 overflow-y-auto px-5 pb-28 space-y-3 pt-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-[20px] animate-pulse" style={{ background: 'var(--imx-surface)' }} />
          ))
        ) : filtered.length === 0 ? (
          <div
            className="rounded-[22px] p-8 flex flex-col items-center text-center mt-4"
            style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--imx-accent-xlight)' }}>
              <Building2 size={24} color="var(--imx-accent)" />
            </div>
            <p className="font-nunito font-black text-[16px] mb-2" style={{ color: 'var(--imx-text-primary)' }}>
              Aucune annonce
            </p>
            <p className="font-space-grotesk text-[12px]" style={{ color: 'var(--imx-text-secondary)' }}>
              {search ? 'Aucun résultat pour cette recherche.' : 'Publiez votre premier bien immobilier.'}
            </p>
          </div>
        ) : (
          filtered.map((annonce) => {
            const statusKey = annonce.status || 'en_attente';
            const meta = STATUS_META[statusKey] || STATUS_META.en_attente;
            const StatusIcon = meta.icon;
            const cover = getCoverPhoto(annonce);

            return (
              <div
                key={annonce.id}
                className="rounded-[20px] overflow-hidden flex"
                style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
              >
                {/* Photo */}
                <div className="w-[90px] flex-shrink-0 bg-gray-100 relative" style={{ minHeight: '96px' }}>
                  {cover ? (
                    <img src={cover} alt={annonce.title} className="w-full h-full object-cover" style={{ minHeight: '96px' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--imx-surface-2)', minHeight: '96px' }}>
                      <Home size={24} color="var(--imx-text-muted)" />
                    </div>
                  )}
                </div>

                {/* Infos */}
                <div className="flex-1 p-3 min-w-0">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <h4 className="font-nunito font-bold text-[13px] truncate" style={{ color: 'var(--imx-text-primary)' }}>
                      {annonce.title}
                    </h4>
                    <span
                      className="flex-shrink-0 flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: meta.bg, color: meta.color, fontFamily: 'Space Grotesk' }}
                    >
                      <StatusIcon size={9} />
                      {meta.label}
                    </span>
                  </div>
                  <p className="font-space-grotesk text-[11px] mb-1" style={{ color: 'var(--imx-text-muted)' }}>
                    {annonce.city}{annonce.neighborhood ? `, ${annonce.neighborhood}` : ''}
                  </p>
                  <p className="font-nunito font-black text-[14px]" style={{ color: 'var(--imx-accent)' }}>
                    {formatMontant(annonce.monthly_rent)}<span className="text-[10px] font-medium" style={{ color: 'var(--imx-text-muted)' }}>/mois</span>
                  </p>

                  {annonce.rejection_reason && (
                    <p className="font-space-grotesk text-[10px] mt-1" style={{ color: '#EF4444' }}>
                      {annonce.rejection_reason}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-2">
                    <Link
                      to={`/annonce/${annonce.id}`}
                      className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}
                    >
                      <Eye size={11} /> Voir
                    </Link>
                    <Link
                      to={`/agence/publier?edit=${annonce.id}`}
                      className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}
                    >
                      <Edit3 size={11} /> Modifier
                    </Link>
                    <button
                      onClick={() => handleDelete(annonce.id)}
                      className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg ml-auto"
                      style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontFamily: 'Space Grotesk' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default AgenceAnnonces;
