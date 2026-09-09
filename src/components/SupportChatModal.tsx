import React, { useState, useEffect, useRef } from 'react';
import { X, Send, CheckCheck, ChevronDown, Paperclip } from 'lucide-react';
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

const IMOFLEX_PURPLE = '#7B3FE4';
const IMOFLEX_LIGHT = '#F5F3FF';

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
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  };

  useEffect(() => {
    if (isOpen && visitorId !== null) {
      loadOrCreateConversation();
    }
  }, [isOpen, user, visitorId]);

  useEffect(() => {
    if (messages.length > 0) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !isOpen) return;

    const channel = supabase
      .channel(`chat_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_type === 'admin') haptics.success();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, isOpen]);

  const loadOrCreateConversation = async () => {
    if (!user && !visitorId) return;
    setIsLoading(true);
    try {
      let query = supabase.from('support_conversations').select('*');
      if (user) {
        query = query.eq('user_id', user.id);
      } else {
        query = query.eq('visitor_id', visitorId);
      }
      query = query.neq('status', 'resolue').order('created_at', { ascending: false }).limit(1);

      const { data: convs, error: convError } = await query;
      if (convError) throw convError;

      if (convs && convs.length > 0) {
        const conv = convs[0];
        setConversationId(conv.id);
        const { data: msgs, error: msgError } = await supabase
          .from('support_messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });
        if (msgError) throw msgError;
        setMessages(msgs || []);
        setTimeout(() => scrollToBottom(false), 100);
      } else {
        const { data: newConv, error } = await supabase
          .from('support_conversations')
          .insert({
            user_id: user?.id || null,
            visitor_id: user ? null : visitorId,
            status: 'ouverte'
          })
          .select()
          .single();
        if (error) throw error;
        setConversationId(newConv.id);
        setMessages([]);
      }
    } catch (error) {
      console.error('Erreur chargement conversation:', error);
      showToast('Erreur de connexion au support.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !conversationId || isSending) return;

    const text = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    haptics.light();

    // Optimistic update
    const tempId = `temp_${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      sender_type: 'user',
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { error } = await supabase.from('support_messages').insert({
        conversation_id: conversationId,
        sender_type: 'user',
        sender_id: user?.id || null,
        message: text
      });
      if (error) throw error;

      await supabase.from('support_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

      // Remove temp and realtime will add the real one
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } catch (error) {
      console.error('Erreur envoi:', error);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      showToast("Erreur lors de l'envoi.", 'error');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId) return;
    if (!file.type.startsWith('image/')) {
      showToast('Seules les images sont acceptées.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${conversationId}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('support_attachments')
        .upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('support_attachments')
        .getPublicUrl(fileName);

      const { error: msgError } = await supabase.from('support_messages').insert({
        conversation_id: conversationId,
        sender_type: 'user',
        sender_id: user?.id || null,
        message: 'Capture d\'écran',
        screenshot_url: publicUrl
      });
      if (msgError) throw msgError;

      await supabase.from('support_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
    } catch (error) {
      console.error('Erreur upload:', error);
      showToast('Erreur envoi image.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  const groupMessagesByDate = () => {
    const groups: { date: string; messages: Message[] }[] = [];
    messages.forEach((msg) => {
      const dateKey = format(new Date(msg.created_at), 'yyyy-MM-dd');
      const last = groups[groups.length - 1];
      if (last && last.date === dateKey) {
        last.messages.push(msg);
      } else {
        groups.push({ date: dateKey, messages: [msg] });
      }
    });
    return groups;
  };

  const formatDateLabel = (dateKey: string) => {
    const d = new Date(dateKey);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
    return format(d, 'EEEE d MMMM', { locale: fr });
  };

  const messageGroups = groupMessagesByDate();

  return (
    <>
      <style>{`
        @keyframes slideUpChat {
          from { opacity: 0; transform: translateY(24px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeInMsg {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .chat-msg { animation: fadeInMsg 0.2s ease-out; }
        .pulse-dot { animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Chat Panel — full screen on mobile, panel on desktop */}
      <div
        className="fixed z-[101] flex flex-col bg-white overflow-hidden"
        style={{
          animation: 'slideUpChat 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          // Mobile: full screen
          inset: '0',
          // Desktop override via media
          borderRadius: '0',
        }}
      >
        {/* ══════════════ HEADER ══════════════ */}
        <div
          className="relative flex items-center gap-4 px-5 pt-12 pb-4 flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, #5B21B6 0%, ${IMOFLEX_PURPLE} 60%, #9F67FF 100%)`,
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/15 active:bg-white/25 transition-colors"
          >
            <X size={18} className="text-white" />
          </button>

          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', border: '1.5px solid rgba(255,255,255,0.3)' }}
            >
              <span className="text-white font-nunito font-900 text-xl tracking-tight">IM</span>
            </div>
            {/* Status dot */}
            <div
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-md ${isOnline ? 'bg-emerald-400' : 'bg-gray-400'}`}
            >
              {isOnline && <div className="w-full h-full rounded-full bg-emerald-400 pulse-dot" />}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pr-10">
            <h2 className="text-white font-nunito font-900 text-[18px] tracking-tight leading-none mb-1">
              Équipe ImoFlex
            </h2>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-gray-300'}`} />
              <p className="text-white/80 text-[12px] font-space-grotesk font-medium">
                {statusText}
              </p>
            </div>
            {!isOnline && (
              <p className="text-white/60 text-[11px] font-space-grotesk mt-0.5">
                Disponible 08h – 20h, tous les jours
              </p>
            )}
          </div>
        </div>

        {/* Wave decoration */}
        <div style={{ height: '16px', background: `linear-gradient(135deg, #5B21B6, ${IMOFLEX_PURPLE})`, position: 'relative', flexShrink: 0 }}>
          <svg viewBox="0 0 400 16" style={{ position: 'absolute', bottom: 0, width: '100%', height: '16px' }} preserveAspectRatio="none">
            <path d="M0,0 C100,16 300,0 400,12 L400,16 L0,16 Z" fill="white" />
          </svg>
        </div>

        {/* ══════════════ MESSAGES ══════════════ */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
          style={{ background: '#F7F5FB' }}
        >
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-[3px] border-[#7B3FE4]/20 border-t-[#7B3FE4] rounded-full animate-spin" />
                <span className="text-[12px] text-gray-400 font-space-grotesk">Chargement…</span>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
              {/* Illustration card */}
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5 shadow-xl"
                style={{ background: `linear-gradient(135deg, #5B21B6, ${IMOFLEX_PURPLE})` }}
              >
                <span className="text-3xl">👋</span>
              </div>
              <h3 className="font-nunito font-900 text-[20px] text-[#17132B] mb-2">
                Bienvenue au support
              </h3>
              <p className="font-space-grotesk text-[13px] text-gray-500 leading-relaxed mb-6 max-w-[260px]">
                Notre équipe est là pour vous aider. Envoyez-nous votre question et nous vous répondrons rapidement.
              </p>
              {/* Quick actions */}
              <div className="w-full space-y-2">
                {['Comment rechercher un logement ?', 'Problème avec mon compte', 'Signaler une annonce'].map((q) => (
                  <button
                    key={q}
                    onClick={() => setNewMessage(q)}
                    className="w-full text-left px-4 py-3 rounded-2xl border font-space-grotesk text-[13px] font-semibold transition-all active:scale-98"
                    style={{
                      background: 'white',
                      borderColor: 'rgba(123,63,228,0.15)',
                      color: IMOFLEX_PURPLE,
                    }}
                  >
                    {q} →
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messageGroups.map((group) => (
                <div key={group.date}>
                  {/* Date separator */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span
                      className="text-[11px] font-space-grotesk font-semibold px-3 py-1 rounded-full"
                      style={{ background: 'rgba(123,63,228,0.08)', color: IMOFLEX_PURPLE }}
                    >
                      {formatDateLabel(group.date)}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {/* Messages */}
                  <div className="space-y-1">
                    {group.messages.map((msg, i) => {
                      const isUser = msg.sender_type === 'user';
                      const isTemp = msg.id.startsWith('temp_');
                      const prevMsg = group.messages[i - 1];
                      const nextMsg = group.messages[i + 1];
                      const isFirstInGroup = !prevMsg || prevMsg.sender_type !== msg.sender_type;
                      const isLastInGroup = !nextMsg || nextMsg.sender_type !== msg.sender_type;

                      const showTime = isLastInGroup;

                      const bubbleRadius = isUser
                        ? `${isFirstInGroup ? '20px' : '8px'} 20px 4px 20px`
                        : `20px ${isFirstInGroup ? '20px' : '8px'} 20px 4px`;

                      return (
                        <div key={msg.id} className={`chat-msg flex flex-col ${isUser ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}`}>
                          {/* Admin avatar on first message of group */}
                          {!isUser && isFirstInGroup && (
                            <div className="flex items-center gap-2 mb-1 ml-1">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, #5B21B6, ${IMOFLEX_PURPLE})` }}
                              >
                                IM
                              </div>
                              <span className="text-[11px] font-space-grotesk font-semibold text-gray-400">Équipe ImoFlex</span>
                            </div>
                          )}

                          <div
                            className={`max-w-[80%] ${!isUser ? 'ml-8' : ''}`}
                            style={{ borderRadius: bubbleRadius }}
                          >
                            <div
                              className="px-4 py-2.5 text-[14px] font-space-grotesk leading-relaxed"
                              style={{
                                background: isUser ? `linear-gradient(135deg, #6D28D9, ${IMOFLEX_PURPLE})` : 'white',
                                color: isUser ? 'white' : '#17132B',
                                borderRadius: bubbleRadius,
                                boxShadow: isUser ? '0 2px 12px rgba(123,63,228,0.3)' : '0 1px 4px rgba(0,0,0,0.07)',
                                opacity: isTemp ? 0.7 : 1,
                              }}
                            >
                              {msg.screenshot_url ? (
                                <div className="space-y-2">
                                  <a href={msg.screenshot_url} target="_blank" rel="noreferrer">
                                    <img
                                      src={msg.screenshot_url}
                                      alt="Capture"
                                      className="rounded-xl max-w-full h-auto max-h-[220px] object-cover"
                                    />
                                  </a>
                                  {msg.message !== "Capture d'écran" && (
                                    <p>{msg.message}</p>
                                  )}
                                </div>
                              ) : (
                                <p>{msg.message}</p>
                              )}
                            </div>
                          </div>

                          {showTime && (
                            <div className={`flex items-center gap-1 mt-1 text-[10px] text-gray-400 font-space-grotesk ${isUser ? 'pr-1' : 'pl-9'}`}>
                              {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                              {isUser && !isTemp && (
                                <CheckCheck size={12} className={msg.read_at ? 'text-[#7B3FE4]' : 'text-gray-400'} />
                              )}
                              {isTemp && <span className="italic">envoi…</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 right-4 w-10 h-10 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-90"
            style={{ background: IMOFLEX_PURPLE, zIndex: 10 }}
          >
            <ChevronDown size={18} className="text-white" />
          </button>
        )}

        {/* ══════════════ INPUT AREA ══════════════ */}
        <div
          className="flex-shrink-0 px-4 py-3 pb-8"
          style={{
            background: 'white',
            borderTop: '1px solid rgba(123,63,228,0.08)',
          }}
        >
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            {/* Attachment button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-11 h-11 flex items-center justify-center rounded-2xl flex-shrink-0 transition-all active:scale-90"
              style={{
                background: IMOFLEX_LIGHT,
                color: IMOFLEX_PURPLE,
              }}
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>

            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />

            {/* Text input */}
            <div
              className="flex-1 flex items-center rounded-2xl px-4 transition-all"
              style={{
                background: '#F7F5FB',
                border: '1.5px solid rgba(123,63,228,0.12)',
                minHeight: '48px',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Écrivez votre message…"
                className="w-full bg-transparent border-none outline-none text-[14px] font-space-grotesk text-[#17132B] placeholder-gray-400"
              />
            </div>

            {/* Send button */}
            <button
              type="submit"
              disabled={!newMessage.trim() || isSending}
              className="w-11 h-11 flex items-center justify-center rounded-2xl flex-shrink-0 transition-all active:scale-90 disabled:opacity-40"
              style={{
                background: newMessage.trim() ? `linear-gradient(135deg, #6D28D9, ${IMOFLEX_PURPLE})` : '#E5E7EB',
                boxShadow: newMessage.trim() ? '0 4px 12px rgba(123,63,228,0.35)' : 'none',
              }}
            >
              <Send size={18} className={newMessage.trim() ? 'text-white' : 'text-gray-400'} style={{ marginLeft: '2px' }} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
