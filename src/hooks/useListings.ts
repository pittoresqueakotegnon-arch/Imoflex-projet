import { useState, useEffect, useCallback } from 'react';
import { supabase, Listing, PropertyType } from '../lib/supabase';

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

export function useListings(filters: ListingFilters = {}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('listings')
      .select('*, listing_photos(*)')
      .eq('status', 'publiee')
      .order('created_at', { ascending: false });

    if (filters.city) {
      query = query.ilike('city', `%${filters.city}%`);
    }
    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,neighborhood.ilike.%${filters.search}%,city.ilike.%${filters.search}%`
      );
    }
    if (filters.propertyTypes && filters.propertyTypes.length > 0) {
      query = query.in('property_type', filters.propertyTypes);
    }
    if (filters.minRent !== undefined) {
      query = query.gte('monthly_rent', filters.minRent);
    }
    if (filters.maxRent !== undefined) {
      query = query.lte('monthly_rent', filters.maxRent);
    }
    if (filters.minBedrooms !== undefined && filters.minBedrooms > 0) {
      query = query.gte('bedrooms', filters.minBedrooms);
    }
    if (filters.availableOnly) {
      query = query.eq('availability_status', 'disponible');
    }
    if (filters.progressiveOnly) {
      query = query.eq('accepts_progressive_payment', true);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
    } else {
      setListings((data || []) as Listing[]);
    }
    setLoading(false);
  }, [
    filters.search,
    filters.city,
    filters.propertyTypes?.join(','),
    filters.minRent,
    filters.maxRent,
    filters.minBedrooms,
    filters.availableOnly,
    filters.progressiveOnly,
  ]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  return { listings, loading, error, refetch: fetchListings };
}

export function useListing(id: string) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase
      .from('listings')
      .select('*, listing_photos(*)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setListing(data as Listing | null);
        setLoading(false);
      });
  }, [id]);

  return { listing, loading, error };
}
