import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Bell, SlidersHorizontal, MapPin, Building2, Home, Grid, ChevronRight, User, ChevronDown, Heart, Store, Bed, Plus, ShieldCheck, X, Check, Tag } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useListings } from '../../hooks/useListings';
import { useAuthGate } from '../../hooks/useAuthGate';
import { AuthGateModal } from '../../components/AuthGateModal';
import BottomNav from '../../components/BottomNav';
import { HeaderSupport } from '../../components/HeaderSupport';
import EmptyState from '../../components/EmptyState';
import { SplashScreen } from '../../components/SplashScreen';
import { PullToRefresh } from '../../components/PullToRefresh';
import { ListingCardSkeleton } from '../../components/Skeleton';
import { supabase, PropertyType } from '../../lib/supabase';
import { formatMontant } from '../../lib/utils';
import { OptimizedImage } from '../../components/OptimizedImage';
import { useToast } from '../../components/Toast';
import { haptics } from '../../lib/haptics';

const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: 'chambre', label: 'Chambre' },
  { value: 'studio', label: 'Studio' },
  { value: 'appartement', label: 'Appartement' },
  { value: 'maison', label: 'Maison' },
  { value: 'bureau', label: 'Local commercial' },
  { value: 'parcelle', label: 'Terrain' },
];

const PRICE_OPTIONS = [50000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000];

const PROPERTY_TYPES_QUICK = [
  { id: 'a_louer', label: 'À louer', icon: <Home size={15} /> },
  { id: 'a_vendre', label: 'À vendre', icon: <Tag size={15} /> },
  { id: 'appartement', label: 'Appartement', icon: <Building2 size={15} /> },
  { id: 'maison', label: 'Maison', icon: <Home size={15} /> },
  { id: 'parcelle', label: 'Terrain', icon: <Grid size={15} /> },
  { id: 'filtres', label: 'Filtres', icon: <SlidersHorizontal size={15} /> },
];

const EXPLORE_CATEGORIES_BASE = [
  { id: 'maison', label: 'Maisons', icon: <Home size={30} className="text-[#7B3FE4]" />, bg: 'bg-[#F5F3FF]' },
  { id: 'appartement', label: 'Appartements', icon: <Building2 size={30} className="text-[#3B82F6]" />, bg: 'bg-[#EFF6FF]' },
  { id: 'parcelle', label: 'Terrains', icon: <Grid size={30} className="text-[#10B981]" />, bg: 'bg-[#ECFDF5]' },
  { id: 'bureau', label: 'Locaux commerciaux', icon: <Store size={30} className="text-[#F59E0B]" />, bg: 'bg-[#FFFBEB]' },
];

const Backdrop: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
);

