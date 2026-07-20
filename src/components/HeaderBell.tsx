import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';

export const HeaderBell: React.FC = () => {
  const { profile } = useAuth();
  const { unreadCount } = useNotifications(profile?.id);

  return (
    <Link
      to="/notifications"
      className="relative flex items-center justify-center flex-shrink-0"
      style={{
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        background: 'rgba(38, 28, 85, 0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
      {unreadCount > 0 && (
        <span
          className="absolute top-[9px] right-[9px] w-2 h-2 rounded-full"
          style={{ background: '#EF4444' }}
        />
      )}
    </Link>
  );
};
