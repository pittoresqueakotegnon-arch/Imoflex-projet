import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, MapPin, Building2, Home, Grid,
  ArrowRight, Bed, ChevronRight, Star, Shield, CreditCard,
  Users, CheckCircle2, Store, Phone, Zap
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useListings } from '../../hooks/useListings';
import { ListingSummary, PropertyType, supabase } from '../../lib/supabase';
import { formatMontant, getOptimizedUrl, propertyTypeLabel } from '../../lib/utils';

/* ─────────────────────────────────────────────────────────────
   WebHome — Page d'accueil web ImoFlex
   Hero + recherche rapide + catégories + annonces en grille
───────────────────────────────────────────────────────────── */

const PROPERTY_TYPES: { value: PropertyType; label: string; icon: React.ReactNode }[] = [
  { value: 'chambre',    label: 'Chambres',    icon: <Bed size={20} /> },
  { value: 'studio',    label: 'Studios',     icon: <Home size={20} /> },
  { value: 'appartement', label: 'Appartements', icon: <Building2 size={20} /> },
  { value: 'maison',    label: 'Maisons',     icon: <Home size={20} /> },
  { value: 'bureau',    label: 'Locaux comm.', icon: <Store size={20} /> },
  { value: 'parcelle',  label: 'Terrains',    icon: <Grid size={20} /> },
];

const STATS = [
  { icon: <Building2 size={22} />, value: '500+', label: 'Annonces actives' },
  { icon: <Users size={22} />,     value: '2 000+', label: 'Utilisateurs' },
  { icon: <Shield size={22} />,    value: '100%',  label: 'Paiements sécurisés' },
  { icon: <Star size={22} />,      value: '4.8/5', label: 'Note moyenne' },
];

const FEATURES = [
  {
    icon: <CreditCard size={28} />,
    color: '#7B3FE4',
    bg: '#F1EBFF',
    title: 'Paiement progressif',
    desc: 'Payez votre loyer en plusieurs fois grâce au paiement mobile Money.',
  },
  {
    icon: <Shield size={28} />,
    color: '#10B981',
    bg: '#ECFDF5',
    title: 'Sécurisé & fiable',
    desc: 'Contrats numériques signés, états des lieux PDF et historiques complets.',
  },
  {
    icon: <Zap size={28} />,
    color: '#F59E0B',
    bg: '#FFFBEB',
    title: 'Rapide & simple',
    desc: 'Publiez une annonce en 5 minutes. Recevez des demandes directement.',
  },
  {
    icon: <Phone size={28} />,
    color: '#3B82F6',
    bg: '#EFF6FF',
    title: 'Mobile & web',
    desc: 'Accédez à vos données depuis n\'importe quel appareil, partout.',
  },
];

