import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Headset, CheckCircle2, MessageSquare, Send, Image as ImageIcon, RefreshCw, User } from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  assertSupportedSupportImage,
  resolveSupportMessageAttachments,
  uploadSupportAttachment,
} from '../../lib/supportAttachments';

interface Conversation {
  id: string;
  user_id: string | null;
  visitor_id: string | null;
  status: 'ouverte' | 'en_cours' | 'resolue';
  created_at: string;
  updated_at: string;
  last_message_at: string;
  users?: { full_name: string; phone: string; } | null;
  unread_count?: number;
  last_message?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'user' | 'admin';
  sender_id: string | null;
  message: string;
  screenshot_url?: string;
  read_at?: string;
  created_at: string;
}

type StatusFilter = 'tous' | 'ouverte' | 'en_cours' | 'resolue';

const STATUS_LABELS: Record<string, string> = {
  ouverte: 'Ouverte',
  en_cours: 'En cours',
  resolue: 'Résolue',
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    ouverte: 'bg-blue-500/20 text-blue-400',
    en_cours: 'bg-orange-500/20 text-orange-400',
    resolue: 'bg-emerald-500/20 text-emerald-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${styles[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
};

export default function AdminSupport() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('tous');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = async () => {
    try {
      // 1. Fetch conversations without the invalid FK join
      const { data, error } = await supabase
        .from('support_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      // 2. Fetch user info separately for conversations that have a user_id
      const userIds = [...new Set((data || []).map(c => c.user_id).filter(Boolean))];
      const userMap: Record<string, { full_name: string; phone: string }> = {};

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, phone')
          .in('id', userIds);
        
        (usersData || []).forEach(u => {
          userMap[u.id] = { full_name: u.full_name, phone: u.phone };
        });
      }

      // 3. For each conversation, fetch last message and unread count
      const convWithMeta = await Promise.all((data || []).map(async (conv) => {
        const { data: lastMsgData } = await supabase
          .from('support_messages')
          .select('message, sender_type')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const { count } = await supabase
          .from('support_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .eq('sender_type', 'user')
          .is('read_at', null);

        return {
          ...conv,
          users: conv.user_id ? userMap[conv.user_id] || null : null,
          last_message: lastMsgData?.message,
          unread_count: count || 0,
        };
      }));

      setConversations(convWithMeta as Conversation[]);
    } catch (err) {
      console.error('Erreur chargement conversations:', err);
      toast.error('Impossible de charger les conversations');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchConversations();

    // Subscribe to all conversation and message changes
    const channel = supabase
      .channel('admin_support_global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => {
        fetchConversations();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
        const received = payload.new as Message;
        void resolveSupportMessageAttachments([received]).then(([newMsg]) => {
          // If it's from a user (not admin), show notification
          if (newMsg.sender_type === 'user') {
            toast(`Nouveau message`, { description: newMsg.message.slice(0, 60), icon: <MessageSquare size={16} className="text-[#7B3FE4]" /> });
          }
          // If we're viewing that conversation, add the message
          setActiveConversation(prev => {
            if (prev && prev.id === newMsg.conversation_id) {
              setMessages(msgs => {
                if (msgs.find(m => m.id === newMsg.id)) return msgs;
                return [...msgs, newMsg];
              });
            }
            return prev;
          });
          fetchConversations();
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const openConversation = async (conv: Conversation) => {
    setActiveConversation(conv);
    setLoadingMessages(true);
    setMessages([]);

    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(await resolveSupportMessageAttachments((data || []) as Message[]));

      // Mark user messages as read
      const unreadIds = (data || [])
        .filter(m => m.sender_type === 'user' && !m.read_at)
        .map(m => m.id);
      
      if (unreadIds.length > 0) {
        await supabase.from('support_messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unreadIds);
        
        // Update conversation status to 'en_cours' if still 'ouverte'
        if (conv.status === 'ouverte') {
          await supabase.from('support_conversations')
            .update({ status: 'en_cours' })
            .eq('id', conv.id);
        }
        fetchConversations();
      }
    } catch (err) {
      console.error('Erreur chargement messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !activeConversation || !user) return;

    const text = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    try {
      const { data: inserted, error } = await supabase.from('support_messages')
        .insert({
          conversation_id: activeConversation.id,
          sender_type: 'admin',
          sender_id: user.id,
          message: text,
        })
        .select()
        .single();
      if (error) throw error;
      const [message] = await resolveSupportMessageAttachments([inserted as Message]);
      setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
    } catch (err) {
      console.error('Erreur envoi message admin:', err);
      toast.error("Erreur lors de l'envoi");
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation || !user) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Seules les images sont acceptées.');
      return;
    }

    let uploadedPath: string | null = null;
    let messageCreated = false;
    try {
      const extension = assertSupportedSupportImage(file);
      const path = `admin/${activeConversation.id}/${crypto.randomUUID()}.${extension}`;
      await uploadSupportAttachment(path, file);
      uploadedPath = path;

      const { data: inserted, error: msgError } = await supabase.from('support_messages')
        .insert({
          conversation_id: activeConversation.id,
          sender_type: 'admin',
          sender_id: user.id,
          message: 'Image partagée',
          screenshot_url: path,
      })
        .select()
        .single();
      if (msgError) throw msgError;
      messageCreated = true;
      const [message] = await resolveSupportMessageAttachments([inserted as Message]);
      setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
    } catch (err) {
      if (uploadedPath && !messageCreated) {
        await supabase.storage.from('support_attachments').remove([uploadedPath]);
      }
      console.error('Erreur upload admin:', err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi de l'image.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleStatusChange = async (convId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('support_conversations')
        .update({ status: newStatus })
        .eq('id', convId);
      if (error) throw error;

      setActiveConversation(prev => prev ? { ...prev, status: newStatus as any } : prev);
      toast.success('Statut mis à jour');
      fetchConversations();
    } catch {
      toast.error('Erreur mise à jour statut');
    }
  };

  const filteredConversations = conversations.filter(c => {
    if (statusFilter === 'tous') return true;
    return c.status === statusFilter;
  });

  const getConvLabel = (conv: Conversation) => {
    if (conv.users?.full_name) return conv.users.full_name;
    if (conv.visitor_id) return `Visiteur ${conv.visitor_id.slice(0, 8)}...`;
    return 'Utilisateur anonyme';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ fontFamily: 'Nunito' }}>Support Chat</h1>
          <p className="text-sm" style={{ color: 'var(--adm-text-muted)' }}>
            {conversations.filter(c => c.unread_count && c.unread_count > 0).length} conversation(s) avec messages non lus
          </p>
        </div>
        <button onClick={fetchConversations} className="p-2 rounded-xl transition-colors" style={{ background: 'var(--adm-surface)', border: '1px solid var(--adm-border)' }}>
          <RefreshCw size={16} style={{ color: 'var(--adm-text-muted)' }} />
        </button>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 gap-4 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--adm-border)' }}>
        
        {/* LEFT: Conversation list */}
        <div className="w-80 flex-shrink-0 flex flex-col border-r" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          {/* Filter tabs */}
          <div className="p-3 border-b" style={{ borderColor: 'var(--adm-border)' }}>
            <div className="flex gap-1">
              {(['tous', 'ouverte', 'en_cours', 'resolue'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="flex-1 py-1.5 px-1 rounded-lg text-[11px] font-bold capitalize transition-colors"
                  style={{
                    background: statusFilter === s ? 'var(--adm-accent)' : 'var(--adm-bg)',
                    color: statusFilter === s ? 'white' : 'var(--adm-text-muted)',
                  }}
                >
                  {s === 'tous' ? 'Tous' : STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-8">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--adm-accent)', borderTopColor: 'transparent' }} />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Headset size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--adm-text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--adm-text-dim)' }}>Aucune conversation</p>
              </div>
            ) : (
              filteredConversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className="w-full text-left p-4 border-b transition-all hover:opacity-90"
                  style={{
                    borderColor: 'var(--adm-border)',
                    background: activeConversation?.id === conv.id ? 'var(--adm-accent-bg)' : 'transparent',
                    borderLeft: activeConversation?.id === conv.id ? '3px solid var(--adm-accent)' : '3px solid transparent',
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold" style={{ background: 'var(--adm-accent)' }}>
                        {conv.users ? conv.users.full_name.charAt(0).toUpperCase() : <User size={14} />}
                      </div>
                      <span className="text-sm font-bold truncate">{getConvLabel(conv)}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <StatusBadge status={conv.status} />
                      {(conv.unread_count ?? 0) > 0 && (
                        <span className="w-5 h-5 rounded-full bg-[#7B3FE4] text-white text-[10px] font-bold flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  {conv.last_message && (
                    <p className="text-[12px] truncate pl-10" style={{ color: 'var(--adm-text-muted)' }}>
                      {conv.last_message}
                    </p>
                  )}
                  <p className="text-[10px] pl-10 mt-1" style={{ color: 'var(--adm-text-dim)' }}>
                    {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: fr })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Chat view */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--adm-bg)' }}>
          {!activeConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <MessageSquare size={48} className="mb-4 opacity-20" style={{ color: 'var(--adm-text-muted)' }} />
              <p className="font-bold mb-1" style={{ color: 'var(--adm-text-muted)' }}>Sélectionnez une conversation</p>
              <p className="text-sm" style={{ color: 'var(--adm-text-dim)' }}>Cliquez sur une conversation à gauche pour voir les messages</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold" style={{ background: 'var(--adm-accent)' }}>
                    {activeConversation.users ? activeConversation.users.full_name.charAt(0).toUpperCase() : <User size={14} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{getConvLabel(activeConversation)}</p>
                    <p className="text-[11px]" style={{ color: 'var(--adm-text-muted)' }}>
                      {activeConversation.users?.phone || (activeConversation.visitor_id ? `ID: ${activeConversation.visitor_id.slice(0, 12)}...` : 'Compte non connecté')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={activeConversation.status}
                    onChange={(e) => handleStatusChange(activeConversation.id, e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold outline-none cursor-pointer border"
                    style={{ background: 'var(--adm-bg)', color: 'var(--adm-text)', borderColor: 'var(--adm-border)' }}
                  >
                    <option value="ouverte">Ouverte</option>
                    <option value="en_cours">En cours</option>
                    <option value="resolue">Résolue</option>
                  </select>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--adm-accent)', borderTopColor: 'transparent' }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm" style={{ color: 'var(--adm-text-dim)' }}>Aucun message dans cette conversation</p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isAdmin = msg.sender_type === 'admin';
                    const showDate = index === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[index - 1].created_at).toDateString();
                    
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="text-center my-2">
                            <span className="text-[11px] px-3 py-1 rounded-full" style={{ background: 'var(--adm-surface)', color: 'var(--adm-text-muted)' }}>
                              {format(new Date(msg.created_at), 'EEEE d MMMM', { locale: fr })}
                            </span>
                          </div>
                        )}
                        <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                          <div className={`flex items-end gap-2 max-w-[75%] ${isAdmin ? 'flex-row-reverse' : ''}`}>
                            {!isAdmin && (
                              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-bold mb-1" style={{ background: 'var(--adm-accent)' }}>
                                {activeConversation.users ? activeConversation.users.full_name.charAt(0).toUpperCase() : 'V'}
                              </div>
                            )}
                            <div
                              className="rounded-2xl px-4 py-2.5"
                              style={{
                                background: isAdmin ? 'var(--adm-accent)' : 'var(--adm-surface)',
                                color: isAdmin ? 'white' : 'var(--adm-text)',
                                borderRadius: isAdmin ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                border: isAdmin ? 'none' : '1px solid var(--adm-border)',
                              }}
                            >
                              {msg.screenshot_url ? (
                                <div className="space-y-2">
                                  <a href={msg.screenshot_url} target="_blank" rel="noreferrer">
                                    <img src={msg.screenshot_url} alt="Capture" className="rounded-xl max-w-full h-auto max-h-[200px] object-cover" />
                                  </a>
                                  {msg.message !== 'Image partagée' && msg.message !== "Capture d'écran" && (
                                    <p className="text-sm">{msg.message}</p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm leading-relaxed">{msg.message}</p>
                              )}
                            </div>
                          </div>
                          <div className={`text-[10px] mt-1 ${isAdmin ? 'text-right' : 'text-left pl-8'}`} style={{ color: 'var(--adm-text-dim)' }}>
                            {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                            {isAdmin && msg.read_at && <span className="ml-1 text-blue-400">· Lu</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Admin message input */}
              {activeConversation.status !== 'resolue' ? (
                <div className="p-3 border-t" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface)' }}>
                  <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2.5 rounded-xl transition-colors"
                      style={{ background: 'var(--adm-bg)', border: '1px solid var(--adm-border)', color: 'var(--adm-text-muted)' }}
                    >
                      <ImageIcon size={18} />
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Répondre en tant qu'Équipe ImoFlex..."
                      rows={1}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                      style={{
                        background: 'var(--adm-bg)',
                        color: 'var(--adm-text)',
                        border: '1px solid var(--adm-border)',
                        minHeight: '44px',
                        maxHeight: '120px',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim() || isSending}
                      className="p-3 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                      style={{ background: 'var(--adm-accent)', color: 'white' }}
                    >
                      {isSending ? (
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </form>
                  <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--adm-text-dim)' }}>
                    Votre réponse apparaîtra comme provenant d'<strong>Équipe ImoFlex</strong>
                  </p>
                </div>
              ) : (
                <div className="p-4 border-t text-center" style={{ borderColor: 'var(--adm-border)' }}>
                  <div className="flex items-center justify-center gap-2 text-emerald-400">
                    <CheckCircle2 size={16} />
                    <span className="text-sm font-semibold">Conversation résolue</span>
                  </div>
                  <button
                    onClick={() => handleStatusChange(activeConversation.id, 'en_cours')}
                    className="mt-2 text-xs underline"
                    style={{ color: 'var(--adm-text-muted)' }}
                  >
                    Rouvrir la conversation
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
