import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, MapPin, Building2, ArrowRight, ChevronDown,
  Shield, Zap, Users, Star, Home,
  CheckCircle, CreditCard, FileText
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, ListingSummary } from '../../lib/supabase';
import { formatMontant, getOptimizedUrl, propertyTypeLabel } from '../../lib/utils';

/* ──────────────────────────────────────────────────────────────
   WebHome v2 — Accueil web ImoFlex premium
   Hero puissant + recherche + annonces récentes + sections
────────────────────────────────────────────────────────────── */

const PROPERTY_TYPES = [
  { value: 'all', label: 'Tous types' },
  { value: 'chambre', label: 'Chambre' },
  { value: 'studio', label: 'Studio' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison', label: 'Maison' },
  { value: 'bureau', label: 'Local commercial' },
  { value: 'parcelle', label: 'Terrain' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    icon: Search,
    title: 'Explorez',
    desc: 'Parcourez des centaines d\'annonces sans créer de compte. Filtrez par ville, type et budget.',
    color: '#7B3FE4',
    bg: '#F5F3FF',
  },
  {
    step: '02',
    icon: MessageIcon,
    title: 'Candidatez',
    desc: 'Envoyez votre demande directement depuis l\'annonce. Le propriétaire vous répond.',
    color: '#2563EB',
    bg: '#EFF6FF',
  },
  {
    step: '03',
    icon: FileText,
    title: 'Signez',
    desc: 'Bail, état des lieux et documents gérés en ligne, en toute sécurité.',
    color: '#059669',
    bg: '#ECFDF5',
  },
  {
    step: '04',
    icon: CreditCard,
    title: 'Payez',
    desc: 'Loyers via Mobile Money, paiement échelonné possible, reçus automatiques.',
    color: '#D97706',
    bg: '#FFFBEB',
  },
];

function MessageIcon(props: React.SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  const s = props.size ?? 24;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={props.strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

const TRUST_ITEMS = [
  { icon: Shield, label: 'Propriétaires vérifiés', desc: 'Badges uniquement pour les biens authentifiés', color: '#059669' },
  { icon: Zap, label: 'Loyers sécurisés', desc: 'Paiements via Mobile Money, traçés et confirmés', color: '#7B3FE4' },
  { icon: Users, label: 'Communauté active', desc: 'Locataires, propriétaires et agences réunis', color: '#2563EB' },
  { icon: Star, label: 'Support dédié', desc: 'Une équipe disponible pour vous accompagner', color: '#D97706' },
];

export default function WebHome() {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [maxBudget, setMaxBudget] = useState('');

  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('listings')
      .select('id, title, city, neighborhood, monthly_rent, bedrooms, property_type, availability_status, status, created_at, accepts_progressive_payment, listing_photos(id, photo_url, is_cover)')
      .eq('status', 'publiee')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (!error && data) setListings(data as any[]);
        setLoading(false);
      });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedType && selectedType !== 'all') params.set('types', selectedType);
    if (maxBudget.trim()) {
      const clean = maxBudget.replace(/\D/g, '');
      if (clean) params.set('maxPrice', clean);
    }
    navigate(`/web/annonces?${params.toString()}`);
  };

  return (
    <div className="web-page web-fade-in" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* ══════════════════════════════════════════════════════
          HERO SECTION
      ══════════════════════════════════════════════════════ */}
      <section
        className="web-hero-gradient pt-12 pb-16 px-4 sm:px-6 lg:px-8"
        style={{ borderBottom: '1px solid var(--imx-border)' }}
      >
        <div className="max-w-7xl mx-auto">

          {/* Tag */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-6 text-xs font-semibold"
            style={{ background: 'rgba(123, 63, 228, 0.08)', color: 'var(--imx-accent)', border: '1px solid rgba(123, 63, 228, 0.15)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--imx-accent)' }} />
            Bénin · Location immobilière simplifiée
          </div>

          {/* Title + subtitle */}
          <div className="max-w-4xl mb-10">
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] mb-5"
              style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
            >
              Trouvez, louez et gérez{' '}
              <span style={{ color: 'var(--imx-accent)' }}>en toute confiance.</span>
            </h1>
            <p
              className="text-lg leading-relaxed max-w-2xl"
              style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
            >
              Locataires, propriétaires et agences réunis au même endroit : de la recherche du logement
              au suivi du loyer, en passant par le bail et les paiements.
            </p>
          </div>

          {/* Search card */}
          <div
            className="rounded-2xl p-5 max-w-5xl"
            style={{
              background: 'var(--imx-surface)',
              border: '1px solid var(--imx-border)',
              boxShadow: '0 4px 24px rgba(17, 13, 38, 0.06), 0 1px 4px rgba(17, 13, 38, 0.04)',
            }}
          >
            <form onSubmit={handleSearch}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">

                {/* Localisation */}
                <div className="md:col-span-5">
                  <label
                    className="block mb-1.5 text-xs font-semibold"
                    style={{ color: 'var(--imx-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}
                  >
                    Localisation
                  </label>
                  <div
                    className="flex items-center gap-2.5 px-3.5 rounded-xl transition-colors"
                    style={{
                      border: '1.5px solid var(--imx-border)',
                      background: 'var(--imx-surface-2)',
                      height: '44px',
                    }}
                    onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-accent)'; (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface)'; }}
                    onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)'; }}
                  >
                    <MapPin size={15} style={{ color: 'var(--imx-text-muted)', flexShrink: 0 }} />
                    <input
                      type="text"
                      placeholder="Ville ou quartier…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-sm focus:outline-none"
                      style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
                    />
                  </div>
                </div>

                {/* Type */}
                <div className="md:col-span-3">
                  <label
                    className="block mb-1.5 text-xs font-semibold"
                    style={{ color: 'var(--imx-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}
                  >
                    Type de bien
                  </label>
                  <div className="relative">
                    <select
                      value={selectedType}
                      onChange={e => setSelectedType(e.target.value)}
                      className="appearance-none w-full px-3.5 pr-9 rounded-xl text-sm transition-colors focus:outline-none cursor-pointer"
                      style={{
                        border: '1.5px solid var(--imx-border)',
                        background: 'var(--imx-surface-2)',
                        color: 'var(--imx-text-primary)',
                        height: '44px',
                        fontFamily: 'Inter, sans-serif',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'var(--imx-accent)'; e.currentTarget.style.background = 'var(--imx-surface)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = 'var(--imx-border)'; e.currentTarget.style.background = 'var(--imx-surface-2)'; }}
                    >
                      {PROPERTY_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--imx-text-muted)' }} />
                  </div>
                </div>

                {/* Budget */}
                <div className="md:col-span-2">
                  <label
                    className="block mb-1.5 text-xs font-semibold"
                    style={{ color: 'var(--imx-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif' }}
                  >
                    Budget max
                  </label>
                  <input
                    type="text"
                    placeholder="FCFA"
                    value={maxBudget}
                    onChange={e => setMaxBudget(e.target.value)}
                    className="w-full px-3.5 rounded-xl text-sm transition-colors focus:outline-none"
                    style={{
                      border: '1.5px solid var(--imx-border)',
                      background: 'var(--imx-surface-2)',
                      color: 'var(--imx-text-primary)',
                      height: '44px',
                      fontFamily: 'Inter, sans-serif',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--imx-accent)'; e.currentTarget.style.background = 'var(--imx-surface)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--imx-border)'; e.currentTarget.style.background = 'var(--imx-surface-2)'; }}
                  />
                </div>

                {/* Button */}
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="web-btn web-btn-primary w-full"
                    style={{ height: '44px', borderRadius: '12px' }}
                  >
                    <Search size={15} />
                    Rechercher
                  </button>
                </div>
              </div>
            </form>

            {/* Quick filters */}
            <div className="flex flex-wrap gap-2 mt-3.5 pt-3.5" style={{ borderTop: '1px solid var(--imx-border)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
                Tendances :
              </span>
              {[
                { label: 'Cotonou', q: 'Cotonou' },
                { label: 'Calavi', q: 'Calavi' },
                { label: 'Porto-Novo', q: 'Porto-Novo' },
                { label: 'Studio', types: 'studio' },
                { label: 'Appartement', types: 'appartement' },
              ].map(item => (
                <Link
                  key={item.label}
                  to={`/web/annonces?${item.q ? `q=${item.q}` : `types=${item.types}`}`}
                  className="text-xs px-3 py-1.5 rounded-full transition-colors font-medium"
                  style={{
                    background: 'var(--imx-surface-2)',
                    color: 'var(--imx-text-secondary)',
                    border: '1px solid var(--imx-border)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(123, 63, 228, 0.06)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(123, 63, 228, 0.2)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--imx-accent)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-border)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--imx-text-secondary)';
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          ANNONCES RÉCENTES
      ══════════════════════════════════════════════════════ */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">

          {/* Section header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'var(--imx-accent)', fontFamily: 'Inter, sans-serif' }}
              >
                Annonces récentes
              </p>
              <h2
                className="text-2xl sm:text-3xl font-black tracking-tight"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Logements à découvrir
              </h2>
            </div>
            <Link
              to="/web/annonces"
              className="hidden sm:flex items-center gap-1.5 text-sm font-semibold transition-colors group"
              style={{ color: 'var(--imx-accent)', fontFamily: 'Inter, sans-serif' }}
            >
              Toutes les annonces
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="web-card overflow-hidden">
                  <div className="web-skeleton" style={{ height: '220px' }} />
                  <div className="p-5 space-y-3">
                    <div className="web-skeleton h-5 w-1/2" />
                    <div className="web-skeleton h-4 w-3/4" />
                    <div className="web-skeleton h-4 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.slice(0, 6).map(item => {
                const cover = item.listing_photos?.find(p => p.is_cover) || item.listing_photos?.[0];
                const imgUrl = cover ? getOptimizedUrl(cover.photo_url, 'medium') : null;
                return (
                  <Link
                    key={item.id}
                    to={`/web/annonce/${item.id}`}
                    className="web-listing-card group"
                  >
                    {/* Photo */}
                    <div className="web-listing-card-img" style={{ height: '220px', aspectRatio: 'unset' }}>
                      {imgUrl ? (
                        <img src={imgUrl} alt={item.title} />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ color: 'var(--imx-border)' }}
                        >
                          <Building2 size={40} strokeWidth={1.5} />
                        </div>
                      )}
                      {/* Status overlay */}
                      <div className="absolute top-3 left-3 flex gap-2">
                        <span
                          className="text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{
                            background: item.availability_status === 'disponible' ? 'rgba(5, 150, 105, 0.9)' : 'rgba(217, 119, 6, 0.9)',
                            color: '#fff',
                            backdropFilter: 'blur(4px)',
                          }}
                        >
                          {item.availability_status === 'disponible' ? 'Disponible' : 'Réservé'}
                        </span>
                        {item.accepts_progressive_payment && (
                          <span
                            className="text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{
                              background: 'rgba(123, 63, 228, 0.9)',
                              color: '#fff',
                              backdropFilter: 'blur(4px)',
                            }}
                          >
                            Échelonné
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p
                            className="text-xl font-black leading-none"
                            style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif' }}
                          >
                            {formatMontant(item.monthly_rent)}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
                            par mois
                          </p>
                        </div>
                        <span
                          className="text-xs px-2.5 py-1 rounded-full font-medium"
                          style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
                        >
                          {propertyTypeLabel(item.property_type ?? '')}
                        </span>
                      </div>

                      <h3
                        className="text-sm font-semibold line-clamp-1 mb-1"
                        style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
                      >
                        {item.title}
                      </h3>

                      <div className="flex items-center gap-1.5 mt-auto pt-3" style={{ borderTop: '1px solid var(--imx-border)' }}>
                        <MapPin size={12} style={{ color: 'var(--imx-text-muted)', flexShrink: 0 }} />
                        <span className="text-xs truncate" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
                          {item.neighborhood ? `${item.neighborhood}, ` : ''}{item.city}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="web-empty web-card py-20">
              <div className="web-empty-icon">
                <Building2 size={28} />
              </div>
              <p className="web-title text-lg">Aucune annonce disponible</p>
              <p className="web-subtitle text-sm">Les premières annonces seront bientôt publiées.</p>
            </div>
          )}

          <div className="text-center mt-8 sm:hidden">
            <Link
              to="/web/annonces"
              className="web-btn web-btn-primary inline-flex"
            >
              Voir toutes les annonces
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          COMMENT ÇA MARCHE
      ══════════════════════════════════════════════════════ */}
      <section
        className="py-14 px-4 sm:px-6 lg:px-8"
        style={{ background: 'var(--imx-surface)', borderTop: '1px solid var(--imx-border)', borderBottom: '1px solid var(--imx-border)' }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--imx-accent)', fontFamily: 'Inter, sans-serif' }}
            >
              Simple et rapide
            </p>
            <h2
              className="text-2xl sm:text-3xl font-black tracking-tight"
              style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
            >
              Comment ça marche ?
            </h2>
            <p
              className="text-base mt-3 max-w-xl mx-auto"
              style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
            >
              De la découverte du bien à la gestion quotidienne de la location, ImoFlex vous accompagne à chaque étape.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className="web-card-elevated p-6 flex flex-col gap-4 relative overflow-hidden"
                >
                  {/* Step number background */}
                  <span
                    className="absolute top-4 right-5 font-black text-5xl"
                    style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-border)', opacity: 0.5, lineHeight: 1 }}
                  >
                    {item.step}
                  </span>

                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: item.bg, color: item.color }}
                  >
                    <Icon size={22} strokeWidth={2} />
                  </div>

                  <div>
                    <h3
                      className="text-base font-bold mb-2"
                      style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
                    >
                      {item.title}
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
                    >
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          POUR QUI
      ══════════════════════════════════════════════════════ */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'var(--imx-accent)', fontFamily: 'Inter, sans-serif' }}
            >
              Une plateforme pour tous
            </p>
            <h2
              className="text-2xl sm:text-3xl font-black tracking-tight"
              style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
            >
              ImoFlex s'adapte à vous
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Locataires */}
            <div
              className="web-card-elevated p-7 flex flex-col group cursor-pointer"
              style={{ borderTop: '3px solid #2563EB' }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: '#EFF6FF', color: '#2563EB' }}
              >
                <Home size={20} strokeWidth={2} />
              </div>
              <h3
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Locataires
              </h3>
              <p
                className="text-sm leading-relaxed flex-1"
                style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
              >
                Cherchez par ville, type et budget. Candidatez, suivez votre dossier et payez votre loyer en quelques clics.
              </p>
              <ul className="mt-5 space-y-2">
                {['Recherche avancée', 'Suivi des candidatures', 'Paiements mobiles', 'Reçus automatiques'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                    <CheckCircle size={13} style={{ color: '#2563EB', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--imx-border)' }}>
                <Link
                  to="/web/annonces"
                  className="flex items-center gap-1.5 text-sm font-semibold transition-colors group"
                  style={{ color: '#2563EB', fontFamily: 'Inter, sans-serif' }}
                >
                  Explorer les offres
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Propriétaires */}
            <div
              className="web-card-elevated p-7 flex flex-col"
              style={{ borderTop: '3px solid #7B3FE4' }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: '#F5F3FF', color: '#7B3FE4' }}
              >
                <Building2 size={20} strokeWidth={2} />
              </div>
              <h3
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Propriétaires
              </h3>
              <p
                className="text-sm leading-relaxed flex-1"
                style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
              >
                Publiez vos biens en quelques minutes, gérez les demandes et suivez vos loyers depuis un tableau de bord clair.
              </p>
              <ul className="mt-5 space-y-2">
                {['Publication simple', 'Gestion des demandes', 'Wallet & retraits', 'Vérification officielle'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                    <CheckCircle size={13} style={{ color: '#7B3FE4', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--imx-border)' }}>
                <Link
                  to={user && (role === 'proprietaire' || role === 'agence') ? '/web/pro/publier' : '/web/register?role=proprietaire'}
                  className="flex items-center gap-1.5 text-sm font-semibold transition-colors group"
                  style={{ color: '#7B3FE4', fontFamily: 'Inter, sans-serif' }}
                >
                  Publier un bien
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Agences */}
            <div
              className="web-card-elevated p-7 flex flex-col"
              style={{ borderTop: '3px solid #059669' }}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: '#ECFDF5', color: '#059669' }}
              >
                <Users size={20} strokeWidth={2} />
              </div>
              <h3
                className="text-xl font-bold mb-3"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
              >
                Agences immobilières
              </h3>
              <p
                className="text-sm leading-relaxed flex-1"
                style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
              >
                Gérez un portefeuille de mandats, traitez les candidatures et présentez votre agence professionnellement.
              </p>
              <ul className="mt-5 space-y-2">
                {['Portefeuille de mandats', 'Profil agence public', 'Gestion multi-biens', 'Tableau de bord dédié'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                    <CheckCircle size={13} style={{ color: '#059669', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--imx-border)' }}>
                <Link
                  to={user && role === 'agence' ? '/web/agence/dashboard' : '/web/register?role=agence'}
                  className="flex items-center gap-1.5 text-sm font-semibold transition-colors group"
                  style={{ color: '#059669', fontFamily: 'Inter, sans-serif' }}
                >
                  Espace agence
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CONFIANCE
      ══════════════════════════════════════════════════════ */}
      <section
        className="py-14 px-4 sm:px-6 lg:px-8"
        style={{ background: 'var(--imx-surface)', borderTop: '1px solid var(--imx-border)' }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            {/* Left */}
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-3"
                style={{ color: 'var(--imx-accent)', fontFamily: 'Inter, sans-serif' }}
              >
                Transparence & sécurité
              </p>
              <h2
                className="text-2xl sm:text-3xl font-black tracking-tight mb-5"
                style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)', lineHeight: 1.2 }}
              >
                Une confiance qui se voit, uniquement quand elle est réelle.
              </h2>
              <p
                className="text-base leading-relaxed mb-8"
                style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
              >
                Les badges de vérification n'apparaissent que pour les biens et propriétaires réellement authentifiés.
                Chez ImoFlex, rien n'est simulé.
              </p>
              <div className="flex gap-3">
                <Link
                  to="/web/annonces"
                  className="web-btn web-btn-primary"
                >
                  <Search size={15} />
                  Explorer les annonces
                </Link>
                <Link
                  to="/web/aide"
                  className="web-btn web-btn-ghost"
                >
                  En savoir plus
                </Link>
              </div>
            </div>

            {/* Right */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TRUST_ITEMS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={i}
                    className="web-card p-5"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                      style={{ background: `${item.color}10`, color: item.color }}
                    >
                      <Icon size={18} strokeWidth={2} />
                    </div>
                    <h4
                      className="font-semibold text-sm mb-1"
                      style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
                    >
                      {item.label}
                    </h4>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}
                    >
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CTA FINAL
      ══════════════════════════════════════════════════════ */}
      <section className="py-14 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div
            className="rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1A0A3B 0%, #2D1265 60%, #17132B 100%)',
            }}
          >
            {/* Background decoration */}
            <div
              className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-15 pointer-events-none"
              style={{ background: 'radial-gradient(circle, #A855F7, transparent 70%)', transform: 'translate(40%, -40%)' }}
            />
            <div
              className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, #7B3FE4, transparent 70%)', transform: 'translate(-30%, 30%)' }}
            />

            <div className="relative">
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: '#A855F7', fontFamily: 'Inter, sans-serif' }}
              >
                Commencez maintenant
              </p>
              <h2
                className="text-3xl sm:text-4xl font-black text-white mb-4"
                style={{ fontFamily: 'Sora, sans-serif', lineHeight: 1.15 }}
              >
                Prêt à trouver votre{' '}
                <span style={{ color: '#A855F7' }}>prochain logement ?</span>
              </h2>
              <p
                className="text-base text-white/70 max-w-xl mx-auto mb-8"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                Rejoignez ImoFlex et accédez à des centaines de logements vérifiés au Bénin.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/web/annonces"
                  className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm text-white transition-all"
                  style={{
                    background: 'var(--imx-accent)',
                    boxShadow: '0 4px 20px rgba(123, 63, 228, 0.4)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#6A35C7'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--imx-accent)'; }}
                >
                  <Search size={15} />
                  Explorer les annonces
                </Link>
                {!user && (
                  <Link
                    to="/web/register"
                    className="flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      border: '1.5px solid rgba(255,255,255,0.2)',
                      fontFamily: 'Inter, sans-serif',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)'; }}
                  >
                    Créer un compte gratuit
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
