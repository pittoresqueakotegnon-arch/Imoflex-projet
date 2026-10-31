import React, { useState, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, SlidersHorizontal, MapPin, Building2, Bed,
  X, Zap, Check,
  LayoutGrid, List as ListIcon
} from 'lucide-react';
import { useListings, ListingFilters } from '../../hooks/useListings';
import { ListingSummary, PropertyType } from '../../lib/supabase';
import { formatMontant, getOptimizedUrl, propertyTypeLabel } from '../../lib/utils';

/* ─────────────────────────────────────────────────────────────
   WebListings — Résultats de recherche desktop full-width
   Panneau de filtres à gauche + grille responsive à droite
───────────────────────────────────────────────────────────── */

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'chambre',    label: 'Chambre' },
  { value: 'studio',    label: 'Studio' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison',    label: 'Maison' },
  { value: 'bureau',    label: 'Local commercial' },
  { value: 'parcelle',  label: 'Terrain' },
];

const PRICE_RANGES = [
  { label: 'Moins de 50 000 F',    max: 50000 },
  { label: '50 000 – 100 000 F',   min: 50000, max: 100000 },
  { label: '100 000 – 200 000 F',  min: 100000, max: 200000 },
  { label: '200 000 – 500 000 F',  min: 200000, max: 500000 },
  { label: 'Plus de 500 000 F',    min: 500000 },
];

const BEDROOM_OPTIONS = [
  { label: 'Peu importe', value: 0 },
  { label: '1+', value: 1 },
  { label: '2+', value: 2 },
  { label: '3+', value: 3 },
  { label: '4+', value: 4 },
];

