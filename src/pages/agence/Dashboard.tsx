import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Building2, ArrowRight, MessageCircle,
  Users, TrendingUp, Briefcase, Home,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import BottomNav from '../../components/BottomNav';
import { HeaderBell } from '../../components/HeaderBell';
import { HeaderSupport } from '../../components/HeaderSupport';
import { useToast } from '../../components/Toast';
import { getGreeting } from '../../utils/greeting';
import { PullToRefresh } from '../../components/PullToRefresh';
import type { AgenceProfile } from '../../lib/supabase';

interface AgenceStats {
  totalAnnonces: number;
  annoncesActives: number;
  totalDemandes: number;
  demandesNouvelles: number;
}

const AgenceDashboard: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [agenceProfile, setAgenceProfile] = useState<AgenceProfile | null>(null);
  const [stats, setStats] = useState<AgenceStats>({
    totalAnnonces: 0,
    annoncesActives: 0,
    totalDemandes: 0,
    demandesNouvelles: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      // Profil agence
      const { data: agProf } = await supabase
        .from('agences_profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();
      setAgenceProfile(agProf);

      // Stats annonces
      const { count: totalAnnonces } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', profile.id);

      const { count: annoncesActives } = await supabase
        .from('listings')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', profile.id)
        .eq('is_published', true);

      // Stats demandes de contact
      const { data: listingsIds } = await supabase
        .from('listings')
        .select('id')
        .eq('owner_id', profile.id);

      let totalDemandes = 0;
      let demandesNouvelles = 0;
      if (listingsIds && listingsIds.length > 0) {
        const ids = listingsIds.map((l) => l.id);
        const { count: tot } = await supabase
          .from('contact_requests')
          .select('*', { count: 'exact', head: true })
          .in('listing_id', ids);
        const { count: nouv } = await supabase
          .from('contact_requests')
          .select('*', { count: 'exact', head: true })
          .in('listing_id', ids)
          .eq('status', 'nouvelle');
        totalDemandes = tot || 0;
        demandesNouvelles = nouv || 0;
      }

      setStats({
        totalAnnonces: totalAnnonces || 0,
        annoncesActives: annoncesActives || 0,
        totalDemandes,
        demandesNouvelles,
      });
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du chargement', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const nomAgence = agenceProfile?.nom_agence || profile?.full_name || 'Agence';

  // ── LOADING ──
  if (loading) {
    return (
      <div className="page-container premium-page">
        <div className="px-5 pt-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="w-36 h-7 bg-gray-200 rounded-lg animate-pulse" />
            <div className="flex gap-2">
              <div className="w-10 h-10 bg-gray-200 rounded-2xl animate-pulse" />
              <div className="w-10 h-10 bg-gray-200 rounded-2xl animate-pulse" />
            </div>
          </div>
          <div className="h-44 rounded-[28px] animate-pulse" style={{ background: 'var(--imx-surface-2)' }} />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-[20px] animate-pulse" style={{ background: 'var(--imx-surface)' }} />
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── ONBOARDING (pas encore d'annonce) ──
  if (stats.totalAnnonces === 0 && !loading) {
    return (
      <div className="page-container premium-page flex flex-col">
        <div className="premium-header px-5 pt-6 pb-4 flex items-center justify-between">
          <div>
            <p className="text-gray-400 font-space-grotesk font-semibold text-[11px] uppercase tracking-widest">
              {getGreeting()}
            </p>
            <h1 className="text-[22px] font-nunito font-black mt-0.5" style={{ color: 'var(--imx-text-primary)' }}>
              {nomAgence} 🏢
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <HeaderSupport />
            <HeaderBell />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24 text-center">
          <div className="relative mb-8">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center"
              style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}
            >
              <Briefcase size={40} style={{ color: 'var(--imx-accent-light)' }} />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl flex items-center justify-center bg-[#22C55E]">
              <Plus size={16} className="text-white" />
            </div>
          </div>
          <h1 className="font-nunito font-black text-[22px] leading-tight mb-3" style={{ color: 'var(--imx-text-primary)' }}>
            Publiez vos premiers biens
          </h1>
          <p className="text-[14px] leading-relaxed mb-10 max-w-[300px]" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
            En tant qu'agence, gérez et publiez facilement vos biens immobiliers sur ImoFlex.
          </p>
          <Link
            to="/agence/publier"
            className="w-full max-w-xs flex items-center justify-center gap-2 text-white font-nunito font-black text-[16px] rounded-3xl py-4 mb-4 active:scale-95 transition-transform"
            style={{ background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)' }}
          >
            <Plus size={20} /> Publier un bien
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--imx-accent-light)', fontFamily: 'Space Grotesk' }}>
            Parcourir le marché <ArrowRight size={14} />
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── DASHBOARD PRINCIPAL ──
  return (
    <div className="page-container premium-page flex flex-col">
      <PullToRefresh onRefresh={fetchData}>

        {/* ── HEADER ── */}
        <div className="premium-header px-5 pt-6 pb-4 flex items-center justify-between">
          <div>
            <p className="text-gray-400 font-space-grotesk font-semibold text-[11px] uppercase tracking-widest">
              {getGreeting()}
            </p>
            <h1 className="text-[22px] font-nunito font-black mt-0.5 leading-tight" style={{ color: 'var(--imx-text-primary)' }}>
              {nomAgence} 🏢
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <HeaderSupport />
            <HeaderBell />
          </div>
        </div>

        {/* ── CARTE HERO AGENCE ── */}
        <section
          className="relative mx-5 mb-5 overflow-hidden rounded-[24px] p-5"
          style={{
            background: 'linear-gradient(150deg, #0EA5E9 0%, #0369A1 50%, #0C4A6E 100%)',
            boxShadow: '0 12px 30px rgba(14, 165, 233, 0.28)',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-white/10 bg-gradient-to-br from-white/15 to-transparent" />
          <div className="pointer-events-none absolute -bottom-14 -left-10 h-52 w-52 rounded-full border border-white/5 bg-gradient-to-br from-transparent to-white/8" />
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <Briefcase size={13} color="white" />
                  </div>
                  <span className="font-space-grotesk text-[10px] font-bold uppercase tracking-widest text-white/70">
                    Portefeuille agence
                  </span>
                </div>
                <p className="font-nunito font-black text-[2rem] leading-none text-white tracking-[-0.03em]">
                  {stats.annoncesActives}
                </p>
                <p className="font-space-grotesk text-[11px] text-white/60 mt-1">
                  bien{stats.annoncesActives !== 1 ? 's' : ''} actif{stats.annoncesActives !== 1 ? 's' : ''}
                </p>
              </div>
              {agenceProfile?.is_verified && (
                <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5" style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.14)' }}>
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="font-space-grotesk text-[10px] font-bold text-white">Vérifiée</span>
                </div>
              )}
            </div>

            <div className="h-[1px] mb-4 bg-white/15" />

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total', value: stats.totalAnnonces },
                { label: 'Actives', value: stats.annoncesActives },
                { label: 'Demandes', value: stats.totalDemandes },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-2.5" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <p className="font-nunito font-black text-[20px] leading-none text-white">{s.value}</p>
                  <p className="font-space-grotesk text-[9px] text-white/60 mt-0.5 uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="px-5 pb-8 space-y-5">

          {/* ── ACCÈS RAPIDES ── */}
          <section>
            <h2 className="font-nunito font-black text-[15px] mb-3 ml-1" style={{ color: 'var(--imx-text-primary)' }}>
              Accès rapides
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { to: '/agence/annonces', label: 'Annonces', icon: Building2 },
                { to: '/agence/demandes', label: 'Demandes', icon: MessageCircle },
                { to: '/agence/profil-agence', label: 'Mon agence', icon: Briefcase },
              ].map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="rounded-[18px] py-3 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--imx-accent-xlight)' }}>
                    <Icon size={17} color="var(--imx-accent)" />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}>
                    {label}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── STATS DÉTAILLÉES ── */}
          <section className="rounded-[22px] p-5" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'var(--imx-accent-xlight)' }}>
                <TrendingUp size={14} color="var(--imx-accent)" />
              </div>
              <h3 className="font-nunito font-black text-[15px]" style={{ color: 'var(--imx-text-primary)' }}>
                Activité
              </h3>
            </div>

            <div className="space-y-3">
              {[
                {
                  label: 'Annonces publiées',
                  value: stats.annoncesActives,
                  total: stats.totalAnnonces,
                  color: '#0EA5E9',
                  icon: Home,
                },
                {
                  label: 'Demandes reçues',
                  value: stats.demandesNouvelles,
                  total: stats.totalDemandes,
                  color: '#A855F7',
                  icon: Users,
                  suffix: ' nouvelles',
                },
              ].map((item) => {
                const Icon = item.icon;
                const pct = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon size={13} color={item.color} />
                        <span className="font-space-grotesk text-[12px] font-semibold" style={{ color: 'var(--imx-text-secondary)' }}>
                          {item.label}
                        </span>
                      </div>
                      <span className="font-nunito font-black text-[13px]" style={{ color: 'var(--imx-text-primary)' }}>
                        {item.value}{item.suffix || ''} / {item.total}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--imx-border)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(pct, 100)}%`, background: item.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── DEMANDES EN ATTENTE ── */}
          {stats.demandesNouvelles > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-nunito font-black text-[16px]" style={{ color: 'var(--imx-text-primary)' }}>
                  À traiter
                </h3>
                <span className="font-space-grotesk text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ color: 'var(--imx-accent)', background: 'var(--imx-accent-xlight)' }}>
                  {stats.demandesNouvelles} nouvelle{stats.demandesNouvelles > 1 ? 's' : ''}
                </span>
              </div>
              <Link
                to="/agence/demandes"
                className="rounded-[18px] p-4 flex items-center justify-between active:scale-[0.99] transition-transform"
                style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(14,165,233,0.1)' }}>
                    <MessageCircle size={17} color="#0EA5E9" />
                  </div>
                  <div>
                    <h4 className="font-nunito font-bold text-[14px]" style={{ color: 'var(--imx-text-primary)' }}>
                      Demandes de contact
                    </h4>
                    <p className="font-space-grotesk text-[11px] mt-0.5" style={{ color: 'var(--imx-text-secondary)' }}>
                      {stats.demandesNouvelles} en attente de réponse
                    </p>
                  </div>
                </div>
                <ArrowRight size={16} color="var(--imx-accent)" />
              </Link>
            </section>
          )}

          {/* ── PUBLIER CTA ── */}
          <Link
            to="/agence/publier"
            className="flex items-center justify-center gap-2 w-full rounded-[18px] py-4 font-nunito font-black text-[15px] text-white active:scale-[0.98] transition-transform"
            style={{ background: 'linear-gradient(135deg, #7B3FE4, #5B2DC7)', boxShadow: '0 8px 20px rgba(123,63,228,0.3)' }}
          >
            <Plus size={18} />
            Publier un bien
          </Link>

        </div>
      </PullToRefresh>

      <BottomNav />
    </div>
  );
};

export default AgenceDashboard;
