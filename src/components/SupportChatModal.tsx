import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Send, CheckCheck, ChevronDown, Paperclip, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { getSupportStatus } from '../hooks/useSupportSession';
import { haptics } from '../lib/haptics';
import { useToast } from './Toast';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  assertSupportedSupportImage,
  resolveSupportMessageAttachments,
  uploadSupportAttachment,
} from '../lib/supportAttachments';

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
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Show scroll button if user scrolled up more than 100px
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  };

  useEffect(() => {
    if (isOpen && user) {
      loadOrCreateConversation();
    } else if (!user) {
      setConversationId(null);
      setMessages([]);
    }
  }, [isOpen, user]);

  // Ensure we scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => scrollToBottom(true), 100);
    }
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !isOpen) return;
    const channel = supabase
      .channel(`chat_${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'support_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const received = payload.new as Message;
        void resolveSupportMessageAttachments([received]).then(([msg]) => {
          setMessages(prev => {
            if (prev.find(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (msg.sender_type === 'admin') haptics.success();
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, isOpen]);

  const loadOrCreateConversation = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data: convs, error: conversationsError } = await supabase
        .from('support_conversations')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'resolue')
        .order('created_at', { ascending: false })
        .limit(1);
      if (conversationsError) throw conversationsError;

      if (convs && convs.length > 0) {
        setConversationId(convs[0].id);
        const { data: msgs, error: messagesError } = await supabase
          .from('support_messages').select('*')
          .eq('conversation_id', convs[0].id).order('created_at', { ascending: true });
        if (messagesError) throw messagesError;
        setMessages(await resolveSupportMessageAttachments((msgs || []) as Message[]));
        setTimeout(() => scrollToBottom(false), 150);
      } else {
        const { data: newConv, error: createError } = await supabase.from('support_conversations')
          .insert({ user_id: user.id, status: 'ouverte' })
          .select().single();
        if (createError) throw createError;
        if (newConv) { setConversationId(newConv.id); setMessages([]); }
      }
    } catch {
      showToast('Erreur de connexion au support.', 'error');
    } finally { setIsLoading(false); }
  };

  const handleSendMessage = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) e.preventDefault();
    const textToSend = directMessage || newMessage.trim();
    if (!textToSend || !conversationId || !user || isSending) return;
    
    if (!directMessage) setNewMessage('');
    setIsSending(true);
    haptics.light();
    const tempId = `temp_${Date.now()}`;
    const newMsgObj: Message = { id: tempId, sender_type: 'user', message: textToSend, created_at: new Date().toISOString() };
    
    // Add to UI immediately
    setMessages(prev => [...prev, newMsgObj]);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const { data: inserted, error } = await supabase.from('support_messages')
        .insert({ conversation_id: conversationId, sender_type: 'user', sender_id: user.id, message: textToSend })
        .select().single();
      if (error) throw error;
      const [message] = await resolveSupportMessageAttachments([inserted as Message]);
      setMessages(prev => [...prev.filter(m => m.id !== tempId), message]);
    } catch { 
      setMessages(prev => prev.filter(m => m.id !== tempId)); 
      showToast("Erreur d'envoi.", 'error'); 
    }
    finally { 
      setIsSending(false); 
      if (!directMessage) inputRef.current?.focus(); 
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId || !user) return;
    let uploadedPath: string | null = null;
    let previewUrl: string | null = null;
    setIsUploading(true);
    try {
      const extension = assertSupportedSupportImage(file);
      const path = `${user.id}/${conversationId}/${crypto.randomUUID()}.${extension}`;
      await uploadSupportAttachment(path, file);
      uploadedPath = path;
      
      const tempId = `temp_${Date.now()}`;
      previewUrl = URL.createObjectURL(file);
      setMessages(prev => [...prev, { id: tempId, sender_type: 'user', message: "Capture d'écran", screenshot_url: previewUrl!, created_at: new Date().toISOString() }]);
      setTimeout(() => scrollToBottom(true), 100);

      const { data: inserted, error } = await supabase.from('support_messages')
        .insert({ conversation_id: conversationId, sender_type: 'user', sender_id: user.id, message: "Capture d'écran", screenshot_url: path })
        .select().single();
      if (error) throw error;
      const [message] = await resolveSupportMessageAttachments([inserted as Message]);
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      setMessages(prev => [...prev.filter(m => m.id !== tempId), message]);
    } catch (error) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (uploadedPath) await supabase.storage.from('support_attachments').remove([uploadedPath]);
      showToast(error instanceof Error ? error.message : "Erreur d'envoi de l'image.", 'error');
    }
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

  const modalContent = (
    <>
      <style>{`
        .imx-support-overlay {
          position: fixed !important;
          top: 0 !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          width: 100% !important;
          max-width: 480px !important;
          height: 100dvh !important; /* Use 100dvh for proper mobile height */
          z-index: 99999 !important; /* Higher than bottom nav */
          display: flex !important;
          flex-direction: column !important;
          background: #F9FAFB !important; /* Light theme background */
          animation: imxChatOpen 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
          box-shadow: 0 0 24px rgba(0,0,0,0.1) !important;
        }
        @keyframes imxChatOpen {
          from { opacity: 0; transform: translateY(100%) translateX(-50%); }
          to { opacity: 1; transform: translateY(0) translateX(-50%); }
        }
        .imx-header-bg {
          background: #ffffff !important;
          border-bottom: 1px solid rgba(123,63,228,0.1) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.03) !important;
        }
        .imx-msg-user {
          background: #7B3FE4 !important;
          color: white !important;
        }
        .imx-msg-admin {
          background: #F3F4F6 !important;
          color: #111827 !important;
        }
        .imx-messages-area {
          flex: 1 !important;
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }
        .imx-input-area {
          background: #ffffff !important;
          border-top: 1px solid rgba(0,0,0,0.05) !important;
          /* Add extra padding at bottom to avoid hiding behind safe areas */
          padding-bottom: calc(env(safe-area-inset-bottom, 20px) + 12px) !important; 
        }
        .imx-chat-input {
          background: #F3F4F6 !important;
          color: #111827 !important;
          border: 1px solid transparent !important;
          border-radius: 20px !important;
          padding: 12px 16px !important;
          outline: none !important;
          font-size: 14px !important;
          transition: all 0.2s ease !important;
        }
        .imx-chat-input::placeholder { color: #9CA3AF !important; }
        .imx-chat-input:focus { border-color: rgba(123,63,228,0.4) !important; background: #ffffff !important; box-shadow: 0 0 0 2px rgba(123,63,228,0.1) !important;}
        .imx-send-btn {
          width: 44px !important;
          height: 44px !important;
          border-radius: 50% !important;
          background: #7B3FE4 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
          transition: transform 0.15s ease !important;
        }
        .imx-send-btn:active { transform: scale(0.9) !important; }
        .imx-send-btn:disabled { background: #E5E7EB !important; opacity: 0.7 !important; }
        .imx-attach-btn {
          width: 44px !important;
          height: 44px !important;
          border-radius: 50% !important;
          background: transparent !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        .imx-attach-btn:active { background: rgba(0,0,0,0.05) !important; }
        .imx-status-dot {
          width: 12px !important;
          height: 12px !important;
          border-radius: 50% !important;
          border: 2px solid #ffffff !important;
          flex-shrink: 0 !important;
        }
        .imx-msg-animate {
          animation: imxMsgIn 0.2s ease-out both;
        }
        @keyframes imxMsgIn { from{ opacity:0; transform:translateY(10px); } to{ opacity:1; transform:translateY(0); } }
        .imx-quick-btn {
          background: #ffffff !important;
          border: 1px solid rgba(123,63,228,0.2) !important;
          color: #7B3FE4 !important;
          border-radius: 12px !important;
          padding: 12px 16px !important;
          font-size: 13px !important;
          text-align: left !important;
          transition: all 0.15s ease !important;
          font-weight: 600 !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02) !important;
        }
        .imx-quick-btn:active { background: #F9FAFB !important; transform: scale(0.98); }
        .imx-scroll-btn {
          position: absolute !important;
          bottom: 20px !important;
          right: 16px !important;
          width: 36px !important;
          height: 36px !important;
          border-radius: 50% !important;
          background: #ffffff !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
          z-index: 10 !important;
          border: 1px solid #F3F4F6 !important;
        }
        .imx-date-sep {
          font-size: 11px !important;
          color: #6B7280 !important;
          text-align: center !important;
          margin: 16px 0 !important;
          position: relative !important;
          font-weight: 600 !important;
        }
      `}</style>

      <div className="imx-support-overlay">
        {/* ═══════ HEADER ═══════ */}
        <div className="imx-header-bg" style={{ paddingTop: '16px', paddingBottom: '16px', paddingLeft: '16px', paddingRight: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onClose} style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={18} color="#4B5563" />
          </button>
          
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '14px',
              background: '#7B3FE4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden'
            }}>
              <img src="/support-avatar.png" alt="Support ImoFlex" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div className="imx-status-dot"
              style={{
                position: 'absolute', bottom: '-2px', right: '-2px',
                background: isOnline ? '#10B981' : '#9CA3AF',
              }} />
          </div>

          <div style={{ flex: 1 }}>
            <h2 style={{ color: '#111827', fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: '16px', margin: 0 }}>
              Équipe ImoFlex
            </h2>
            <p style={{ color: '#6B7280', fontSize: '12px', margin: '2px 0 0', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}>
              {isOnline ? 'En ligne · Répond rapidement' : statusText}
            </p>
          </div>
        </div>

        {/* ═══════ MESSAGES ═══════ */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="imx-messages-area"
          style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}
        >
          {!user ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: '200px', textAlign: 'center', padding: '24px' }}>
              <h3 style={{ color: '#111827', fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: '20px', margin: 0 }}>
                Connectez-vous pour contacter le support
              </h3>
              <p style={{ color: '#4B5563', fontSize: '14px', margin: 0, lineHeight: 1.5, maxWidth: '280px', fontFamily: 'Space Grotesk, sans-serif' }}>
                Votre compte protège la confidentialité de vos échanges et de vos pièces jointes.
              </p>
            </div>
          ) : isLoading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', minHeight: '200px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: '#7B3FE4', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <span style={{ color: '#6B7280', fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>Chargement…</span>
            </div>
          ) : messages.length === 0 ? (
            /* ─── ÉTAT VIDE CLAIR ─── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 16px', minHeight: '60vh' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: 'rgba(123,63,228,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', padding: '4px' }}>
                 <div style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }}>
                    <img src="/support-avatar.png" alt="Support ImoFlex" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                 </div>
              </div>

              <h3 style={{ color: '#111827', fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: '20px', margin: '0 0 8px' }}>
                Bonjour !
              </h3>
              <p style={{ color: '#4B5563', fontSize: '14px', margin: '0 0 32px', lineHeight: 1.5, maxWidth: '280px', fontFamily: 'Space Grotesk, sans-serif' }}>
                Notre équipe est là pour vous aider. Envoyez-nous votre question, nous vous répondrons rapidement.
              </p>

              {/* Quick suggestions */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {['Comment rechercher un logement ?', 'Comment contacter un propriétaire ?', 'Signaler une annonce suspecte', 'Problème de paiement'].map((q) => (
                  <button key={q} className="imx-quick-btn" onClick={() => {
                    setNewMessage(q);
                    setTimeout(() => handleSendMessage(undefined, q), 0);
                  }}>
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

                  const brUser = firstInGroup ? '18px 18px 4px 18px' : '6px 18px 4px 18px';
                  const brAdmin = firstInGroup ? '18px 18px 18px 4px' : '18px 6px 18px 4px';

                  return (
                    <div key={msg.id} className="imx-msg-animate"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginTop: firstInGroup ? '12px' : '2px' }}>

                      {/* Bubble */}
                      <div style={{ maxWidth: '85%' }}>
                        <div className={isUser ? 'imx-msg-user' : 'imx-msg-admin'}
                          style={{ borderRadius: isUser ? brUser : brAdmin, padding: '10px 14px', opacity: isTemp ? 0.7 : 1 }}>
                          {msg.screenshot_url ? (
                            <div>
                              <a href={msg.screenshot_url} target="_blank" rel="noreferrer">
                                <img src={msg.screenshot_url} alt="Capture" style={{ borderRadius: '8px', maxWidth: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }} />
                              </a>
                              {msg.message !== "Capture d'écran" && (
                                <p style={{ margin: '8px 0 0', fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif' }}>{msg.message}</p>
                              )}
                            </div>
                          ) : (
                            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.4, fontFamily: 'Space Grotesk, sans-serif' }}>{msg.message}</p>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      {lastInGroup && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: '11px', color: '#9CA3AF', fontFamily: 'Space Grotesk, sans-serif', paddingRight: isUser ? '4px' : 0, paddingLeft: !isUser ? '4px' : 0 }}>
                          {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                          {isUser && !isTemp && <CheckCheck size={14} color={msg.read_at ? '#7B3FE4' : '#9CA3AF'} />}
                          {isTemp && <span style={{ fontStyle: 'italic' }}>Envoi...</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {/* This empty div is the target for scroll to bottom */}
          <div ref={messagesEndRef} style={{ height: '16px' }} />
          
          {showScrollBtn && (
            <button className="imx-scroll-btn" onClick={() => scrollToBottom()}>
              <ChevronDown size={18} color="#4B5563" />
            </button>
          )}
        </div>

        {/* ═══════ INPUT ═══════ */}
        {user && <div className="imx-input-area" style={{ padding: '12px 16px', flexShrink: 0 }}>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" className="imx-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading} style={{ border: 'none', cursor: 'pointer' }}>
              {isUploading
                ? <div style={{ width: '18px', height: '18px', border: '2px solid #9CA3AF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                : <Paperclip size={20} color="#6B7280" />
              }
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" style={{ display: 'none' }} />

            <input
              ref={inputRef}
              type="text"
              className="imx-chat-input"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message..."
              style={{ flex: 1, minWidth: 0 }}
            />

            <button type="submit" className="imx-send-btn" disabled={!newMessage.trim() || isSending} style={{ border: 'none', cursor: 'pointer' }}>
              {isSending
                ? <div style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                : <Send size={18} color="white" style={{ marginLeft: '2px' }} />
              }
            </button>
          </form>
        </div>}
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
};
