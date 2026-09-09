import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Image as ImageIcon, CheckCheck } from 'lucide-react';
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
  
  const { isOnline, statusText } = getSupportStatus();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      loadOrCreateConversation();
    }
  }, [isOpen, user, visitorId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !isOpen) return;

    // S'abonner aux nouveaux messages de cette conversation
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
          if (newMsg.sender_type === 'admin') {
            haptics.success();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, isOpen]);

  const loadOrCreateConversation = async () => {
    if (!user && !visitorId) return;
    setIsLoading(true);

    try {
      // Chercher une conversation existante ouverte ou en cours
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
        
        // Charger les messages
        const { data: msgs, error: msgError } = await supabase
          .from('support_messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true });
          
        if (msgError) throw msgError;
        setMessages(msgs || []);
      } else {
        // Créer une nouvelle conversation
        const { data: newConv, error: newConvError } = await supabase
          .from('support_conversations')
          .insert({
            user_id: user?.id || null,
            visitor_id: user ? null : visitorId,
            status: 'ouverte'
          })
          .select()
          .single();
          
        if (newConvError) throw newConvError;
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
    if (!newMessage.trim() || !conversationId) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    haptics.light();

    try {
      const { error } = await supabase.from('support_messages').insert({
        conversation_id: conversationId,
        sender_type: 'user',
        sender_id: user?.id || null,
        message: messageText
      });

      if (error) throw error;
      
      // Update last_message_at
      await supabase.from('support_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);

    } catch (error) {
      console.error('Erreur envoi message:', error);
      showToast("Erreur lors de l'envoi du message.", 'error');
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

      // Créer le message avec l'image
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
      showToast('Erreur lors de l\'envoi de l\'image.', 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col sm:p-4 bg-black/40 backdrop-blur-sm sm:items-center sm:justify-center">
      <div 
        className="flex flex-col bg-white w-full h-full sm:h-auto sm:max-h-[600px] sm:max-w-[400px] sm:rounded-3xl shadow-2xl overflow-hidden"
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* Header Chat */}
        <div className="bg-[var(--imx-bg-deep)] border-b border-[rgba(123,63,228,0.1)] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-[#7B3FE4] flex items-center justify-center text-white font-bold text-lg shadow-md">
                IM
              </div>
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[var(--imx-bg-deep)] ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>
            <div>
              <h2 className="font-nunito font-900 text-[16px] text-[#17132B]">Équipe ImoFlex</h2>
              <p className="font-space-grotesk text-[11px] text-gray-500 font-medium">{statusText}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-70">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-2xl">👋</div>
              <h3 className="font-nunito font-800 text-[16px] text-[#17132B] mb-1">Comment pouvons-nous aider ?</h3>
              <p className="font-space-grotesk text-[12px] text-gray-500">
                Envoyez-nous un message. Une personne de notre équipe vous répondra rapidement.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.sender_type === 'user';
              const showTime = index === messages.length - 1 || new Date(messages[index + 1].created_at).getTime() - new Date(msg.created_at).getTime() > 300000;
              
              return (
                <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      isUser 
                        ? 'bg-[#7B3FE4] text-white rounded-br-sm' 
                        : 'bg-white text-[#17132B] rounded-bl-sm shadow-sm border border-gray-100'
                    }`}
                  >
                    {msg.screenshot_url ? (
                      <div className="space-y-2">
                        <a href={msg.screenshot_url} target="_blank" rel="noreferrer">
                          <img src={msg.screenshot_url} alt="Capture" className="rounded-xl max-w-full h-auto max-h-[200px] object-cover" />
                        </a>
                        {msg.message !== 'Capture d\'écran' && (
                          <p className={`text-[14px] font-space-grotesk ${isUser ? 'text-white' : 'text-[#17132B]'}`}>
                            {msg.message}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className={`text-[14px] font-space-grotesk ${isUser ? 'text-white' : 'text-[#17132B]'}`}>
                        {msg.message}
                      </p>
                    )}
                  </div>
                  {showTime && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400 font-space-grotesk">
                      {format(new Date(msg.created_at), 'HH:mm', { locale: fr })}
                      {isUser && msg.read_at && <CheckCheck size={12} className="text-blue-500 ml-1" />}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-3 bg-white border-t border-[rgba(123,63,228,0.1)]">
          <form onSubmit={handleSendMessage} className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 rounded-full text-gray-400 hover:text-[#7B3FE4] hover:bg-[#F5F3FF] transition-colors shrink-0"
              disabled={isUploading}
            >
              {isUploading ? (
                 <div className="w-5 h-5 border-2 border-[#7B3FE4] border-t-transparent rounded-full animate-spin" />
              ) : (
                <ImageIcon size={20} />
              )}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl flex items-center px-4 py-1 focus-within:border-[#7B3FE4] focus-within:ring-2 focus-within:ring-[#7B3FE4]/20 transition-all min-h-[48px]">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Écrivez votre message..."
                className="w-full bg-transparent border-none outline-none text-[14px] font-space-grotesk text-[#17132B]"
              />
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#7B3FE4] text-white shrink-0 disabled:opacity-50 disabled:bg-gray-300 transition-colors"
            >
              <Send size={18} className="ml-1" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