const Marketplace: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, role } = useAuth();
  const { isModalOpen, closeModal, modalReason } = useAuthGate();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('a_louer');
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('hasSeenSplash'));
  const [favorites, setFavorites] = useState<string[]>([]);

  // Drawers
  const [showCityDrawer, setShowCityDrawer] = useState(false);
  const [showTypeDrawer, setShowTypeDrawer] = useState(false);
  const [showPriceDrawer, setShowPriceDrawer] = useState(false);
  const [selectedCityInDrawer, setSelectedCityInDrawer] = useState<string | null>(null);

  // Dynamic data
  const [availableCities, setAvailableCities] = useState<{ city: string; neighborhoods: string[] }[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [citiesLoading, setCitiesLoading] = useState(false);

  // CTA Banner
  const [showCtaBanner, setShowCtaBanner] = useState(() => !sessionStorage.getItem('ctaBannerDismissed'));

  // Read filter state from URL
  const filterCity = searchParams.get('city');
  const filterNeighborhood = searchParams.get('neighborhood');
  const filterTypes = useMemo(() =>
    searchParams.get('types')?.split(',').filter(Boolean) as PropertyType[] || [],
    [searchParams]
  );
  const filterMaxRent = searchParams.get('maxRent') ? parseInt(searchParams.get('maxRent')!) : null;
  const filterMinRent = searchParams.get('minRent') ? parseInt(searchParams.get('minRent')!) : undefined;
  const filterBedrooms = searchParams.get('bedrooms') ? parseInt(searchParams.get('bedrooms')!) : undefined;
  const filterAvailable = searchParams.get('available') === 'true';
  const filterProgressive = searchParams.get('progressive') === 'true';

  const applyQuickFilter = (key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (value) p.set(key, value);
    else p.delete(key);
    setSearchParams(p);
  };

  // Fetch cities & neighborhoods
  useEffect(() => {
    const fetchCities = async () => {
      setCitiesLoading(true);
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('city, neighborhood')
          .eq('status', 'publiee')
          .not('city', 'is', null);
        if (!error && data) {
          const cityMap: Record<string, Set<string>> = {};
          data.forEach(({ city, neighborhood }) => {
            if (!city) return;
            const c = city.trim();
            if (!cityMap[c]) cityMap[c] = new Set();
            if (neighborhood?.trim()) cityMap[c].add(neighborhood.trim());
          });
          const cities = Object.entries(cityMap)
            .map(([city, neighborhoods]) => ({ city, neighborhoods: Array.from(neighborhoods).sort() }))
            .sort((a, b) => a.city.localeCompare(b.city));
          setAvailableCities(cities);
        }
      } catch (err) { console.warn('Could not fetch cities:', err); }
      finally { setCitiesLoading(false); }
    };
    fetchCities();
  }, []);

  // Fetch category counts
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const types = ['maison', 'appartement', 'parcelle', 'bureau'];
        const counts: Record<string, number> = { maison: 0, appartement: 0, parcelle: 0, bureau: 0 };
        await Promise.all(types.map(async (type) => {
          const { count, error } = await supabase
            .from('listings')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'publiee')
            .eq('property_type', type);
          if (!error && count !== null) counts[type] = count;
        }));
        setCategoryCounts(counts);
      } catch (err) { console.warn('Could not fetch counts:', err); }
    };
    fetchCounts();
  }, []);

  // Favorites
  useEffect(() => {
    const loadFavs = async () => {
      if (user) {
        const { data } = await supabase.from('favorites').select('listing_id').eq('user_id', user.id);
        if (data) setFavorites(data.map(f => f.listing_id));
      } else {
        const stored = localStorage.getItem('favorites');
        setFavorites(stored ? JSON.parse(stored) : []);
      }
    };
    loadFavs();
  }, [user]);

  const handleToggleFavorite = async (listingId: string, e: React.MouseEvent) => {
    e.preventDefault();
    haptics.light();
    const wasFav = favorites.includes(listingId);
    const next = wasFav ? favorites.filter(id => id !== listingId) : [...favorites, listingId];
    setFavorites(next);
    if (!user?.id) { localStorage.setItem('favorites', JSON.stringify(next)); return; }
    try {
      if (wasFav) await supabase.from('favorites').delete().eq('user_id', user.id).eq('listing_id', listingId);
      else await supabase.from('favorites').upsert({ user_id: user.id, listing_id: listingId }, { onConflict: 'user_id,listing_id', ignoreDuplicates: true });
    } catch { setFavorites(favorites); }
  };

  const activePropertyType = filterTypes[0] || (
    ['appartement', 'maison', 'parcelle', 'bureau', 'chambre', 'studio'].includes(selectedType)
      ? selectedType as PropertyType
      : null
  );

  const { listings, loading, loadingMore, hasMore, refetch, loadMore } = useListings({
    search: searchQuery,
    propertyTypes: activePropertyType ? [activePropertyType] : undefined,
    city: filterCity ?? undefined,
    minRent: filterMinRent,
    maxRent: filterMaxRent ?? undefined,
    minBedrooms: filterBedrooms,
    availableOnly: filterAvailable,
    progressiveOnly: filterProgressive,
  });

  const sortedListings = useMemo(() =>
    [...listings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [listings]
  );
  const horizontalListings = sortedListings.slice(0, 5);
  const verticalListings = sortedListings.slice(5);

  const handleCtaPublish = () => {
    haptics.medium();
    if (role === 'proprietaire') navigate('/pro/publier');
    else if (role === 'locataire') showToast('La publication est réservée aux propriétaires.', 'info');
    else navigate('/login');
  };

  const renderListingCard = (listing: any, isHorizontal: boolean, priority: boolean = false) => {
    const coverPhoto = listing.listing_photos?.find((p: any) => p.is_cover) || listing.listing_photos?.[0];
    const photoUrl = coverPhoto?.photo_url;
    const isNew = listing.created_at && new Date(listing.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
    const isFav = favorites.includes(listing.id);
    return (
      <Link key={listing.id} to={`/annonce/${listing.id}`} className={`block ${isHorizontal ? 'w-[150px] flex-shrink-0 snap-start' : 'w-full mb-4'}`}>
        <div className="bg-white rounded-[16px] overflow-hidden border border-gray-100 shadow-[0_4px_16px_rgba(0,0,0,0.04)] h-full flex flex-col">
          <div className={`relative ${isHorizontal ? 'h-[110px]' : 'h-[180px]'} w-full bg-gray-100 overflow-hidden`}>
            {photoUrl ? (
              <OptimizedImage
                src={photoUrl}
                alt={listing.title}
                className="w-full h-full object-cover"
                loading={priority ? "eager" : "lazy"}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300"><Building2 size={36} /></div>
            )}
            <button onClick={(e) => handleToggleFavorite(listing.id, e)}
              className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 shadow-md z-10 active:scale-95 transition-transform backdrop-blur-sm">
              <Heart size={16} className={isFav ? 'fill-[#7B3FE4] text-[#7B3FE4]' : 'text-gray-400'} />
            </button>
            <div className="absolute bottom-2.5 left-2.5 z-10">
              {isNew ? (
                <span className="bg-[#10B981] text-white font-bold text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                  <Check size={11} strokeWidth={3} /> Nouveau</span>
              ) : (
                <span className="bg-[#7B3FE4] text-white font-bold text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                  <ShieldCheck size={12} /> Vérifié</span>
              )}
            </div>
          </div>
          <div className="p-3 flex flex-col flex-1">
            <div className="font-nunito font-900 text-[14px] text-[#7B3FE4] mb-0.5">
              {formatMontant(listing.monthly_rent)} <span className="text-[10px] font-bold text-gray-400 lowercase">/ mois</span>
            </div>
            <h3 className="font-nunito font-800 text-[13px] text-[#17132B] line-clamp-1 mb-1" title={listing.title}>
              {listing.title}
            </h3>
            <div className="flex items-center gap-1 text-gray-400 mb-2">
              <MapPin size={12} className="flex-shrink-0 text-gray-400" />
              <span className="text-[11px] font-space-grotesk truncate">{listing.city}{listing.neighborhood ? `, ${listing.neighborhood}` : ''}</span>
            </div>
            <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-2 text-[11px] font-space-grotesk text-gray-400 font-medium">
              {listing.bedrooms ? (
                <div className="flex items-center gap-1">
                  <Bed size={12} className="text-gray-400" /> {listing.bedrooms} ch.
                </div>
              ) : null}
              {listing.accepts_progressive_payment && (
                <span className="ml-auto text-[#10B981] font-bold text-[9px] bg-[#10B981]/10 px-2 py-0.5 rounded-full">Échelonné</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  };

  const currentCityNeighborhoods = selectedCityInDrawer
    ? availableCities.find(c => c.city === selectedCityInDrawer)?.neighborhoods || []
    : [];

  return (
    <div className="page-container bg-white h-screen overflow-y-auto">
      {showSplash && <SplashScreen onComplete={() => { sessionStorage.setItem('hasSeenSplash', 'true'); setShowSplash(false); }} />}

      {/* City Drawer */}
      {showCityDrawer && (
        <>
          <Backdrop onClose={() => { setShowCityDrawer(false); setSelectedCityInDrawer(null); }} />
          <div className="fixed bottom-0 z-50 bg-white rounded-t-[28px] shadow-2xl max-h-[70vh] flex flex-col w-full" style={{ maxWidth: 430, left: '50%', transform: 'translateX(-50%)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-nunito font-900 text-[17px] text-[#17132B]">
                {selectedCityInDrawer ? `${selectedCityInDrawer} — Quartier` : 'Choisir une ville'}
              </h3>
              <button onClick={() => { setShowCityDrawer(false); setSelectedCityInDrawer(null); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 pb-8">
              {citiesLoading ? (
                <div className="flex justify-center py-8"><div className="w-8 h-8 rounded-full border-2 border-[#7B3FE4] border-t-transparent animate-spin" /></div>
              ) : selectedCityInDrawer ? (
                <>
                  <button onClick={() => { applyQuickFilter('city', selectedCityInDrawer); applyQuickFilter('neighborhood', null); setShowCityDrawer(false); setSelectedCityInDrawer(null); }}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl mb-2 bg-gray-50 text-[14px] font-space-grotesk font-semibold text-[#17132B]">
                    <span>Toute la ville ({selectedCityInDrawer})</span>
                    {filterCity === selectedCityInDrawer && !filterNeighborhood && <Check size={16} className="text-[#7B3FE4]" />}
                  </button>
                  {currentCityNeighborhoods.map(n => (
                    <button key={n} onClick={() => { applyQuickFilter('city', selectedCityInDrawer); applyQuickFilter('neighborhood', n); setShowCityDrawer(false); setSelectedCityInDrawer(null); }}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl mb-1.5 text-[14px] font-space-grotesk text-[#17132B] active:bg-gray-50">
                      <span>{n}</span>
                      {filterCity === selectedCityInDrawer && filterNeighborhood === n && <Check size={16} className="text-[#7B3FE4]" />}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  {filterCity && (
                    <button onClick={() => { applyQuickFilter('city', null); applyQuickFilter('neighborhood', null); setShowCityDrawer(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-2 text-[14px] font-space-grotesk text-red-500 font-semibold active:bg-red-50">
                      <X size={14} /> Effacer le filtre ville
                    </button>
                  )}
                  {availableCities.map(({ city }) => (
                    <button key={city} onClick={() => setSelectedCityInDrawer(city)}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl mb-1.5 text-[14px] font-space-grotesk text-[#17132B] active:bg-gray-50">
                      <div className="flex items-center gap-3"><MapPin size={15} className="text-[#7B3FE4]" /><span>{city}</span></div>
                      <ChevronRight size={16} className="text-gray-400" />
                    </button>
                  ))}
                  {availableCities.length === 0 && !citiesLoading && (
                    <p className="text-center text-gray-400 text-sm py-8">Aucune annonce publiée</p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Type Drawer */}
      {showTypeDrawer && (
        <>
          <Backdrop onClose={() => setShowTypeDrawer(false)} />
          <div className="fixed bottom-0 z-50 bg-white rounded-t-[28px] shadow-2xl w-full" style={{ maxWidth: 430, left: '50%', transform: 'translateX(-50%)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-nunito font-900 text-[17px] text-[#17132B]">Type de bien</h3>
              <button onClick={() => setShowTypeDrawer(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100"><X size={16} className="text-gray-500" /></button>
            </div>
            <div className="px-4 py-4 pb-8">
              {filterTypes.length > 0 && (
                <button onClick={() => { const p = new URLSearchParams(searchParams); p.delete('types'); setSearchParams(p); setShowTypeDrawer(false); }}
                  className="w-full text-[13px] font-space-grotesk text-red-500 font-semibold flex items-center gap-2 px-4 py-2 mb-2">
                  <X size={14} /> Effacer le filtre type
                </button>
              )}
              <div className="grid grid-cols-2 gap-3">
                {PROPERTY_TYPE_OPTIONS.map(opt => {
                  const isSelected = filterTypes.includes(opt.value);
                  return (
                    <button key={opt.value} onClick={() => { const p = new URLSearchParams(searchParams); if (isSelected) p.delete('types'); else p.set('types', opt.value); setSearchParams(p); setShowTypeDrawer(false); }}
                      className={`flex items-center justify-between gap-2 px-4 py-3.5 rounded-2xl border text-[14px] font-space-grotesk font-semibold transition-all ${isSelected ? 'bg-[#7B3FE4]/10 border-[#7B3FE4] text-[#7B3FE4]' : 'bg-gray-50 border-gray-100 text-[#17132B]'}`}>
                      {opt.label}
                      {isSelected && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Price Drawer */}
      {showPriceDrawer && (
        <>
          <Backdrop onClose={() => setShowPriceDrawer(false)} />
          <div className="fixed bottom-0 z-50 bg-white rounded-t-[28px] shadow-2xl w-full" style={{ maxWidth: 430, left: '50%', transform: 'translateX(-50%)' }}>
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
              <h3 className="font-nunito font-900 text-[17px] text-[#17132B]">Prix maximum / mois</h3>
              <button onClick={() => setShowPriceDrawer(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100"><X size={16} className="text-gray-500" /></button>
            </div>
            <div className="px-4 py-4 pb-8">
              {filterMaxRent && (
                <button onClick={() => { const p = new URLSearchParams(searchParams); p.delete('maxRent'); setSearchParams(p); setShowPriceDrawer(false); }}
                  className="w-full text-[13px] font-space-grotesk text-red-500 font-semibold flex items-center gap-2 px-4 py-2 mb-2">
                  <X size={14} /> Effacer le filtre prix
                </button>
              )}
              <div className="grid grid-cols-2 gap-3">
                {PRICE_OPTIONS.map(price => {
                  const isSelected = filterMaxRent === price;
                  return (
                    <button key={price} onClick={() => { const p = new URLSearchParams(searchParams); p.set('maxRent', price.toString()); setSearchParams(p); setShowPriceDrawer(false); }}
                      className={`px-4 py-3.5 rounded-2xl border text-[13px] font-space-grotesk font-semibold transition-all ${isSelected ? 'bg-[#7B3FE4]/10 border-[#7B3FE4] text-[#7B3FE4]' : 'bg-gray-50 border-gray-100 text-[#17132B]'}`}>
                      {formatMontant(price)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── HEADER ────────────────────────────────────────────── */}
      <header
        className="px-6 pb-3 bg-white flex items-center justify-between sticky top-0 z-30"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}
      >
        <div className="flex items-center flex-shrink-0">
          <span className="font-nunito font-black text-[22px] leading-none">
            <span className="text-[#17132B]">Imo</span><span className="text-[#7B3FE4]">Flex</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => { setSelectedCityInDrawer(null); setShowCityDrawer(true); }}
            className="flex items-center gap-1.5 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 active:bg-gray-100 transition-colors">
            <MapPin size={13} className="text-[#7B3FE4] flex-shrink-0" />
            <span className="text-[12.5px] font-bold text-[#17132B] font-space-grotesk whitespace-nowrap">
              {filterCity || 'Cotonou'}
            </span>
            <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
          </button>
          
          <HeaderSupport 
            className="relative w-9 h-9 flex items-center justify-center text-[#17132B] rounded-full bg-gray-50 border border-gray-100 active:bg-gray-100 transition-colors flex-shrink-0"
            style={{}}
          />

          <button onClick={() => navigate('/notifications')} className="relative w-9 h-9 flex items-center justify-center text-[#17132B] rounded-full bg-gray-50 border border-gray-100 active:bg-gray-100 transition-colors flex-shrink-0">
            <Bell size={18} />
            <div className="absolute top-2 right-2 w-2 h-2 bg-[#7B3FE4] rounded-full border border-white" />
          </button>
          <div className="relative cursor-pointer flex-shrink-0" onClick={() => navigate(user ? '/profil' : '/login')}>
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 border border-gray-100 flex items-center justify-center">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : <User size={18} className="text-gray-400" />}
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#7B3FE4] rounded-full border-2 border-white" />
          </div>
        </div>
      </header>

      <PullToRefresh onRefresh={refetch}>
        <div className="flex-1 bg-white pb-32">

          {/* ── SEARCH AREA ─────────────────────────────────────── */}
          <div className="px-6 pt-3 pb-2">
            <div className="relative mb-3.5 shadow-[0_2px_10px_rgba(23,19,43,0.06)] rounded-2xl border border-gray-200 bg-white flex items-center h-[50px]">
              <Search size={18} className="text-gray-400 ml-4 flex-shrink-0" />
              <input type="text" placeholder="Où souhaitez-vous habiter ?"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none py-3 px-3 text-[14px] outline-none text-[#17132B] placeholder-gray-400 font-space-grotesk" />
              <button onClick={() => navigate('/filtres')} className="mr-2 w-8 h-8 flex items-center justify-center text-gray-500 flex-shrink-0 rounded-xl bg-gray-50 active:bg-gray-100 transition-colors" aria-label="Filtres avancés">
                <SlidersHorizontal size={16} />
              </button>
            </div>

            {/* QUICK PILLS */}
            <div className="relative -mx-6">
              <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-2 px-6 snap-x">
                {PROPERTY_TYPES_QUICK.map((type) => (
                  <button key={type.id} onClick={() => {
                    haptics.light();
                    if (type.id === 'filtres') navigate('/filtres');
                    else setSelectedType(type.id);
                  }}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-space-grotesk text-[13px] font-bold whitespace-nowrap transition-all border flex-shrink-0 snap-start ${
                      selectedType === type.id
                        ? 'bg-[#7B3FE4] text-white border-[#7B3FE4] shadow-md shadow-[#7B3FE4]/20'
                        : 'bg-white text-[#17132B] border-gray-200 active:bg-gray-50'
                    }`}>
                    {type.icon} {type.label}
                  </button>
                ))}
              </div>
              {/* Fondu droit : indique qu'il y a d'autres options au lieu de couper le dernier bouton net */}
              <div className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-white to-transparent" />
            </div>
          </div>

          {/* ── HERO + CAROUSEL ──────────────────────────────────── */}
          <div className="pt-4 pb-2">
            <div className="px-6 mb-4">
              <h1 className="font-nunito font-900 text-[23px] leading-tight text-[#17132B]">
                Trouvez votre <span className="text-[#7B3FE4]">prochain chez-vous</span>
              </h1>
              <p className="text-[12.5px] text-gray-400 font-space-grotesk mt-1 font-medium">
                {loading ? 'Chargement...' : sortedListings.length > 0
                  ? `${sortedListings.length}${hasMore ? '+' : ''} annonces vérifiées`
                  : 'Aucune annonce correspondante'}
              </p>
            </div>

            {/* Horizontal Carousel */}
            <div className="relative">
              <div className="flex gap-4 overflow-x-auto scrollbar-hide px-6 pb-4 snap-x snap-mandatory">
                {loading ? (
                  [1, 2, 3, 4].map(i => <div key={i} className="w-[150px] flex-shrink-0 snap-start"><ListingCardSkeleton /></div>)
                ) : horizontalListings.length > 0 ? (
                  horizontalListings.map((l, i) => renderListingCard(l, true, i < 3))
                ) : (
                  <div className="w-full px-6"><EmptyState title="Aucune annonce" description="Modifiez vos critères pour voir des résultats." /></div>
                )}
              </div>
              {!loading && horizontalListings.length > 0 && (
                <div className="pointer-events-none absolute top-0 right-0 h-[calc(100%-16px)] w-10 bg-gradient-to-l from-white to-transparent" />
              )}
            </div>
          </div>

          {/* ── EXPLORER PAR TYPE ────────────────────────────────── */}
          <div className="px-6 pt-3 pb-6">
            <div className="mb-5">
              <h2 className="font-nunito font-900 text-[20px] text-[#17132B]">Explorer par type</h2>
            </div>
            <div className="relative -mx-6">
              <div className="flex gap-3.5 overflow-x-auto scrollbar-hide pb-2 px-6 snap-x">
                {EXPLORE_CATEGORIES_BASE.map(cat => {
                  const count = categoryCounts[cat.id] ?? 0;
                  return (
                    <button key={cat.id} onClick={() => { haptics.light(); setSelectedType(cat.id); }}
                      className="bg-white rounded-[24px] p-4 flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform w-[140px] flex-shrink-0 snap-start h-[155px] border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
                      <div className={`w-14 h-14 rounded-[20px] ${cat.bg} flex items-center justify-center mb-3`}>{cat.icon}</div>
                      <h3 className="font-nunito font-900 text-[13px] text-[#17132B] leading-tight mb-1">{cat.label}</h3>
                      <span className="text-[11px] font-space-grotesk text-gray-500 font-medium">{count} annonce{count > 1 ? 's' : ''}</span>
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute top-0 right-0 h-[155px] w-10 bg-gradient-to-l from-white to-transparent" />
            </div>
          </div>

          {/* ── CTA BANNER ───────────────────────────────────────── */}
          {showCtaBanner && (
            <div className="px-6 mb-8">
              <div className="bg-[#6D28D9] rounded-[24px] p-5 relative overflow-hidden shadow-xl shadow-[#6D28D9]/20 flex items-center min-h-[135px]">
                <button onClick={() => { sessionStorage.setItem('ctaBannerDismissed', 'true'); setShowCtaBanner(false); }}
                  className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-white/20 text-white z-10 active:bg-white/30">
                  <X size={14} />
                </button>
                <div className="w-24 h-24 absolute -left-1 bottom-1 pointer-events-none opacity-95 flex-shrink-0">
                  <img src="/assets/house-3d.png" alt="" className="w-full h-full object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
                <div className="relative z-10 pl-[84px] pr-2 flex flex-col justify-center flex-1">
                  <h3 className="font-nunito font-900 text-[14px] text-white mb-1 leading-tight">Vous avez un bien immobilier ?</h3>
                  <p className="font-space-grotesk text-[10px] text-white/80 mb-3 font-medium leading-tight">
                    Publiez votre annonce et trouvez rapidement des acheteurs ou locataires.
                  </p>
                  <button onClick={handleCtaPublish}
                    className="bg-white text-[#6D28D9] font-nunito font-800 rounded-full pl-4 pr-1.5 py-1.5 text-[12px] flex items-center gap-2 shadow-lg active:scale-95 transition-transform w-fit self-end">
                    Publier une annonce
                    <div className="w-6 h-6 rounded-full bg-[#6D28D9] flex items-center justify-center"><Plus size={13} className="text-white" /></div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── FLUX VERTICAL ────────────────────────────────────── */}
          {(verticalListings.length > 0 || hasMore) && (
            <div className="px-6 pb-8">
              <h2 className="font-nunito font-900 text-[20px] text-[#17132B] mb-5">Toutes les annonces</h2>
              <div className="flex flex-col gap-4">
                {verticalListings.map((l, i) => renderListingCard(l, false, i < 3))}
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-5 w-full rounded-2xl border border-[#7B3FE4]/25 py-3.5 text-sm font-bold text-[#7B3FE4] transition-colors hover:bg-[#F5F3FF] disabled:opacity-60"
                >
                  {loadingMore ? 'Chargement…' : 'Charger plus d’annonces'}
                </button>
              )}
            </div>
          )}

        </div>
      </PullToRefresh>
      <BottomNav />
      <AuthGateModal isOpen={isModalOpen} onClose={closeModal} reason={modalReason} />
    </div>
  );
};

export default Marketplace;
