import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { formatMontant, getCurrentMonth, getMonthName } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import { useToast } from '../../components/Toast';

interface DashboardData {
  totalEncaisse: number;
  listings: Array<{
    id: string;
    title: string;
    location: string;
    newRequests: number;
  }>;
  properties: Array<{
    id: string;
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
    <div className="h-[6px] rounded-full w-full mt-3 mb-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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

        setData({
          totalEncaisse,
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

  if (loading) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="space-y-2">
              <div className="h-3 bg-[#1E1545] rounded w-24 animate-pulse"></div>
              <div className="h-6 bg-[#1E1545] rounded w-40 animate-pulse"></div>
            </div>
            <div className="w-11 h-11 bg-[#1E1545] rounded-xl animate-pulse"></div>
          </div>
          <div className="h-36 bg-[#1A3A1A] rounded-3xl animate-pulse"></div>
          <div className="h-32 bg-[#1A1240] rounded-2xl animate-pulse"></div>
          <div className="h-32 bg-[#1A1240] rounded-2xl animate-pulse"></div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const { month, year } = getCurrentMonth();
  const monthName = getMonthName(month, year).toUpperCase();
  const newRequestsTotal = data?.listings.reduce((sum, l) => sum + l.newRequests, 0) || 0;

  return (
    <div className="page-container">
      {/* ── Header ── */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div>
          <span
            className="text-[11px] font-semibold"
            style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}
          >
            Tableau de bord
          </span>
          <h1 className="text-[22px] font-nunito font-black text-white mt-0.5 leading-tight">
            {profile?.full_name || 'Ama Adjovi'}
          </h1>
        </div>

        {/* Bell button — amber with red dot */}
        <Link
          to="/notifications"
          className="relative flex items-center justify-center"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(38, 28, 85, 0.85)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Bell icon in amber */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          {/* Red notification dot */}
          <span
            className="absolute top-[9px] right-[9px] w-2 h-2 rounded-full"
            style={{ background: '#EF4444' }}
          />
        </Link>
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
              <h3 className="font-nunito font-black text-white text-[15px]">Demandes reçues</h3>
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
                  style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-nunito font-bold text-white text-[14px] truncate">{listing.title}</p>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                      📍 {listing.location}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-bold text-white rounded-md px-2.5 py-1 flex-shrink-0"
                    style={{ background: '#7B3FE4', fontFamily: 'Space Grotesk' }}
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
            <h3 className="font-nunito font-black text-white text-[15px]">Mes logements</h3>
          </div>

          {data?.properties && data.properties.length > 0 ? (
            <div className="space-y-3">
              {data.properties.map(property => {
                const isSolde = property.status === 'solde' || (property.amountPaid >= property.amountDue && property.amountDue > 0);
                const isRetard = property.status === 'retard';
                return (
                  <div
                    key={property.id}
                    className="rounded-[16px] px-4 py-4"
                    style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    {/* Top row: name + badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-nunito font-black text-white text-[15px] leading-tight truncate">
                          {property.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1">
                          <svg width="10" height="12" viewBox="0 0 24 24" fill="#E11D48" className="flex-shrink-0">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                          <p className="text-[11px] truncate" style={{ color: '#4A3D7A', fontFamily: 'Space Grotesk' }}>
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
                      <span style={{ color: isSolde ? '#4ADE80' : isRetard ? '#F87171' : '#A855F7' }}>
                        {new Intl.NumberFormat('fr-FR').format(property.amountPaid)} F reçus
                      </span>
                      <span style={{ color: '#4A3D7A' }}>
                        / {new Intl.NumberFormat('fr-FR').format(property.amountDue)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="rounded-[16px] p-8 text-center flex flex-col items-center"
              style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <span className="text-4xl mb-3">🏠</span>
              <p className="font-nunito font-bold text-white mb-1.5 text-sm">Aucun logement occupé pour l'instant</p>
              <p
                className="text-xs max-w-[240px] leading-relaxed mb-6"
                style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}
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