function ListingCard({ listing, viewMode }: { listing: ListingSummary; viewMode: 'grid' | 'list' }) {
  const cover = listing.listing_photos?.find(p => p.is_cover) || listing.listing_photos?.[0];
  const imgUrl = cover ? getOptimizedUrl(cover.photo_url, 'medium') : null;
  const isAvailable = listing.availability_status === 'disponible';

  if (viewMode === 'list') {
    return (
      <Link
        to={`/web/annonce/${listing.id}`}
        className="group flex gap-0 rounded-2xl overflow-hidden transition-all"
        style={{
          background: 'var(--imx-surface)',
          border: '1px solid var(--imx-border)',
          boxShadow: '0 1px 4px rgba(17,13,38,0.04)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(17,13,38,0.08)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(123,63,228,0.2)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(17,13,38,0.04)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-border)';
        }}
      >
        <div className="w-44 flex-shrink-0 relative overflow-hidden" style={{ background: 'var(--imx-surface-2)' }}>
          {imgUrl ? (
            <img src={imgUrl} alt={listing.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--imx-border)' }}>
              <Building2 size={28} strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3
                className="font-semibold text-sm leading-snug line-clamp-1 mb-1"
                style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
              >
                {listing.title}
              </h3>
              <div className="flex items-center gap-1.5">
                <MapPin size={11} style={{ color: 'var(--imx-text-muted)', flexShrink: 0 }} />
                <span className="text-xs truncate" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
                  {listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p
                className="text-lg font-black"
                style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif' }}
              >
                {formatMontant(listing.monthly_rent)}
              </p>
              <p className="text-xs" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>/mois</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span
              className="web-badge"
              style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)' }}
            >
              {propertyTypeLabel(listing.property_type ?? '')}
            </span>
            {listing.bedrooms != null && listing.bedrooms > 0 && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                <Bed size={11} /> {listing.bedrooms} ch.
              </span>
            )}
            {listing.accepts_progressive_payment && (
              <span className="web-badge web-badge-purple" style={{ gap: '4px' }}>
                <Zap size={10} /> Paiement échelonné
              </span>
            )}
            <span
              className="web-badge ml-auto"
              style={ isAvailable
                ? { background: '#ECFDF5', color: '#059669' }
                : { background: '#FFFBEB', color: '#D97706' }
              }
            >
              {isAvailable ? 'Disponible' : 'Réservé'}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  // Grid card
  return (
    <Link
      to={`/web/annonce/${listing.id}`}
      className="web-listing-card group"
    >
      {/* Photo */}
      <div className="web-listing-card-img" style={{ height: '200px', aspectRatio: 'unset' }}>
        {imgUrl ? (
          <img src={imgUrl} alt={listing.title} />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--imx-border)' }}>
            <Building2 size={36} strokeWidth={1.5} />
          </div>
        )}
        {/* Status badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{
              background: isAvailable ? 'rgba(5,150,105,0.9)' : 'rgba(217,119,6,0.9)',
              color: '#fff',
              backdropFilter: 'blur(4px)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {isAvailable ? 'Disponible' : 'Réservé'}
          </span>
        </div>
        {listing.accepts_progressive_payment && (
          <div className="absolute top-3 right-3">
            <span
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                background: 'rgba(123,63,228,0.9)',
                color: '#fff',
                backdropFilter: 'blur(4px)',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <Zap size={10} /> Échelonné
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p
              className="text-xl font-black leading-none"
              style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif' }}
            >
              {formatMontant(listing.monthly_rent)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>/ mois</p>
          </div>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
            style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', fontFamily: 'Inter, sans-serif' }}
          >
            {propertyTypeLabel(listing.property_type ?? '')}
          </span>
        </div>

        <h3
          className="text-sm font-semibold line-clamp-1 mb-1"
          style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
        >
          {listing.title}
        </h3>

        {listing.bedrooms != null && listing.bedrooms > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <Bed size={12} style={{ color: 'var(--imx-text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
              {listing.bedrooms} chambre{listing.bedrooms > 1 ? 's' : ''}
            </span>
          </div>
        )}

        <div
          className="flex items-center gap-1.5 mt-auto pt-3"
          style={{ borderTop: '1px solid var(--imx-border)' }}
        >
          <MapPin size={11} style={{ color: 'var(--imx-text-muted)', flexShrink: 0 }} />
          <span className="text-xs truncate" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Inter, sans-serif' }}>
            {listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function WebListings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [localSearch, setLocalSearch] = useState(searchParams.get('q') ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filters from URL
  const filterSearch    = searchParams.get('q') ?? '';
  const filterCity      = searchParams.get('city') ?? '';
  const filterTypesRaw  = searchParams.get('types') ?? '';
  const filterMinRent   = searchParams.get('min') ? Number(searchParams.get('min')) : undefined;
  const filterMaxRent   = searchParams.get('max') ? Number(searchParams.get('max')) : undefined;
  const filterBedrooms  = searchParams.get('beds') ? Number(searchParams.get('beds')) : undefined;
  const filterAvailOnly = searchParams.get('avail') === '1';
  const filterProgOnly  = searchParams.get('prog') === '1';

  const filterTypes = useMemo(() => (
    filterTypesRaw
      ? (filterTypesRaw.split(',').filter(Boolean) as PropertyType[])
      : []
  ), [filterTypesRaw]);

  const filters: ListingFilters = useMemo(() => ({
    search: filterSearch || undefined,
    city: filterCity || undefined,
    propertyTypes: filterTypes.length ? filterTypes : undefined,
    minRent: filterMinRent,
    maxRent: filterMaxRent,
    minBedrooms: filterBedrooms,
    availableOnly: filterAvailOnly || undefined,
    progressiveOnly: filterProgOnly || undefined,
  }), [filterSearch, filterCity, filterTypes, filterMinRent, filterMaxRent, filterBedrooms, filterAvailOnly, filterProgOnly]);

  const { listings, loading, loadingMore, hasMore, loadMore } = useListings(filters);

  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      return next;
    });
  }, [setSearchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setParam('q', localSearch);
  };

  const toggleType = (type: PropertyType) => {
    const current = filterTypes;
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setParam('types', updated.join(','));
  };

  const activeFiltersCount = [
    filterCity,
    filterTypes.length > 0,
    filterMinRent !== undefined,
    filterMaxRent !== undefined,
    filterBedrooms,
    filterAvailOnly,
    filterProgOnly,
  ].filter(Boolean).length;

  const clearAll = () => setSearchParams(new URLSearchParams());

  return (
    <div className="flex h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)] overflow-hidden w-full">

      {/* Backdrop for mobile drawer */}
      {showFilters && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setShowFilters(false)}
        />
      )}

      {/* ── Filter panel (fixed sidebar on desktop / drawer on mobile) ── */}
      <aside
        className={`
          ${showFilters
            ? 'fixed inset-y-0 left-0 z-50 w-80 shadow-2xl flex flex-col'
            : 'hidden lg:flex flex-col w-72 flex-shrink-0'} 
          h-full overflow-y-auto web-scrollbar
        `}
        style={{
          borderRight: '1px solid var(--imx-border)',
          background: 'var(--imx-surface)',
        }}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-[15px]" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora, sans-serif' }}>
              Filtres
            </h2>
            <div className="flex items-center gap-2">
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs font-medium transition-colors hover:underline"
                  style={{ color: 'var(--imx-accent)' }}
                >
                  Effacer ({activeFiltersCount})
                </button>
              )}
              <button
                className="lg:hidden p-1.5 rounded-lg"
                onClick={() => setShowFilters(false)}
                style={{ color: 'var(--imx-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Ville */}
          <div className="mb-6">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)' }}>
              Ville
            </label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--imx-text-muted)' }} />
              <input
                type="text"
                placeholder="Cotonou, Abomey-Calavi…"
                value={filterCity}
                onChange={e => setParam('city', e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
                style={{
                  background: 'var(--imx-surface-2)',
                  border: '1px solid var(--imx-border)',
                  color: 'var(--imx-text-primary)',
                }}
              />
            </div>
          </div>

          {/* Type de bien */}
          <div className="mb-6">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)' }}>
              Type de bien
            </label>
            <div className="space-y-1">
              {PROPERTY_TYPES.map(pt => (
                <button
                  key={pt.value}
                  onClick={() => toggleType(pt.value)}
                  className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm transition-colors"
                  style={
                    filterTypes.includes(pt.value)
                      ? { background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }
                      : { color: 'var(--imx-text-secondary)' }
                  }
                >
                  <span>{pt.label}</span>
                  {filterTypes.includes(pt.value) && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Fourchette de prix */}
          <div className="mb-6">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)' }}>
              Fourchette de prix
            </label>
            <div className="space-y-1">
              {PRICE_RANGES.map(r => {
                const active = filterMinRent === r.min && filterMaxRent === r.max;
                return (
                  <button
                    key={r.label}
                    onClick={() => {
                      if (active) {
                        setSearchParams(prev => {
                          const next = new URLSearchParams(prev);
                          next.delete('min'); next.delete('max');
                          return next;
                        });
                      } else {
                        setSearchParams(prev => {
                          const next = new URLSearchParams(prev);
                          if (r.min) next.set('min', String(r.min)); else next.delete('min');
                          if (r.max) next.set('max', String(r.max)); else next.delete('max');
                          return next;
                        });
                      }
                    }}
                    className="flex items-center justify-between w-full px-3 py-2 rounded-xl text-sm transition-colors"
                    style={
                      active
                        ? { background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }
                        : { color: 'var(--imx-text-secondary)' }
                    }
                  >
                    <span>{r.label}</span>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chambres */}
          <div className="mb-6">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)' }}>
              Chambres minimum
            </label>
            <div className="flex gap-2">
              {BEDROOM_OPTIONS.map(b => (
                <button
                  key={b.value}
                  onClick={() => setParam('beds', b.value > 0 ? String(b.value) : null)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium transition-colors"
                  style={
                    (filterBedrooms ?? 0) === b.value
                      ? { background: 'var(--imx-accent)', color: '#fff' }
                      : { background: 'var(--imx-surface-2)', color: 'var(--imx-text-secondary)', border: '1px solid var(--imx-border)' }
                  }
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--imx-text-muted)' }}>
              Options
            </label>
            <button
              onClick={() => setParam('avail', filterAvailOnly ? null : '1')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors"
              style={
                filterAvailOnly
                  ? { background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }
                  : { color: 'var(--imx-text-secondary)', border: '1px solid var(--imx-border)' }
              }
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: filterAvailOnly ? 'var(--imx-accent)' : 'var(--imx-surface-2)', border: filterAvailOnly ? 'none' : '1px solid var(--imx-border)' }}
              >
                {filterAvailOnly && <Check size={10} className="text-white" />}
              </div>
              Disponibles uniquement
            </button>
            <button
              onClick={() => setParam('prog', filterProgOnly ? null : '1')}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors"
              style={
                filterProgOnly
                  ? { background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }
                  : { color: 'var(--imx-text-secondary)', border: '1px solid var(--imx-border)' }
              }
            >
              <div
                className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: filterProgOnly ? 'var(--imx-accent)' : 'var(--imx-surface-2)', border: filterProgOnly ? 'none' : '1px solid var(--imx-border)' }}
              >
                {filterProgOnly && <Check size={10} className="text-white" />}
              </div>
              <Zap size={13} /> Paiement progressif
            </button>
          </div>
        </div>
      </aside>

      {/* ── Results area ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">

        {/* Toolbar */}
        <div
          className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--imx-border)', background: 'var(--imx-surface)' }}
        >
          {/* Toggle filter panel (mobile + tablet) */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors lg:hidden"
            style={{
              background: activeFiltersCount > 0 ? 'rgba(123,63,228,0.1)' : 'var(--imx-surface-2)',
              color: activeFiltersCount > 0 ? 'var(--imx-accent)' : 'var(--imx-text-secondary)',
              border: '1px solid var(--imx-border)',
            }}
          >
            <SlidersHorizontal size={15} />
            Filtres
            {activeFiltersCount > 0 && (
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: 'var(--imx-accent)' }}
              >
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex-1 relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--imx-text-muted)' }} />
            <input
              type="text"
              placeholder="Rechercher…"
              value={localSearch}
              onChange={e => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--imx-surface-2)',
                border: '1px solid var(--imx-border)',
                color: 'var(--imx-text-primary)',
              }}
            />
          </form>

          <div className="flex-1" />

          {/* Result count */}
          <span className="hidden sm:block text-sm" style={{ color: 'var(--imx-text-muted)' }}>
            {loading ? '…' : `${listings.length} résultat${listings.length > 1 ? 's' : ''}`}
          </span>

          {/* View mode toggle */}
          <div
            className="flex rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--imx-border)' }}
          >
            <button
              onClick={() => setViewMode('grid')}
              className="p-2 transition-colors"
              style={{
                background: viewMode === 'grid' ? 'var(--imx-accent)' : 'var(--imx-surface-2)',
                color: viewMode === 'grid' ? '#fff' : 'var(--imx-text-secondary)',
              }}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="p-2 transition-colors"
              style={{
                background: viewMode === 'list' ? 'var(--imx-accent)' : 'var(--imx-surface-2)',
                color: viewMode === 'list' ? '#fff' : 'var(--imx-text-secondary)',
              }}
            >
              <ListIcon size={15} />
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-2 px-5 py-2 flex-wrap" style={{ borderBottom: '1px solid var(--imx-border)', background: 'var(--imx-bg-app)' }}>
            {filterCity && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }}>
                <MapPin size={11} /> {filterCity}
                <button onClick={() => setParam('city', null)}><X size={11} /></button>
              </span>
            )}
            {filterTypes.map(t => (
              <span key={t} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }}>
                {propertyTypeLabel(t)}
                <button onClick={() => toggleType(t)}><X size={11} /></button>
              </span>
            ))}
            {(filterMinRent || filterMaxRent) && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }}>
                {filterMinRent ? `${formatMontant(filterMinRent)}` : '0'} – {filterMaxRent ? formatMontant(filterMaxRent) : '∞'}
                <button onClick={() => setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('min'); n.delete('max'); return n; })}><X size={11} /></button>
              </span>
            )}
            {filterAvailOnly && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>
                Disponibles
                <button onClick={() => setParam('avail', null)}><X size={11} /></button>
              </span>
            )}
            {filterProgOnly && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(123,63,228,0.1)', color: 'var(--imx-accent)' }}>
                <Zap size={10} /> Progressif
                <button onClick={() => setParam('prog', null)}><X size={11} /></button>
              </span>
            )}
            <button
              onClick={clearAll}
              className="text-xs font-medium transition-colors hover:underline ml-1"
              style={{ color: 'var(--imx-text-muted)' }}
            >
              Tout effacer
            </button>
          </div>
        )}

        {/* Grid / List */}
        <div className="flex-1 overflow-y-auto web-scrollbar p-5">
          {loading ? (
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
              : 'flex flex-col gap-3'
            }>
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl overflow-hidden"
                  style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
                >
                  <div className="h-44" style={{ background: 'var(--imx-surface-2)' }} />
                  <div className="p-3 space-y-2">
                    <div className="h-3 rounded" style={{ background: 'var(--imx-surface-2)', width: '75%' }} />
                    <div className="h-3 rounded" style={{ background: 'var(--imx-surface-2)', width: '55%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: 'var(--imx-surface-2)' }}
              >
                <Search size={28} style={{ color: 'var(--imx-text-muted)' }} />
              </div>
              <p className="font-semibold text-sm mb-1" style={{ color: 'var(--imx-text-primary)' }}>
                Aucune annonce trouvée
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--imx-text-muted)' }}>
                Essayez d'ajuster vos filtres ou élargissez votre recherche.
              </p>
              <button
                onClick={clearAll}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: 'var(--imx-accent)' }}
              >
                Effacer les filtres
              </button>
            </div>
          ) : (
            <>
              <div className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'
                  : 'flex flex-col gap-3'
              }>
                {listings.map(listing => (
                  <ListingCard key={listing.id} listing={listing} viewMode={viewMode} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-8 py-3 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 text-white"
                    style={{ background: 'var(--imx-accent)', opacity: loadingMore ? 0.7 : 1 }}
                  >
                    {loadingMore ? 'Chargement…' : 'Voir plus d\'annonces'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
