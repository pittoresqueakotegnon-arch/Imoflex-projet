import React, { useState, useEffect, useRef } from 'react';
import { Send, CheckCheck, ChevronDown, Paperclip, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useSupportSession, getSupportStatus } from '../hooks/useSupportSession';
import { haptics } from '../lib/haptics';
import { useToast } from './Toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface SupportChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  sender_type: 'user' | 'admin';
  message: string;
  screenshot_url?: string;
  read_at?: string;
  created_at: string;
}

export const SupportChatModal: React.FC<SupportChatModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { visitorId } = useSupportSession();
  const { showToast } = useToast();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const { isOnline, statusText } = getSupportStatus();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  };

  useEffect(() => {
    if (isOpen && visitorId !== null) loadOrCreateConversation();
  }, [isOpen, user, visitorId]);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !isOpen) return;
    const channel = supabase
      .channel(`chat_${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
        if (msg.sender_type === 'admin') haptics.success();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, isOpen]);

  const loadOrCreateConversation = async () => {
    if (!user && !visitorId) return;
    setIsLoading(true);
    try {
      let q = supabase.from('support_conversations').select('*');
      q = user ? q.eq('user_id', user.id) : q.eq('visitor_id', visitorId);
      const { data: convs } = await q.neq('status', 'resolue').order('created_at', { ascending: false }).limit(1);

      if (convs && convs.length > 0) {
        setConversationId(convs[0].id);
        const { data: msgs } = await supabase
          .from('support_messages').select('*')
          .eq('conversation_id', convs[0].id).order('created_at', { ascending: true });
        setMessages(msgs || []);
        setTimeout(() => scrollToBottom(false), 100);
      } else {
        const { data: newConv } = await supabase.from('support_conversations')
          .insert({ user_id: user?.id || null, visitor_id: user ? null : visitorId, status: 'ouverte' })
          .select().single();
        if (newConv) { setConversationId(newConv.id); setMessages([]); }
      }
    } catch (e) {
      showToast('Erreur de connexion au support.', 'error');
    } finally { setIsLoading(false); }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !conversationId || isSending) return;
    const text = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    haptics.light();
    const tempId = `temp_${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, sender_type: 'user', message: text, created_at: new Date().toISOString() }]);
    try {
      await supabase.from('support_messages').insert({ conversation_id: conversationId, sender_type: 'user', sender_id: user?.id || null, message: text });
      await supabase.from('support_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } catch { setMessages(prev => prev.filter(m => m.id !== tempId)); showToast("Erreur d'envoi.", 'error'); }
    finally { setIsSending(false); inputRef.current?.focus(); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId) return;
    if (!file.type.startsWith('image/')) { showToast('Images uniquement.', 'error'); return; }
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const name = `${conversationId}_${Date.now()}.${ext}`;
      await supabase.storage.from('support_attachments').upload(name, file);
      const { data: { publicUrl } } = supabase.storage.from('support_attachments').getPublicUrl(name);
      await supabase.from('support_messages').insert({ conversation_id: conversationId, sender_type: 'user', sender_id: user?.id || null, message: "Capture d'écran", screenshot_url: publicUrl });
      await supabase.from('support_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);
    } catch { showToast("Erreur d'envoi de l'image.", 'error'); }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  if (!isOpen) return null;

  const groupedMessages = messages.reduce((groups: { date: string; msgs: Message[] }[], msg) => {
    const d = format(new Date(msg.created_at), 'yyyy-MM-dd');
    const last = groups[groups.length - 1];
    if (last && last.date === d) last.msgs.push(msg);
    else groups.push({ date: d, msgs: [msg] });
    return groups;
  }, []);

  return (
    <div className="fixed inset-0 z-[99999] bg-bg-app flex flex-col sm:max-w-md sm:mx-auto sm:border-x sm:border-surface2 shadow-2xl animate-slideUp">
      {/* ═══════ HEADER ═══════ */}
      <div className="bg-surface2 px-4 py-3 flex items-center gap-3 shrink-0 rounded-b-3xl shadow-violet-sm z-10 relative">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-surface flex items-center justify-center active:bg-white/5 transition-colors">
          <ArrowLeft size={20} className="text-white-soft" />
        </button>
        
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-[14px] bg-violet flex items-center justify-center overflow-hidden border border-violet/30">
            <img src="/support-avatar.png" alt="Support ImoFlex" className="w-full h-full object-cover" />
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface2 ${isOnline ? 'bg-imoflex-green' : 'bg-text-dim'}`} />
        </div>

        <div className="flex-1">
          <h2 className="text-white font-nunito font-bold text-[15px] leading-tight">
            Équipe ImoFlex
          </h2>
          <p className="text-text-dim font-grotesk text-[12px] mt-0.5 font-medium">
            {isOnline ? 'En ligne · Répond rapidement' : statusText}
          </p>
        </div>
      </div>

      {/* ═══════ MESSAGES ═══════ */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1 relative bg-bg-app"
      >
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-surface2 border-t-violet animate-spin" />
            <span className="text-text-dim text-[13px] font-grotesk">Chargement…</span>
          </div>
        ) : messages.length === 0 ? (
          /* ─── ÉTAT VIDE COHÉRENT ─── */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 pb-8">
            <div className="w-20 h-20 rounded-[24px] bg-surface flex items-center justify-center mb-6 p-1 border border-surface2 shadow-violet-sm">
               <div className="w-full h-full rounded-[20px] overflow-hidden">
                  <img src="/support-avatar.png" alt="Support ImoFlex" className="w-full h-full object-cover" />
               </div>
            </div>

            <h3 className="text-white font-nunito font-bold text-xl mb-2">
              Bonjour !
            </h3>
            <p className="text-text-dim text-[14px] mb-8 leading-relaxed max-w-[280px] font-grotesk">
              Notre équipe est là pour vous aider. Envoyez-nous votre question, nous vous répondrons rapidement.
            </p>

            {/* Quick suggestions */}
            <div className="w-full flex flex-col gap-2.5">
              {['Comment rechercher un logement ?', 'Comment contacter un propriétaire ?', 'Signaler une annonce suspecte', 'Problème de paiement'].map((q) => (
                <button key={q} className="bg-surface border border-surface2 text-white-soft rounded-[14px] px-4 py-3 text-[13px] text-left font-grotesk active:bg-surface2 transition-all" onClick={() => setNewMessage(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="text-[11px] text-text-muted text-center my-4 relative font-grotesk font-semibold uppercase tracking-wider flex items-center justify-center gap-2">
                <div className="h-px bg-surface2 flex-1" />
                {(() => {
                  const d = new Date(group.date);
                  const today = new Date();
                  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
                  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
                  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
                  return format(d, 'EEEE d MMMM', { locale: fr });
                })()}
                <div className="h-px bg-surface2 flex-1" />
              </div>

              {group.msgs.map((msg, i) => {
                const isUser = msg.sender_type === 'user';
                const isTemp = msg.id.startsWith('temp_');
                const prev = group.msgs[i - 1];
                const next = group.msgs[i + 1];
                const firstInGroup = !prev || prev.sender_type !== msg.sender_type;
                const lastInGroup = !next || next.sender_type !== msg.sender_type;

                const brUser = firstInGroup ? 'rounded-tl-[20px] rounded-tr-[20px] rounded-bl-[20px] rounded-br-[6px]' : 'rounded-tl-[20px] rounded-tr-[6px] rounded-bl-[20px] rounded-br-[6px]';
                const brAdmin = firstInGroup ? 'rounded-tl-[20px] rounded-tr-[20px] rounded-br-[20px] rounded-bl-[6px]' : 'rounded-tl-[6px] rounded-tr-[20px] rounded-br-[20px] rounded-bl-[6px]';

                return (
                  <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} ${firstInGroup ? 'mt-3' : 'mt-1'} animate-[slideUp_0.2s_ease-out]`}>
                    <div className="max-w-[85%]">
                      <div className={`${isUser ? 'bg-violet text-white' : 'bg-surface text-white-soft border border-surface2'} ${isUser ? brUser : brAdmin} px-4 py-2.5 ${isTemp ? 'opacity-70' : 'opacity-100'} shadow-sm`}>
                        {msg.screenshot_url ? (
                          <div>
                            <a href={msg.screenshot_url} target="_blank" rel="noreferrer">
                              <img src={msg.screenshot_url} alt="Capture" className="rounded-xl max-w-full max-h-[220px] object-cover block" />
                            </a>
                            {msg.message !== "Capture d'écran" && (
                              <p className="mt-2 text-[14px] font-grotesk">{msg.message}</p>
                            )}
                          </div>
                        ) : (
                          <p className="m-0 text-[14px] leading-[1.4] font-grotesk">{msg.message}</p>
                        )}
                      </div>
                    </div>

                    {/* Time */}
                    {lastInGroup && (
                      <div className={`flex items-center gap-1 mt-1 text-[10px] text-text-muted font-grotesk ${isUser ? 'pr-1' : 'pl-1'}`}>
                        {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                        {isUser && !isTemp && <CheckCheck size={12} className={msg.read_at ? 'text-violet-light' : 'text-text-muted'} />}
                        {isTemp && <span className="italic">Envoi...</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}

        <div ref={messagesEndRef} />

        {showScrollBtn && (
          <button className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-surface border border-surface2 flex items-center justify-center shadow-lg z-10" onClick={() => scrollToBottom()}>
            <ChevronDown size={20} className="text-white-soft" />
          </button>
        )}
      </div>

      {/* ═══════ INPUT ═══════ */}
      <div className="bg-bg-app border-t border-surface2 p-3 pb-[calc(env(safe-area-inset-bottom,20px)+12px)] shrink-0 z-10">
        <form onSubmit={handleSendMessage} className="flex items-end gap-2 bg-surface p-1.5 rounded-[24px] border border-surface2 focus-within:border-violet/40 focus-within:shadow-violet-sm transition-all">
          <button type="button" className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center active:bg-white/5" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading
              ? <div className="w-4 h-4 border-2 border-text-dim border-t-transparent rounded-full animate-spin" />
              : <Paperclip size={20} className="text-text-dim" />
            }
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />

          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-white placeholder:text-text-muted py-2.5 outline-none font-grotesk text-[14px] min-w-0"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrivez votre message..."
          />

          <button type="submit" className="w-10 h-10 rounded-full bg-violet shrink-0 flex items-center justify-center shadow-violet-sm active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100" disabled={!newMessage.trim() || isSending}>
            {isSending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send size={18} className="text-white ml-0.5" />
            }
          </button>
        </form>
      </div>
    </div>
  );
};
