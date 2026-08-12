import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Building2, ArrowRight, Home } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { getCurrentMonth, getMonthName } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import { HeaderBell } from '../../components/HeaderBell';
import { useToast } from '../../components/Toast';
import { getGreeting } from '../../utils/greeting';

interface DashboardData {
  totalEncaisse: number;
  totalListingsRaw: number;  // total brut des annonces (avant filtre par demandes)
  listings: Array<{
    id: string;
    title: string;
    location: string;
    newRequests: number;
  }>;
  properties: Array<{
    id: string;
    leaseId: string;
    name: string;
    address: string;
    monthlyRent: number;
    amountPaid: number;
    amountDue: number;
    status: string;
  }>;
  stats: {
    soldes: number;
    enCours: number;
    enRetard: number;
  };
}

// Barre de progression avec couleur dynamique
const ProgressBar: React.FC<{ current: number; total: number; isSolde: boolean }> = ({ current, total, isSolde }) => {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <div className="h-[6px] rounded-full w-full mt-3 mb-2" style={{ background: 'var(--imx-border)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: isSolde
            ? 'linear-gradient(90deg, #16A34A, #22C55E)'
            : 'linear-gradient(90deg, #7B3FE4, #C084FC)',
        }}
      />
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Court-circuit pour un locataire curieux qui clique sur "Propriétaire" ──
  // On affiche directement l'écran d'onboarding sans chercher des données en base
  const isLocataire = profile?.role === 'locataire';

  useEffect(() => {
    if (!profile?.id) return;

    const fetchData = async () => {
      try {
        // Fetch listings
        const { data: listingsData, error: listingsError } = await supabase
          .from('listings')
          .select('id, title, city, neighborhood')
          .eq('owner_id', profile.id)
          .eq('status', 'publiee');

        if (listingsError) throw listingsError;

        const listingIds = (listingsData || []).map(l => l.id);

        let requestCountByListing: Record<string, number> = {};
        if (listingIds.length > 0) {
          const { data: allRequests, error: requestsError } = await supabase
            .from('contact_requests')
            .select('listing_id')
            .in('listing_id', listingIds)
            .eq('status', 'nouvelle');

          if (requestsError) throw requestsError;
          requestCountByListing = (allRequests || []).reduce((acc, r) => {
            acc[r.listing_id] = (acc[r.listing_id] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
        }

        const listingsWithRequests: DashboardData['listings'] = (listingsData || []).map(listing => ({
          id: listing.id,
          title: listing.title,
          location: listing.neighborhood || listing.city,
          newRequests: requestCountByListing[listing.id] || 0,
        }));

        // Fetch properties
        const { data: propertiesData, error: propertiesError } = await supabase
          .from('properties')
          .select('id, name, address, monthly_rent')
          .eq('owner_id', profile.id)
          .eq('is_active', true);

        if (propertiesError) throw propertiesError;

        const propertyIds = (propertiesData || []).map(p => p.id);
        const { month, year } = getCurrentMonth();

        let leaseByProperty: Record<string, string> = {};
        if (propertyIds.length > 0) {
          const { data: leases, error: leasesError } = await supabase
            .from('leases')
            .select('id, property_id')
            .in('property_id', propertyIds)
            .eq('status', 'actif');

          if (leasesError) throw leasesError;
          leaseByProperty = (leases || []).reduce((acc, l) => {
            acc[l.property_id] = l.id;
            return acc;
          }, {} as Record<string, string>);
        }

        const leaseIds = Object.values(leaseByProperty);
        let rentPeriodByLease: Record<string, { amount_paid: number; amount_due: number; status: string }> = {};
        if (leaseIds.length > 0) {
          const { data: rentPeriods, error: rentError } = await supabase
            .from('rent_periods')
            .select('lease_id, amount_paid, amount_due, status')
            .in('lease_id', leaseIds)
            .eq('period_month', month)
            .eq('period_year', year);

          if (rentError) throw rentError;
          rentPeriodByLease = (rentPeriods || []).reduce((acc, rp) => {
            acc[rp.lease_id] = rp;
            return acc;
          }, {} as Record<string, { amount_paid: number; amount_due: number; status: string }>);
        }

        const properties: DashboardData['properties'] = [];
        let totalEncaisse = 0;
        let soldes = 0;
        let enCours = 0;
        let enRetard = 0;

        for (const property of propertiesData || []) {
          const leaseId = leaseByProperty[property.id];
          const period = leaseId ? rentPeriodByLease[leaseId] : undefined;
          if (!period) continue;

          properties.push({
            id: property.id,
            leaseId: leaseId,
            name: property.name,
            address: property.address,
            monthlyRent: property.monthly_rent,
            amountPaid: period.amount_paid || 0,
            amountDue: period.amount_due || 0,
            status: period.status,
          });
          totalEncaisse += period.amount_paid || 0;

          if (period.status === 'solde') soldes++;
          else if (period.status === 'en_cours') enCours++;
          else if (period.status === 'retard') enRetard++;
        }

        // Mélanger les propriétés (shuffle) au lieu de trier, comme demandé
        for (let i = properties.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [properties[i], properties[j]] = [properties[j], properties[i]];
        }

        setData({
          totalEncaisse,
          totalListingsRaw: (listingsData || []).length,  // compte brut avant filtre
          listings: listingsWithRequests.filter(l => l.newRequests > 0),
          properties,
          stats: { soldes, enCours, enRetard },
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        showToast('Erreur lors du chargement des données', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id, showToast]);

  if (loading && !isLocataire) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="space-y-2">
              <div className="h-3 bg-[var(--imx-surface-2)] rounded w-24 animate-pulse"></div>
              <div className="h-6 bg-[var(--imx-surface-2)] rounded w-40 animate-pulse"></div>
            </div>
            <div className="w-11 h-11 bg-[var(--imx-surface-2)] rounded-xl animate-pulse"></div>
          </div>
          <div className="h-36 bg-[#1A3A1A] rounded-3xl animate-pulse"></div>
          <div className="h-32 bg-[var(--imx-surface)] rounded-2xl animate-pulse"></div>
          <div className="h-32 bg-[var(--imx-surface)] rounded-2xl animate-pulse"></div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const { month, year } = getCurrentMonth();
  const monthName = getMonthName(month, year).toUpperCase();
  const newRequestsTotal = data?.listings.reduce((sum, l) => sum + l.newRequests, 0) || 0;

  // ── Écran d'embarquement si VRAIMENT aucun bien géré ──────────────────────
  // On utilise totalListingsRaw (compte brut) pour ne pas confondre "pas de demandes" avec "pas d'annonces"
  const hasNoProperty = (data?.totalListingsRaw || 0) === 0 && (data?.properties.length || 0) === 0;

  // ── Locataire curieux : afficher l'écran d'invitation Propriétaire ──────────
  if (isLocataire || hasNoProperty) {
    return (
      <div className="page-container flex flex-col">
        {/* Role switcher */}
        <div className="px-4 pt-4 flex justify-center">
          <div className="bg-[var(--imx-surface)] rounded-full p-1 flex items-center border border-white/5">
            <button className="px-5 py-1.5 rounded-full text-[11px] font-bold text-white bg-[var(--imx-accent-light)] shadow-sm font-nunito">
              Propriétaire
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-1.5 rounded-full text-[11px] font-bold text-[var(--imx-text-secondary)] hover:text-[var(--imx-text-primary)] transition-colors font-nunito"
            >
              Locataire
            </button>
          </div>
        </div>

        {/* Onboarding Screen */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24 text-center">
          {/* Orb illustratif */}
          <div className="relative mb-8">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(145deg, #1A1240 0%, #261C55 100%)',
                boxShadow: '0 0 40px rgba(168,85,247,0.2)',
                border: '1px solid rgba(168,85,247,0.15)',
              }}
            >
              <Building2 size={40} className="text-[var(--imx-accent-light)]" />
            </div>
            <div
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: '#22C55E' }}
            >
              <Home size={16} className="text-white" />
            </div>
          </div>

          <h1 className="font-nunito font-900 text-[var(--imx-text-primary)] text-[24px] leading-tight mb-3">
            Vous louez un bien immobilier ?
          </h1>
          <p className="text-[var(--imx-text-secondary)] text-[14px] leading-relaxed mb-10" style={{ fontFamily: 'Space Grotesk', maxWidth: 320 }}>
            Simplifiez vos encaissements MoMo, suivez vos locataires et sécurisez vos loyers sur ImoFlex.
          </p>

          {/* CTA principal — adapté selon le rôle */}
          {isLocataire ? (
            <a
              href="https://wa.me/22960000000?text=Bonjour%20ImoFlex%20!%20Je%20suis%20locataire%20et%20souhaite%20créer%20un%20compte%20Bailleur."
              target="_blank"
              rel="noopener noreferrer"
              className="w-full max-w-xs flex items-center justify-center gap-2 text-white font-nunito font-900 text-[16px] rounded-3xl py-4 mb-4 transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)' }}
            >
              💬 Demander un compte Bailleur
            </a>
          ) : (
            <Link
              to="/pro/publier"
              className="w-full max-w-xs flex items-center justify-center gap-2 text-white font-nunito font-900 text-[16px] rounded-3xl py-4 mb-4 transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #7B3FE4 0%, #A855F7 100%)' }}
            >
              <Plus size={20} />
              Ajouter mon premier logement
            </Link>
          )}

          {/* CTA secondaire */}
          <Link
            to="/marketplace"
            className="flex items-center gap-1.5 text-[var(--imx-accent-light)] text-[13px] font-semibold hover:text-purple-300 transition-colors"
            style={{ fontFamily: 'Space Grotesk' }}
          >
            Parcourir les annonces
            <ArrowRight size={14} />
          </Link>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-10">
            {['Paiements MoMo', 'Suivi locataires', 'Quittances PDF', 'Sécurité Supabase'].map((f) => (
              <span
                key={f}
                className="text-[11px] font-semibold px-3 py-1 rounded-full"
                style={{
                  background: 'rgba(168,85,247,0.08)',
                  border: '1px solid rgba(168,85,247,0.15)',
                  color: 'var(--imx-accent-glow)',
                  fontFamily: 'Space Grotesk',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* ── Role Switcher ── */}
      <div className="px-4 pt-4 flex justify-center">
        <div className="bg-[var(--imx-surface)] rounded-full p-1 flex items-center border border-white/5">
          <button className="px-5 py-1.5 rounded-full text-[11px] font-bold text-white bg-[var(--imx-accent-light)] shadow-sm font-nunito">
            Propriétaire
          </button>
          <button 
            onClick={() => navigate('/dashboard')}
            className="px-5 py-1.5 rounded-full text-[11px] font-bold text-[var(--imx-text-secondary)] hover:text-[var(--imx-text-primary)] transition-colors font-nunito"
          >
            Locataire
          </button>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-4 flex items-center justify-between">
        <div>
          <span
            style={{ color: 'var(--imx-accent-light)', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '0.85rem' }}
          >
            {getGreeting()}
          </span>
          <h1 className="text-[22px] font-nunito font-black text-[var(--imx-text-primary)] mt-0.5 leading-tight">
            {profile?.full_name || 'Ama Adjovi'}
          </h1>
        </div>

        {/* Bell button — using shared component */}
        <HeaderBell />
      </div>

      <div className="px-4 space-y-4 flex-1 pb-6">
        {/* ── CARTE TOTAL ENCAISSÉ (fond vert foncé) ── */}
        <div
          className="rounded-[20px] p-5 text-white relative overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, #061510 0%, #0A2418 55%, #0E3422 100%)',
            boxShadow: '0 4px 28px rgba(5, 18, 10, 0.8)',
            border: '1px solid rgba(34, 197, 94, 0.12)',
          }}
        >
          {/* Subtle glow orb top-right */}
          <div
            className="absolute -top-4 -right-4 w-24 h-24 rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)' }}
          />

          {/* Label */}
          <p
            className="text-[10px] font-bold uppercase tracking-[0.12em] mb-2"
            style={{ color: 'rgba(134,239,172,0.9)', fontFamily: 'Space Grotesk' }}
          >
            TOTAL ENCAISSÉ — {monthName}
          </p>

          {/* Amount */}
          <h2
            className="font-nunito font-black text-[2.2rem] leading-none mb-5"
            style={{ letterSpacing: '-0.5px' }}
          >
            {new Intl.NumberFormat('fr-FR').format(data?.totalEncaisse || 0)}{' '}
            <span className="text-[1.5rem]">FCFA</span>
          </h2>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {/* Soldés */}
            <div
              className="rounded-xl py-2.5 px-1"
              style={{ background: 'rgba(34,197,94,0.06)' }}
            >
              <p className="font-nunito font-black text-[22px] leading-none" style={{ color: '#4ADE80' }}>
                {data?.stats.soldes || 0}
              </p>
              <p
                className="text-[10px] mt-1.5 font-bold"
                style={{ color: '#227041', fontFamily: 'Space Grotesk' }}
              >
                Soldés
              </p>
            </div>
            {/* En cours */}
            <div
              className="rounded-xl py-2.5 px-1"
              style={{ background: 'rgba(34,197,94,0.06)' }}
            >
              <p className="font-nunito font-black text-[22px] leading-none" style={{ color: '#FB923C' }}>
                {data?.stats.enCours || 0}
              </p>
              <p
                className="text-[10px] mt-1.5 font-bold"
                style={{ color: '#227041', fontFamily: 'Space Grotesk' }}
              >
                En cours
              </p>
            </div>
            {/* Retard */}
            <div
              className="rounded-xl py-2.5 px-1"
              style={{ background: 'rgba(34,197,94,0.06)' }}
            >
              <p className="font-nunito font-black text-[22px] leading-none" style={{ color: '#F87171' }}>
                {data?.stats.enRetard || 0}
              </p>
              <p
                className="text-[10px] mt-1.5 font-bold"
                style={{ color: '#227041', fontFamily: 'Space Grotesk' }}
              >
                Retard
              </p>
            </div>
          </div>
        </div>

        {/* ── DEMANDES REÇUES ── */}
        {data?.listings && data.listings.length > 0 && (
          <div>
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px]">Demandes reçues</h3>
              {newRequestsTotal > 0 && (
                <span
                  className="text-[10px] font-bold rounded-md px-2.5 py-1"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#FBBF24', fontFamily: 'Space Grotesk', letterSpacing: '0.04em' }}
                >
                  {newRequestsTotal} NOUVELLE{newRequestsTotal !== 1 ? 'S' : ''}
                </span>
              )}
            </div>

            {/* Listing cards */}
            <div className="space-y-2.5">
              {data.listings.map(listing => (
                <Link
                  key={listing.id}
                  to="/pro/demandes"
                  className="flex items-center justify-between px-4 py-3.5 rounded-[16px] hover:opacity-90 transition"
                  style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-nunito font-bold text-[var(--imx-text-primary)] text-[14px] truncate">{listing.title}</p>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                      📍 {listing.location}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold text-white rounded-md px-2.5 py-1 flex-shrink-0"
                    style={{ background: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}
                  >
                    {listing.newRequests} demande{listing.newRequests !== 1 ? 's' : ''}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── MES LOGEMENTS ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px]">Mes logements</h3>
          </div>

          {data?.properties && data.properties.length > 0 ? (
            <div className="space-y-3">
              {data.properties.map(property => {
                const isSolde = property.status === 'solde' || (property.amountPaid >= property.amountDue && property.amountDue > 0);
                const isRetard = property.status === 'retard';
                return (
                  <Link
                    key={property.id}
                    to={`/pro/bail/${property.leaseId}`}
                    className="rounded-[16px] px-4 py-4 block hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
                  >
                    {/* Top row: name + badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px] leading-tight truncate">
                          {property.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <svg width="10" height="12" viewBox="0 0 24 24" fill="#E11D48" className="flex-shrink-0">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                          <p className="text-[11px] truncate" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>
                            {property.address}
                          </p>
                        </div>
                      </div>
                      {/* Status badge */}
                      <span
                        className="text-[9px] font-bold rounded-md px-2.5 py-1 flex-shrink-0 mt-0.5 uppercase"
                        style={{
                          fontFamily: 'Space Grotesk',
                          letterSpacing: '0.04em',
                          background: isSolde ? 'rgba(34,197,94,0.15)' : isRetard ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                          color: isSolde ? '#4ADE80' : isRetard ? '#F87171' : '#FBBF24',
                        }}
                      >
                        {isSolde ? 'SOLDÉ' : isRetard ? 'RETARD' : 'EN COURS'}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <ProgressBar
                      current={property.amountPaid}
                      total={property.amountDue}
                      isSolde={isSolde}
                    />

                    {/* Amount row */}
                    <div className="flex justify-between text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                      <span style={{ color: isSolde ? '#4ADE80' : isRetard ? '#F87171' : 'var(--imx-accent-light)' }}>
                        {new Intl.NumberFormat('fr-FR').format(property.amountPaid)} F reçus
                      </span>
                      <span style={{ color: 'var(--imx-text-muted)' }}>
                        / {new Intl.NumberFormat('fr-FR').format(property.amountDue)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div
              className="rounded-[16px] p-8 text-center flex flex-col items-center"
              style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--imx-surface-2)', border: '1px solid var(--imx-border)' }}>
                <Home size={28} color="var(--imx-accent-glow)" />
              </div>
              <p className="font-nunito font-bold text-[var(--imx-text-primary)] mb-1.5 text-sm">Aucun logement occupé pour l'instant</p>
              <p
                className="text-xs max-w-[240px] leading-relaxed mb-6"
                style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}
              >
                Publiez une annonce, puis activez-la une fois louée pour suivre les loyers ici.
              </p>
              <Link to="/pro/publier" className="btn-primary w-full max-w-[220px]">
                Publier une annonce
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <Link
        to="/pro/publier"
        className="fixed flex items-center justify-center text-white"
        style={{
          bottom: '82px',
          right: '16px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #7B3FE4, #A855F7)',
          boxShadow: '0 4px 16px rgba(123,63,228,0.5)',
          zIndex: 45,
        }}
      >
        <Plus size={22} />
      </Link>

      <BottomNav />
    </div>
  );
};

export default Dashboard;
