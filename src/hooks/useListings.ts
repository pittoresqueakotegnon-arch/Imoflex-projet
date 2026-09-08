import { useState, useEffect, useCallback } from 'react';
import { supabase, Listing, ListingSummary, PropertyType, AvailabilityStatus } from '../lib/supabase';
import { getCachedListings, setCachedListings, getCachedListingDetail, setCachedListingDetail } from '../lib/offlineStorage';

export interface ListingFilters {
  search?: string;
  city?: string;
  propertyTypes?: PropertyType[];
  minRent?: number;
  maxRent?: number;
  minBedrooms?: number;
  availableOnly?: boolean;
  progressiveOnly?: boolean;
}

const PAGE_SIZE = 24;

export function useListings(filters: ListingFilters = {}) {
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = JSON.stringify(filters);
  const propertyTypesKey = filters.propertyTypes?.join(',') ?? '';
  const buildQuery = useCallback(() => {
    let query = supabase
      .from('listings')
      .select('id, title, city, neighborhood, monthly_rent, bedrooms, property_type, availability_status, status, created_at, accepts_progressive_payment, listing_photos(id, photo_url, is_cover)')
      .eq('status', 'publiee')
      .order('created_at', { ascending: false });

    if (filters.city) query = query.ilike('city', `%${filters.city}%`);
    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,neighborhood.ilike.%${filters.search}%,city.ilike.%${filters.search}%`
      );
    }
    if (propertyTypesKey) query = query.in('property_type', propertyTypesKey.split(','));
    if (filters.minRent !== undefined) query = query.gte('monthly_rent', filters.minRent);
    if (filters.maxRent !== undefined && filters.maxRent < 1500000) query = query.lte('monthly_rent', filters.maxRent);
    if (filters.minBedrooms !== undefined && filters.minBedrooms > 0) query = query.gte('bedrooms', filters.minBedrooms);
    if (filters.availableOnly) query = query.eq('availability_status', 'disponible');
    if (filters.progressiveOnly) query = query.eq('accepts_progressive_payment', true);
    return query;
  }, [
    filters.search,
    filters.city,
    propertyTypesKey,
    filters.minRent,
    filters.maxRent,
    filters.minBedrooms,
    filters.availableOnly,
    filters.progressiveOnly,
  ]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Seule la première page est mise en cache. Le cache ne doit pas contourner
    // la pagination en restaurant un catalogue potentiellement gigantesque.
    const cachedData = await getCachedListings(cacheKey);
    if (cachedData?.length) {
      setListings(cachedData.slice(0, PAGE_SIZE));
      setHasMore(cachedData.length >= PAGE_SIZE);
      setLoading(false);
    }
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }

    const { data, error: err } = await buildQuery().range(0, PAGE_SIZE - 1);
    if (err) {
      if (!cachedData?.length) setError(err.message);
    } else {
      const firstPage = (data || []) as ListingSummary[];
      setListings(firstPage);
      setHasMore(firstPage.length === PAGE_SIZE);
      await setCachedListings(cacheKey, firstPage);
    }
    setLoading(false);
  }, [buildQuery, cacheKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !navigator.onLine) return;
    setLoadingMore(true);
    const start = listings.length;
    const { data, error: err } = await buildQuery().range(start, start + PAGE_SIZE - 1);
    if (err) {
      setError(err.message);
    } else {
      const nextPage = (data || []) as ListingSummary[];
      setListings((current) => {
        const currentIds = new Set(current.map((listing) => listing.id));
        return [...current, ...nextPage.filter((listing) => !currentIds.has(listing.id))];
      });
      setHasMore(nextPage.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [buildQuery, hasMore, listings.length, loadingMore]);

  useEffect(() => {
    fetchListings();

    const channel = supabase
      .channel('marketplace-listings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setListings(prev => prev.filter(l => l.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new.status !== 'publiee') {
            // L'annonce a été dépubliée, on la retire immédiatement de la vue
            setListings(prev => prev.filter(l => l.id !== payload.new.id));
          } else {
            fetchListings(); // Si elle devient publiée ou est modifiée, on rafraîchit
          }
        } else if (payload.eventType === 'INSERT') {
          if (payload.new.status === 'publiee') {
            fetchListings();
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchListings]);

  return { listings, loading, loadingMore, hasMore, error, refetch: fetchListings, loadMore };
}

export function useListing(id: string) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
    const fetchListing = async () => {
      setLoading(true);
      
      // Essai cache d'abord
      const cached = await getCachedListingDetail(id);
      if (cached) {
        setListing(cached);
        setLoading(false);
      }
      
      if (!navigator.onLine && cached) {
        return;
      }

      supabase
        .from('listings')
        .select('*, listing_photos(*)')
        .eq('id', id)
        .maybeSingle()
        .then(async ({ data, error: err }) => {
          if (err) {
            if (!cached) setError(err.message);
          } else if (data) {
            setListing(data as Listing);
            await setCachedListingDetail(id, data as Listing);
          }
          setLoading(false);
        });
    };
    
    fetchListing();
  }, [id]);

  return { listing, loading, error };
}

/**
 * Change le statut de disponibilité d'un logement.
 * Règle de cohérence : on ne peut pas repasser un logement à 'disponible'
 * manuellement si un bail actif existe sur ce logement, afin d'éviter
 * qu'un propriétaire réouvre à de nouveaux locataires alors que le bien
 * est encore légalement occupé côté baux.
 */
export async function updateAvailability(listingId: string, status: AvailabilityStatus) {
  // Garde : si on cherche à marquer disponible, vérifier l'absence de bail actif
  if (status === 'disponible') {
    const { data: activeLease, error: leaseCheckError } = await supabase
      .from('properties')
      .select('id, leases!inner(id)')
      .eq('listing_id', listingId)
      .eq('leases.status', 'actif')
      .maybeSingle();

    if (leaseCheckError) {
      console.error('Erreur vérification bail actif:', leaseCheckError);
      throw leaseCheckError;
    }

    if (activeLease) {
      throw new Error(
        'Ce logement a encore un bail actif. Clôturez le bail avant de le remettre en \'disponible\'.'
      );
    }
  }

  const { error } = await supabase
    .from('listings')
    .update({ availability_status: status })
    .eq('id', listingId);

  if (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    throw error;
  }
}
