import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export const useUnreadSupportMessages = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let conversationId: string | null = null;

    const fetchUnread = async () => {
      let q = supabase.from('support_conversations').select('id');
      q = q.eq('user_id', user.id);
      const { data: convs } = await q.neq('status', 'resolue').order('created_at', { ascending: false }).limit(1);

      if (convs && convs.length > 0) {
        conversationId = convs[0].id;
        const { count } = await supabase
          .from('support_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .eq('sender_type', 'admin')
          .is('read_at', null);
        setUnreadCount(count || 0);

        const channel = supabase
          .channel(`unread_${conversationId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'support_messages',
            filter: `conversation_id=eq.${conversationId}`
          }, () => {
            fetchUnread();
          })
          .subscribe();

        return () => { supabase.removeChannel(channel); };
      }
    };

    let cleanup: any;
    fetchUnread().then(c => cleanup = c);

    return () => {
      if (cleanup) cleanup();
    };
  }, [user]);

  return { unreadCount };
};

export const getSupportStatus = (): { isOnline: boolean; statusText: string } => {
  const now = new Date();
  const hours = now.getHours();
  // L'assistance est disponible tous les jours de 08h00 à 20h00
  const isOnline = hours >= 8 && hours < 20;

  return {
    isOnline,
    statusText: isOnline 
      ? 'En ligne' 
      : 'Hors ligne — laissez votre message, nous vous répondrons vite',
  };
};