function ListingCard({ listing }: { listing: ListingSummary }) {
  const cover = listing.listing_photos?.find(p => p.is_cover) || listing.listing_photos?.[0];
  const imgUrl = cover ? getOptimizedUrl(cover.photo_url, 'medium') : null;

  return (
    <Link
      to={`/web/annonce/${listing.id}`}
      className="group flex flex-col rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{
        background: 'var(--imx-surface)',
        border: '1px solid var(--imx-border)',
        boxShadow: 'var(--imx-card-shadow-sm)',
      }}
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden bg-[var(--imx-surface-2)]">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={listing.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={40} style={{ color: 'var(--imx-border)' }} />
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-3 left-3">
          <span
            className="px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={
              listing.availability_status === 'disponible'
                ? { background: '#10B981', color: '#fff' }
                : { background: 'rgba(0,0,0,0.5)', color: '#fff' }
            }
          >
            {listing.availability_status === 'disponible' ? 'Disponible' : 'Réservé'}
          </span>
        </div>
        {/* Progressive payment badge */}
        {listing.accepts_progressive_payment && (
          <div className="absolute top-3 right-3">
            <span
              className="px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1"
              style={{ background: 'var(--imx-accent)', color: '#fff' }}
            >
              <Zap size={11} /> Progressif
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3
            className="font-semibold text-[15px] leading-snug line-clamp-2 flex-1"
            style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}
          >
            {listing.title}
          </h3>
        </div>

        <div className="flex items-center gap-1 mb-3">
          <MapPin size={13} style={{ color: 'var(--imx-text-muted)' }} />
          <span className="text-[12px]" style={{ color: 'var(--imx-text-muted)' }}>
            {listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <span
            className="px-2 py-0.5 rounded-lg text-[11px] font-medium"
            style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)' }}
          >
            {propertyTypeLabel(listing.property_type ?? '')}
          </span>
          {listing.bedrooms && (
            <span className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--imx-text-secondary)' }}>
              <Bed size={12} /> {listing.bedrooms} ch.
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span
              className="text-[18px] font-bold"
              style={{ color: 'var(--imx-accent)', fontFamily: 'Sora' }}
            >
              {formatMontant(listing.monthly_rent)}
            </span>
            <span className="text-[11px] ml-1" style={{ color: 'var(--imx-text-muted)' }}>/mois</span>
          </div>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors group-hover:bg-[var(--imx-accent)] group-hover:text-white"
            style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)' }}
          >
            <ChevronRight size={16} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function WebHome() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});

  // Annonces récentes pour la section "À la une"
  const { listings, loading } = useListings({ availableOnly: true });
  const featuredListings = useMemo(() => listings.slice(0, 6), [listings]);

  // Charger les villes disponibles
  useEffect(() => {
    supabase
      .from('listings')
      .select('city')
      .eq('status', 'publiee')
      .then(({ data }) => {
        if (data) {
          const cities = [...new Set(data.map(d => d.city).filter(Boolean))].sort();
          setAvailableCities(cities);
        }
      });

    // Compter les annonces par type
    supabase
      .from('listings')
      .select('property_type')
      .eq('status', 'publiee')
      .then(({ data }) => {
        if (data) {
          const counts: Record<string, number> = {};
          data.forEach(d => {
            counts[d.property_type] = (counts[d.property_type] ?? 0) + 1;
          });
          setStats(counts);
        }
      });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedCity) params.set('city', selectedCity);
    navigate(`/web/annonces?${params.toString()}`);
  };

  const getDashboardPath = () => {
    if (role === 'locataire')    return '/web/dashboard';
    if (role === 'proprietaire') return '/web/pro/dashboard';
    if (role === 'agence')       return '/web/agence/dashboard';
    if (role === 'admin')        return '/admin';
    return null;
  };

  return (
    <div style={{ color: 'var(--imx-text-primary)' }}>

      {/* ════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden px-4 sm:px-8 lg:px-12 py-16 lg:py-24"
        style={{
          background: 'linear-gradient(135deg, #1A0A3B 0%, #2D1265 50%, #17132B 100%)',
        }}
      >
        {/* Background decoration */}
        <div
          className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-20 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, #7B3FE4 0%, transparent 70%)',
            transform: 'translate(30%, -30%)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, #A855F7 0%, transparent 70%)',
            transform: 'translate(-30%, 30%)',
          }}
        />

        <div className="relative max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full" style={{ background: 'rgba(123,63,228,0.3)', border: '1px solid rgba(123,63,228,0.5)' }}>
            <span className="w-2 h-2 rounded-full bg-[#A855F7] animate-pulse" />
            <span className="text-[13px] font-medium text-[#C084FC]">Trouvez votre logement idéal à Cotonou</span>
          </div>

          {/* Headline */}
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-black mb-5 leading-tight text-white"
            style={{ fontFamily: 'Sora' }}
          >
            Cherchez, Trouvez,
            <br />
            <span style={{ color: '#A855F7' }}>Payez votre loyer</span>
            <br />
            facilement.
          </h1>
          <p className="text-[16px] mb-10 max-w-xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            ImoFlex connecte locataires, propriétaires et agences. Paiement progressif Mobile Money,
            contrats numériques et états des lieux intégrés.
          </p>

          {/* Search form */}
          <form
            onSubmit={handleSearch}
            className="rounded-2xl p-2 flex flex-col sm:flex-row gap-2"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.15)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 flex-1 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <Search size={18} className="text-white opacity-60 flex-shrink-0" />
              <input
                type="text"
                placeholder="Quartier, titre, mot-clé…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none w-full text-sm text-white placeholder-white/50"
                style={{ fontFamily: 'Space Grotesk' }}
              />
            </div>

            {/* City select */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <MapPin size={16} className="text-white opacity-60 flex-shrink-0" />
              <select
                value={selectedCity}
                onChange={e => setSelectedCity(e.target.value)}
                className="bg-transparent outline-none text-sm text-white"
                style={{ fontFamily: 'Space Grotesk' }}
              >
                <option value="" style={{ color: '#17132B' }}>Toutes les villes</option>
                {availableCities.map(c => (
                  <option key={c} value={c} style={{ color: '#17132B' }}>{c}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}
            >
              <Search size={16} />
              Rechercher
            </button>
          </form>

          {/* Quick filters */}
          <div className="flex flex-wrap gap-2 mt-4">
            {PROPERTY_TYPES.slice(0, 4).map(pt => (
              <button
                key={pt.value}
                onClick={() => {
                  const params = new URLSearchParams({ types: pt.value });
                  navigate(`/web/annonces?${params.toString()}`);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                {pt.icon}
                {pt.label}
                {stats[pt.value] ? (
                  <span className="ml-1 opacity-60">({stats[pt.value]})</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          STATS
      ════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-8 lg:px-12 -mt-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl"
            style={{ background: 'var(--imx-surface)', boxShadow: 'var(--imx-card-shadow)', border: '1px solid var(--imx-border)' }}
          >
            {STATS.map((s, i) => (
              <div key={i} className="flex flex-col items-center text-center p-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}
                >
                  {s.icon}
                </div>
                <p className="text-xl font-black" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
                  {s.value}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--imx-text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          CTA si connecté → accès direct au dashboard
      ════════════════════════════════════════════════════════ */}
      {user && getDashboardPath() && (
        <section className="px-4 sm:px-8 lg:px-12 mt-8">
          <div className="max-w-4xl mx-auto">
            <div
              className="flex items-center justify-between p-4 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(123,63,228,0.12), rgba(168,85,247,0.08))',
                border: '1px solid rgba(123,63,228,0.2)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--imx-accent)', color: '#fff' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--imx-text-primary)' }}>
                    Vous êtes connecté
                  </p>
                  <p className="text-xs" style={{ color: 'var(--imx-text-muted)' }}>
                    Accédez directement à votre espace personnel
                  </p>
                </div>
              </div>
              <Link
                to={getDashboardPath()!}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: 'var(--imx-accent)' }}
              >
                Mon espace <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════
          CATÉGORIES
      ════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-8 lg:px-12 mt-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
                Parcourir par catégorie
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--imx-text-muted)' }}>
                Trouvez le type de logement qui vous convient
              </p>
            </div>
            <Link
              to="/web/annonces"
              className="flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: 'var(--imx-accent)' }}
            >
              Voir tout <ArrowRight size={15} />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {PROPERTY_TYPES.map(pt => (
              <Link
                key={pt.value}
                to={`/web/annonces?types=${pt.value}`}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl text-center transition-all duration-200 hover:-translate-y-1 group"
                style={{
                  background: 'var(--imx-surface)',
                  border: '1px solid var(--imx-border)',
                  boxShadow: 'var(--imx-card-shadow-sm)',
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors group-hover:bg-[var(--imx-accent)] group-hover:text-white"
                  style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}
                >
                  {pt.icon}
                </div>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--imx-text-primary)' }}>
                  {pt.label}
                </p>
                {stats[pt.value] ? (
                  <p className="text-[11px]" style={{ color: 'var(--imx-text-muted)' }}>
                    {stats[pt.value]} annonce{stats[pt.value] > 1 ? 's' : ''}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          ANNONCES RÉCENTES
      ════════════════════════════════════════════════════════ */}
      <section className="px-4 sm:px-8 lg:px-12 mt-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
                Annonces récentes
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--imx-text-muted)' }}>
                Logements disponibles mis à jour en temps réel
              </p>
            </div>
            <Link
              to="/web/annonces"
              className="flex items-center gap-1 text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: 'var(--imx-accent)' }}
            >
              Toutes les annonces <ArrowRight size={15} />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden animate-pulse" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
                  <div className="h-48" style={{ background: 'var(--imx-surface-2)' }} />
                  <div className="p-4 space-y-2">
                    <div className="h-4 rounded" style={{ background: 'var(--imx-surface-2)', width: '80%' }} />
                    <div className="h-3 rounded" style={{ background: 'var(--imx-surface-2)', width: '60%' }} />
                    <div className="h-5 rounded" style={{ background: 'var(--imx-surface-2)', width: '40%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : featuredListings.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--imx-text-muted)' }}>
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune annonce disponible pour le moment</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {featuredListings.map(listing => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}

          <div className="text-center mt-8">
            <Link
              to="/web/annonces"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 hover:-translate-y-0.5 text-white"
              style={{ background: 'var(--imx-accent)' }}
            >
              Voir toutes les annonces <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FONCTIONNALITÉS
      ════════════════════════════════════════════════════════ */}
      <section
        className="px-4 sm:px-8 lg:px-12 mt-16 py-16"
        style={{ background: 'var(--imx-surface)' }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2
              className="text-2xl lg:text-3xl font-black mb-3"
              style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}
            >
              Pourquoi choisir ImoFlex ?
            </h2>
            <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--imx-text-muted)' }}>
              Une plateforme complète pensée pour simplifier la vie des locataires, propriétaires et agences au Bénin.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="flex flex-col p-5 rounded-2xl transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: 'var(--imx-bg-app)',
                  border: '1px solid var(--imx-border)',
                }}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: f.bg, color: f.color }}
                >
                  {f.icon}
                </div>
                <h3
                  className="font-bold text-[15px] mb-2"
                  style={{ color: 'var(--imx-text-primary)', fontFamily: 'Space Grotesk' }}
                >
                  {f.title}
                </h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--imx-text-muted)' }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          CTA INSCRIPTION
      ════════════════════════════════════════════════════════ */}
      {!user && (
        <section className="px-4 sm:px-8 lg:px-12 mt-12 pb-16">
          <div className="max-w-4xl mx-auto">
            <div
              className="relative overflow-hidden rounded-3xl p-8 lg:p-12 text-center"
              style={{
                background: 'linear-gradient(135deg, #7B3FE4 0%, #A855F7 100%)',
              }}
            >
              <div
                className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 pointer-events-none"
                style={{ background: 'white', transform: 'translate(30%, -30%)' }}
              />
              <h2
                className="text-2xl lg:text-3xl font-black text-white mb-4"
                style={{ fontFamily: 'Sora' }}
              >
                Rejoignez ImoFlex aujourd'hui
              </h2>
              <p className="text-white/80 text-sm max-w-lg mx-auto mb-8">
                Locataire, propriétaire ou agence — créez votre compte gratuitement et profitez de toutes les fonctionnalités.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/web/register"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm text-[#7B3FE4] bg-white transition-all hover:scale-105"
                  style={{ fontFamily: 'Space Grotesk' }}
                >
                  Créer un compte gratuit
                </Link>
                <Link
                  to="/web/login"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-semibold text-sm text-white transition-all hover:bg-white/10"
                  style={{ border: '2px solid rgba(255,255,255,0.4)' }}
                >
                  Se connecter
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer minimal */}
      <footer
        className="px-4 sm:px-8 lg:px-12 py-8 mt-4"
        style={{ borderTop: '1px solid var(--imx-border)', background: 'var(--imx-surface)' }}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg overflow-hidden" style={{ background: '#F1EBFF' }}>
              <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-sm" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
              ImoFlex
            </span>
            <span className="text-xs" style={{ color: 'var(--imx-text-muted)' }}>
              · Plateforme immobilière au Bénin
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--imx-text-muted)' }}>
            <Link to="/cgu" className="hover:underline">CGU</Link>
            <Link to="/politique-confidentialite" className="hover:underline">Confidentialité</Link>
            <Link to="/aide" className="hover:underline">Aide</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
