import { useState, useEffect, useCallback } from 'react';
import { supabase, Notification } from '../lib/supabase';
import { triggerPushNotification, requestPushPermission, getPushPermissionStatus } from '../lib/webPush';

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadDemandesCount, setUnreadDemandesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const computeCounts = (items: Notification[]) => {
    const unread = items.filter(n => !n.is_read);
    setUnreadCount(unread.length);
    // Demandes non lues = notifications nouvelle_demande_contact non lues
    setUnreadDemandesCount(unread.filter(n => n.type === 'nouvelle_demande_contact').length);
  };

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    const items = (data || []) as Notification[];
    setNotifications(items);
    computeCounts(items);
    setLoading(false);
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, is_read: true }));
      computeCounts(updated);
      return updated;
    });
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    setNotifications(prev => {
      const updated = prev.map(n => (n.id === id ? { ...n, is_read: true } : n));
      computeCounts(updated);
      return updated;
    });
  }, []);

  useEffect(() => {
    fetchNotifications();

    if (!userId) return;

    const channel = supabase
      .channel(`notifications:user_id=eq.${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
          setUnreadCount((prev) => prev + (newNotification.is_read ? 0 : 1));

          // Déclenchement automatique de la notification Web Push si le navigateur l'autorise
          triggerPushNotification(newNotification.title, {
            body: newNotification.body,
            tag: `imoflex-${newNotification.id}`,
            data: { url: '/notifications', id: newNotification.id }
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updatedNotification = payload.new as Notification;
          setNotifications((prev) => {
            const newNotifs = prev.map((n) => (n.id === updatedNotification.id ? updatedNotification : n));
            computeCounts(newNotifs);
            return newNotifs;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, userId]);

  return {
    notifications,
    unreadCount,
    unreadDemandesCount,
    loading,
    refetch: fetchNotifications,
    markAllRead,
    markRead,
    requestPushPermission,
    pushPermissionStatus: getPushPermissionStatus(),
  };
}
