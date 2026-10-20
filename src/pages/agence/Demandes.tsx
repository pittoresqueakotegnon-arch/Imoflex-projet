import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, Check, MessageCircle, ArrowLeft, Building2, User,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import { useToast } from '../../components/Toast';
import { PullToRefresh } from '../../components/PullToRefresh';

interface ContactReq {
  id: string;
  listing_id: string;
  requester_id: string;
  message: string;
  contact_phone: string;
  status: 'nouvelle' | 'traitee';
  created_at: string;
  listing_title?: string;
  requester_name?: string;
}

const AgenceDemandes: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [demandes, setDemandes] = useState<ContactReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'nouvelle' | 'traitee'>('all');

  const fetchDemandes = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      // Récupérer les IDs des annonces de l'agence
      const { data: listingsData } = await supabase
        .from('listings')
        .select('id, title')
        .eq('owner_id', profile.id);

      if (!listingsData || listingsData.length === 0) {
        setDemandes([]);
        setLoading(false);
        return;
      }

      const listingIds = listingsData.map((l) => l.id);
      const listingMap = Object.fromEntries(listingsData.map((l) => [l.id, l.title]));

      const { data, error } = await supabase
        .from('contact_requests')
        .select('id, listing_id, requester_id, message, contact_phone, status, created_at, users!requester_id(full_name)')
        .in('listing_id', listingIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched: ContactReq[] = (data || []).map((d: any) => ({
        id: d.id,
        listing_id: d.listing_id,
        requester_id: d.requester_id,
        message: d.message,
        contact_phone: d.contact_phone,
        status: d.status,
        created_at: d.created_at,
        listing_title: listingMap[d.listing_id] || 'Annonce inconnue',
        requester_name: d.users?.full_name || 'Candidat',
      }));

      setDemandes(enriched);
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du chargement', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);

  useEffect(() => { fetchDemandes(); }, [fetchDemandes]);

  const markTraitee = async (id: string) => {
    try {
      await supabase.from('contact_requests').update({ status: 'traitee' }).eq('id', id);
      setDemandes((prev) => prev.map((d) => d.id === id ? { ...d, status: 'traitee' } : d));
      showToast('Demande marquée comme traitée', 'success');
    } catch {
      showToast('Erreur', 'error');
    }
  };

  const filtered = demandes.filter((d) => filter === 'all' || d.status === filter);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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
          <div>
            <h1 className="font-nunito font-black text-[20px]" style={{ color: 'var(--imx-text-primary)' }}>
              Demandes de contact
            </h1>
            <p className="font-space-grotesk text-[11px]" style={{ color: 'var(--imx-text-muted)' }}>
              {demandes.filter((d) => d.status === 'nouvelle').length} non traitée(s)
            </p>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex gap-2">
          {([
            { key: 'all', label: 'Toutes' },
            { key: 'nouvelle', label: 'Nouvelles' },
            { key: 'traitee', label: 'Traitées' },
          ] as { key: 'all' | 'nouvelle' | 'traitee'; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
              style={{
                fontFamily: 'Space Grotesk',
                background: filter === key ? 'var(--imx-accent)' : 'var(--imx-surface)',
                color: filter === key ? 'white' : 'var(--imx-text-secondary)',
                border: `1px solid ${filter === key ? 'var(--imx-accent)' : 'var(--imx-border)'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* LISTE */}
      <PullToRefresh onRefresh={fetchDemandes}>
        <div className="flex-1 px-5 pb-28 space-y-3 pt-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 rounded-[20px] animate-pulse" style={{ background: 'var(--imx-surface)' }} />
            ))
          ) : filtered.length === 0 ? (
            <div
              className="rounded-[22px] p-8 flex flex-col items-center text-center mt-4"
              style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--imx-accent-xlight)' }}>
                <MessageCircle size={24} color="var(--imx-accent)" />
              </div>
              <p className="font-nunito font-black text-[15px] mb-1" style={{ color: 'var(--imx-text-primary)' }}>
                Aucune demande
              </p>
              <p className="font-space-grotesk text-[12px]" style={{ color: 'var(--imx-text-secondary)' }}>
                Les candidats intéressés apparaîtront ici.
              </p>
            </div>
          ) : (
            filtered.map((d) => (
              <div
                key={d.id}
                className="rounded-[20px] p-4"
                style={{
                  background: 'var(--imx-surface)',
                  border: `1px solid ${d.status === 'nouvelle' ? 'rgba(14,165,233,0.3)' : 'var(--imx-border)'}`,
                  boxShadow: d.status === 'nouvelle' ? '0 0 0 1px rgba(14,165,233,0.08)' : 'none',
                }}
              >
                {/* En-tête */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: d.status === 'nouvelle' ? 'rgba(14,165,233,0.1)' : 'var(--imx-surface-2)' }}
                    >
                      <User size={15} color={d.status === 'nouvelle' ? '#0EA5E9' : 'var(--imx-text-muted)'} />
                    </div>
                    <div>
                      <p className="font-nunito font-bold text-[13px]" style={{ color: 'var(--imx-text-primary)' }}>
                        {d.requester_name}
                      </p>
                      <p className="font-space-grotesk text-[10px]" style={{ color: 'var(--imx-text-muted)' }}>
                        {formatDate(d.created_at)}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: d.status === 'nouvelle' ? 'rgba(14,165,233,0.1)' : 'var(--imx-surface-2)',
                      color: d.status === 'nouvelle' ? '#0EA5E9' : 'var(--imx-text-muted)',
                      fontFamily: 'Space Grotesk',
                    }}
                  >
                    {d.status === 'nouvelle' ? 'Nouvelle' : 'Traitée'}
                  </span>
                </div>

                {/* Annonce concernée */}
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg" style={{ background: 'var(--imx-surface-2)' }}>
                  <Building2 size={11} color="var(--imx-accent)" />
                  <span className="font-space-grotesk text-[11px] font-semibold truncate" style={{ color: 'var(--imx-accent)' }}>
                    {d.listing_title}
                  </span>
                </div>

                {/* Message */}
                <p
                  className="font-space-grotesk text-[12px] leading-relaxed mb-3 line-clamp-2"
                  style={{ color: 'var(--imx-text-secondary)' }}
                >
                  {d.message}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${d.contact_phone}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold text-white"
                    style={{ background: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}
                  >
                    <Phone size={13} />
                    {d.contact_phone}
                  </a>
                  {d.status === 'nouvelle' && (
                    <button
                      onClick={() => markTraitee(d.id)}
                      className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold"
                      style={{ background: 'rgba(34,197,94,0.1)', color: '#22C55E', fontFamily: 'Space Grotesk', border: '1px solid rgba(34,197,94,0.2)' }}
                    >
                      <Check size={13} /> Traité
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PullToRefresh>

      <BottomNav />
    </div>
  );
};

export default AgenceDemandes;
