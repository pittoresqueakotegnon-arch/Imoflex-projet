import React, { useState } from 'react';
import { Headset } from 'lucide-react';
import { SupportChatModal } from './SupportChatModal';
import { useUnreadSupportMessages } from '../hooks/useSupportSession';

interface HeaderSupportProps {
  className?: string;
  style?: React.CSSProperties;
}

export const HeaderSupport: React.FC<HeaderSupportProps> = ({ className, style }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { unreadCount } = useUnreadSupportMessages();

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={className || "relative flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"}
        style={style || {
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: 'var(--imx-surface-2)',
          border: '1px solid var(--imx-border)',
        }}
        aria-label="Contacter le support"
      >
        <Headset size={20} className="text-[#7B3FE4]" />
        
        {unreadCount > 0 && (
          <div className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 rounded-full bg-red-500 flex items-center justify-center border-2 border-white shadow-sm z-10 animate-in zoom-in duration-200">
            <span className="text-[10px] font-bold font-nunito text-white leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </div>
        )}
      </button>

      <SupportChatModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
};
