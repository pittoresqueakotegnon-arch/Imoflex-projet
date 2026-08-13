import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ListingSummary, Listing, UserProfile, Lease } from './supabase';

interface ImoflexDB extends DBSchema {
  listings_cache: {
    key: string;
    value: { id: string; data: ListingSummary[]; timestamp: number };
  };
  listing_details_cache: {
    key: string;
    value: { id: string; data: Listing; timestamp: number };
  };
  favorites_cache: {
    key: string;
    value: { id: string; data: ListingSummary[]; timestamp: number };
  };
  user_data_cache: {
    key: string;
    value: { id: string; profile: UserProfile | null; leases: Lease[]; timestamp: number };
  };
}

let dbPromise: Promise<IDBPDatabase<ImoflexDB>> | null = null;

export const initOfflineDB = () => {
  if (typeof window === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDB<ImoflexDB>('imoflex-offline-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('listings_cache')) {
          db.createObjectStore('listings_cache', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('listing_details_cache')) {
          db.createObjectStore('listing_details_cache', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('favorites_cache')) {
          db.createObjectStore('favorites_cache', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('user_data_cache')) {
          db.createObjectStore('user_data_cache', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

// Generic get/set wrappers
export const setCachedListings = async (key: string, data: ListingSummary[]) => {
  const db = await initOfflineDB();
  if (!db) return;
  await db.put('listings_cache', { id: key, data, timestamp: Date.now() });
};

export const getCachedListings = async (key: string) => {
  const db = await initOfflineDB();
  if (!db) return null;
  const entry = await db.get('listings_cache', key);
  return entry?.data || null;
};

export const setCachedListingDetail = async (id: string, data: Listing) => {
  const db = await initOfflineDB();
  if (!db) return;
  await db.put('listing_details_cache', { id, data, timestamp: Date.now() });
};

export const getCachedListingDetail = async (id: string) => {
  const db = await initOfflineDB();
  if (!db) return null;
  const entry = await db.get('listing_details_cache', id);
  return entry?.data || null;
};

export const setCachedFavorites = async (userId: string, data: ListingSummary[]) => {
  const db = await initOfflineDB();
  if (!db) return;
  await db.put('favorites_cache', { id: userId, data, timestamp: Date.now() });
};

export const getCachedFavorites = async (userId: string) => {
  const db = await initOfflineDB();
  if (!db) return null;
  const entry = await db.get('favorites_cache', userId);
  return entry?.data || null;
};

export const setCachedUserData = async (userId: string, profile: UserProfile | null, leases: Lease[]) => {
  const db = await initOfflineDB();
  if (!db) return;
  await db.put('user_data_cache', { id: userId, profile, leases, timestamp: Date.now() });
};

export const getCachedUserData = async (userId: string) => {
  const db = await initOfflineDB();
  if (!db) return null;
  const entry = await db.get('user_data_cache', userId);
  return entry || null;
};
