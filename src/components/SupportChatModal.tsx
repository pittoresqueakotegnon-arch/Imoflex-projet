import React, { useState, useEffect, useRef } from 'react';
import { X, Send, CheckCheck, ChevronDown, Paperclip, ArrowLeft } from 'lucide-react';
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
    <>
      {/* CSS inline pour s'assurer du full-screen */}
      <style>{`
        .imx-support-overlay {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          z-index: 9999 !important;
          display: flex !important;
          flex-direction: column !important;
          background: #0f0a1e !important;
          animation: imxChatOpen 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes imxChatOpen {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        .imx-header-bg {
          background: linear-gradient(160deg, #3b0f8f 0%, #7B3FE4 55%, #a855f7 100%) !important;
        }
        .imx-msg-user {
          background: linear-gradient(135deg, #7B3FE4, #9f67ff) !important;
          color: white !important;
        }
        .imx-msg-admin {
          background: #1e1346 !important;
          color: #e8e0ff !important;
          border: 1px solid rgba(123,63,228,0.2) !important;
        }
        .imx-messages-area {
          background: #0f0a1e !important;
        }
        .imx-input-area {
          background: #150d2e !important;
          border-top: 1px solid rgba(123,63,228,0.2) !important;
        }
        .imx-chat-input {
          background: #1e1346 !important;
          color: #e8e0ff !important;
          border: 1.5px solid rgba(123,63,228,0.3) !important;
          border-radius: 24px !important;
          padding: 12px 18px !important;
          outline: none !important;
          font-size: 14px !important;
        }
        .imx-chat-input::placeholder { color: rgba(232,224,255,0.4) !important; }
        .imx-chat-input:focus { border-color: rgba(123,63,228,0.7) !important; }
        .imx-send-btn {
          width: 48px !important;
          height: 48px !important;
          border-radius: 50% !important;
          background: linear-gradient(135deg, #7B3FE4, #9f67ff) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 4px 16px rgba(123,63,228,0.5) !important;
          flex-shrink: 0 !important;
          transition: transform 0.15s ease !important;
        }
        .imx-send-btn:active { transform: scale(0.9) !important; }
        .imx-send-btn:disabled { background: #1e1346 !important; box-shadow: none !important; opacity: 0.5 !important; }
        .imx-attach-btn {
          width: 44px !important;
          height: 44px !important;
          border-radius: 50% !important;
          background: rgba(123,63,228,0.15) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          transition: background 0.15s ease !important;
        }
        .imx-attach-btn:active { background: rgba(123,63,228,0.3) !important; }
        .imx-status-dot {
          width: 10px !important;
          height: 10px !important;
          border-radius: 50% !important;
          border: 2px solid rgba(255,255,255,0.3) !important;
          flex-shrink: 0 !important;
        }
        .imx-online-anim {
          animation: imxPulse 2s infinite;
        }
        @keyframes imxPulse { 0%,100%{ box-shadow: 0 0 0 0 rgba(74,222,128,0.5); } 50%{ box-shadow: 0 0 0 5px rgba(74,222,128,0); } }
        .imx-msg-animate {
          animation: imxMsgIn 0.2s ease-out both;
        }
        @keyframes imxMsgIn { from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
        .imx-quick-btn {
          background: rgba(123,63,228,0.12) !important;
          border: 1px solid rgba(123,63,228,0.25) !important;
          color: #c4b5fd !important;
          border-radius: 20px !important;
          padding: 10px 16px !important;
          font-size: 13px !important;
          text-align: left !important;
          transition: all 0.15s ease !important;
          font-weight: 500 !important;
        }
        .imx-quick-btn:active { background: rgba(123,63,228,0.25) !important; transform: scale(0.98); }
        .imx-scroll-btn {
          position: absolute !important;
          bottom: 80px !important;
          right: 16px !important;
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          background: #7B3FE4 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 4px 12px rgba(123,63,228,0.5) !important;
          z-index: 10 !important;
          animation: imxMsgIn 0.2s ease-out both;
        }
        .imx-date-sep {
          font-size: 11px !important;
          color: rgba(196,181,253,0.5) !important;
          text-align: center !important;
          margin: 12px 0 !important;
          position: relative !important;
        }
        .imx-date-sep::before, .imx-date-sep::after {
          content: '' !important;
          display: inline-block !important;
          width: 30% !important;
          height: 1px !important;
          background: rgba(123,63,228,0.2) !important;
          vertical-align: middle !important;
          margin: 0 8px !important;
        }
      `}</style>

      <div className="imx-support-overlay">

        {/* ═══════ HEADER ═══════ */}
        <div className="imx-header-bg" style={{ paddingTop: '48px', paddingBottom: '20px', paddingLeft: '20px', paddingRight: '20px', flexShrink: 0 }}>
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <button onClick={onClose} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={18} color="white" />
            </button>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontFamily: 'Space Grotesk, sans-serif' }}>Support ImoFlex</span>
            <button onClick={onClose} style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="rgba(255,255,255,0.7)" />
            </button>
          </div>

          {/* Team info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Avatar avec halo */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '22px',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(10px)',
                border: '2px solid rgba(255,255,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}>
                <span style={{ color: 'white', fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: '22px', letterSpacing: '-0.5px' }}>IM</span>
              </div>
              {/* Status dot */}
              <div className={isOnline ? 'imx-status-dot imx-online-anim' : 'imx-status-dot'}
                style={{
                  position: 'absolute', bottom: '-2px', right: '-2px',
                  background: isOnline ? '#4ade80' : '#6b7280',
                }} />
            </div>

            <div style={{ flex: 1 }}>
              <h2 style={{ color: 'white', fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: '20px', margin: 0, lineHeight: 1.2 }}>
                Équipe ImoFlex
              </h2>
              <p style={{ color: isOnline ? '#a7f3d0' : 'rgba(255,255,255,0.55)', fontSize: '12.5px', margin: '4px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}>
                {isOnline ? '🟢 En ligne · Répond rapidement' : '⚪ ' + statusText}
              </p>
              {!isOnline && (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: '2px 0 0', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Disponible 08h – 20h, tous les jours
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ═══════ MESSAGES ═══════ */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="imx-messages-area"
          style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative' }}
        >
          {isLoading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid rgba(123,63,228,0.2)', borderTopColor: '#7B3FE4', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <span style={{ color: 'rgba(196,181,253,0.6)', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>Chargement…</span>
            </div>
          ) : messages.length === 0 ? (
            /* ─── ÉTAT VIDE PREMIUM ─── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 16px' }}>
              {/* Orb décoratif */}
              <div style={{ position: 'relative', marginBottom: '24px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '28px', background: 'linear-gradient(135deg, #3b0f8f, #7B3FE4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 16px 48px rgba(123,63,228,0.5)' }}>
                  <span style={{ fontSize: '36px' }}>👋</span>
                </div>
                <div style={{ position: 'absolute', inset: '-8px', borderRadius: '36px', border: '1px solid rgba(123,63,228,0.3)', animation: 'imxPulse 2s infinite' }} />
              </div>

              <h3 style={{ color: 'white', fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: '22px', margin: '0 0 8px' }}>
                Bonjour ! 👋
              </h3>
              <p style={{ color: 'rgba(196,181,253,0.7)', fontSize: '14px', margin: '0 0 28px', lineHeight: 1.6, maxWidth: '260px', fontFamily: 'Space Grotesk, sans-serif' }}>
                Notre équipe est là pour vous aider. Envoyez-nous votre question.
              </p>

              {/* Quick suggestions */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ color: 'rgba(196,181,253,0.4)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', fontFamily: 'Space Grotesk, sans-serif' }}>Questions fréquentes</p>
                {['🔍 Comment rechercher un logement ?', '🏠 Comment contacter un propriétaire ?', '⚠️ Signaler une annonce suspecte', '💳 Problème de paiement'].map((q) => (
                  <button key={q} className="imx-quick-btn" onClick={() => setNewMessage(q.slice(3))}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            groupedMessages.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="imx-date-sep">
                  {(() => {
                    const d = new Date(group.date);
                    const today = new Date();
                    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
                    if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
                    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
                    return format(d, 'EEEE d MMMM', { locale: fr });
                  })()}
                </div>

                {group.msgs.map((msg, i) => {
                  const isUser = msg.sender_type === 'user';
                  const isTemp = msg.id.startsWith('temp_');
                  const prev = group.msgs[i - 1];
                  const next = group.msgs[i + 1];
                  const firstInGroup = !prev || prev.sender_type !== msg.sender_type;
                  const lastInGroup = !next || next.sender_type !== msg.sender_type;

                  const brUser = firstInGroup ? '20px 20px 4px 20px' : '8px 20px 4px 20px';
                  const brAdmin = firstInGroup ? '20px 20px 20px 4px' : '20px 8px 20px 4px';

                  return (
                    <div key={msg.id} className="imx-msg-animate"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginTop: firstInGroup ? '12px' : '2px' }}>

                      {/* Admin label */}
                      {!isUser && firstInGroup && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', marginLeft: '4px' }}>
                          <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: 'linear-gradient(135deg, #3b0f8f, #7B3FE4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: 'white', fontSize: '8px', fontWeight: 900 }}>IM</span>
                          </div>
                          <span style={{ color: 'rgba(196,181,253,0.5)', fontSize: '11px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>Équipe ImoFlex</span>
                        </div>
                      )}

                      {/* Bubble */}
                      <div style={{ maxWidth: '80%', marginLeft: !isUser ? '4px' : 0 }}>
                        <div className={isUser ? 'imx-msg-user' : 'imx-msg-admin'}
                          style={{ borderRadius: isUser ? brUser : brAdmin, padding: '10px 16px', opacity: isTemp ? 0.7 : 1 }}>
                          {msg.screenshot_url ? (
                            <div>
                              <a href={msg.screenshot_url} target="_blank" rel="noreferrer">
                                <img src={msg.screenshot_url} alt="Capture" style={{ borderRadius: '12px', maxWidth: '100%', maxHeight: '220px', objectFit: 'cover', display: 'block' }} />
                              </a>
                              {msg.message !== "Capture d'écran" && (
                                <p style={{ margin: '6px 0 0', fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif' }}>{msg.message}</p>
                              )}
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, fontFamily: 'Space Grotesk, sans-serif' }}>{msg.message}</p>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      {lastInGroup && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '10px', color: 'rgba(196,181,253,0.35)', fontFamily: 'Space Grotesk, sans-serif', paddingRight: isUser ? '4px' : 0, paddingLeft: !isUser ? '4px' : 0 }}>
                          {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                          {isUser && !isTemp && <CheckCheck size={11} color={msg.read_at ? '#a78bfa' : 'rgba(196,181,253,0.35)'} />}
                          {isTemp && <span style={{ fontStyle: 'italic' }}>envoi…</span>}
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
            <button className="imx-scroll-btn" onClick={() => scrollToBottom()}>
              <ChevronDown size={16} color="white" />
            </button>
          )}
        </div>

        {/* ═══════ INPUT ═══════ */}
        <div className="imx-input-area" style={{ padding: '12px 16px 32px', flexShrink: 0 }}>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button type="button" className="imx-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              {isUploading
                ? <div style={{ width: '16px', height: '16px', border: '2px solid #7B3FE4', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                : <Paperclip size={18} color="#a78bfa" />
              }
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" style={{ display: 'none' }} />

            <input
              ref={inputRef}
              type="text"
              className="imx-chat-input"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Écrivez votre message…"
              style={{ flex: 1 }}
            />

            <button type="submit" className="imx-send-btn" disabled={!newMessage.trim() || isSending}>
              {isSending
                ? <div style={{ width: '16px', height: '16px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                : <Send size={18} color="white" style={{ marginLeft: '2px' }} />
              }
            </button>
          </form>
        </div>
      </div>
    </>
  );
};
