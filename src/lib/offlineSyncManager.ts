import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { supabase } from './supabase';
import { toast } from 'sonner';

export type SyncActionType = 'TOGGLE_FAVORITE' | 'SEND_CONTACT_REQUEST' | 'UPDATE_PROFILE' | 'SAVE_DRAFT';

export interface SyncAction {
  id: string; // Unique ID (uuid)
  type: SyncActionType;
  payload: any;
  timestamp: number;
  status: 'pending' | 'failed' | 'synced';
  retryCount: number;
}

interface SyncDB extends DBSchema {
  sync_queue: {
    key: string;
    value: SyncAction;
    indexes: { 'by-timestamp': number };
  };
}

let syncDbPromise: Promise<IDBPDatabase<SyncDB>> | null = null;

const getSyncDB = () => {
  if (typeof window === 'undefined') return null;
  if (!syncDbPromise) {
    syncDbPromise = openDB<SyncDB>('imoflex-sync-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return syncDbPromise;
};

// Ajouter une action à la file d'attente
export const queueSyncAction = async (type: SyncActionType, payload: any) => {
  const db = await getSyncDB();
  if (!db) return;
  const action: SyncAction = {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
  };
  await db.put('sync_queue', action);
  toast.success('Action enregistrée hors-ligne. Elle sera synchronisée lors de la reconnexion.', { icon: '🔄' });
};

// Processus de synchronisation
export const processSyncQueue = async () => {
  if (!navigator.onLine) return;

  const db = await getSyncDB();
  if (!db) return;

  const tx = db.transaction('sync_queue', 'readwrite');
  const index = tx.store.index('by-timestamp');
  const actions = await index.getAll();
  const pendingActions = actions.filter(a => a.status === 'pending' || a.status === 'failed');

  if (pendingActions.length === 0) return;

  let successCount = 0;
  let failCount = 0;

  for (const action of pendingActions) {
    try {
      if (action.type === 'TOGGLE_FAVORITE') {
        const { listingId, userId, isAdding } = action.payload;
        if (isAdding) {
          await supabase.from('favorites').upsert({ user_id: userId, listing_id: listingId });
        } else {
          await supabase.from('favorites').delete().eq('user_id', userId).eq('listing_id', listingId);
        }
      } else if (action.type === 'SEND_CONTACT_REQUEST') {
        const { listing_id, requester_id, message, contact_phone } = action.payload;
        const { error } = await supabase.from('contact_requests').insert({
          listing_id, requester_id, message, contact_phone, status: 'nouvelle'
        });
        if (error) throw error;
      }
      
      // Marquer comme complété (on supprime ou on met à jour le statut)
      await db.delete('sync_queue', action.id);
      successCount++;

    } catch (error: any) {
      console.error(`Failed to sync action ${action.id}:`, error);
      
      // Gérer l'échec
      const isPermanentError = error.code === '23503' || error.status === 404 || error.status === 409; 
      // Si erreur définitive (foreign key 23503, introuvable) ou max retries atteint
      if (isPermanentError || action.retryCount >= 2) { // 3 tentatives max (0, 1, 2)
        await db.delete('sync_queue', action.id);
        failCount++;
        toast.error(`Action échouée définitivement : ${getActionName(action.type)}. Elle a été annulée.`);
      } else {
        // Retry
        action.retryCount += 1;
        action.status = 'failed';
        await db.put('sync_queue', action);
      }
    }
  }

  if (successCount > 0) {
    toast.success(`Synchronisation terminée : ${successCount} action(s) synchronisée(s) !`, { icon: '✅' });
  }
};

const getActionName = (type: SyncActionType) => {
  switch (type) {
    case 'TOGGLE_FAVORITE': return 'Favoris';
    case 'SEND_CONTACT_REQUEST': return 'Demande de contact';
    case 'UPDATE_PROFILE': return 'Mise à jour profil';
    case 'SAVE_DRAFT': return 'Sauvegarde brouillon';
    default: return type;
  }
};

// Initialiser le listener réseau
export const initOfflineSync = () => {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      processSyncQueue();
    });
    // On lance une fois au démarrage au cas où des actions seraient en attente
    setTimeout(processSyncQueue, 2000);
  }
};
