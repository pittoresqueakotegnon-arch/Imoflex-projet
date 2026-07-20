import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useUnreadRequests(userId: string | undefined, role: string | undefined) {
  const [unreadRequestsCount, setUnreadRequestsCount] = useState(0);

  const fetchUnreadRequests = useCallback(async () => {
    if (!userId || role !== 'proprietaire') {
      setUnreadRequestsCount(0);
      return;
    }

    try {
      // 1. Trouver les annonces du propriétaire
      const { data: listings } = await supabase
        .from('listings')
        .select('id')
        .eq('owner_id', userId);

      const listingIds = listings?.map(l => l.id) || [];

      if (listingIds.length === 0) {
        setUnreadRequestsCount(0);
        return;
      }

      // 2. Compter les demandes 'nouvelle'
      const { count } = await supabase
        .from('contact_requests')
        .select('id', { count: 'exact', head: true })
        .in('listing_id', listingIds)
        .eq('status', 'nouvelle');

      setUnreadRequestsCount(count || 0);
    } catch (error) {
      console.error('Error fetching unread requests count:', error);
    }
  }, [userId, role]);

  useEffect(() => {
    fetchUnreadRequests();

    if (!userId || role !== 'proprietaire') return;

    // S'abonner aux changements sur contact_requests
    const channel = supabase
      .channel(`contact_requests:owner=${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contact_requests' },
        () => {
          fetchUnreadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUnreadRequests, userId, role]);

  return { unreadRequestsCount, refetch: fetchUnreadRequests };
}
