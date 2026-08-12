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
        background: 'var(--imx-surface-2)',
        border: '1px solid var(--imx-border)',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>

      {unreadCount > 0 && (
        <span
          className="absolute flex items-center justify-center font-bold"
          style={{
            top: '-6px',
            right: '-6px',
            minWidth: unreadCount > 9 ? '20px' : '18px',
            height: '18px',
            borderRadius: '9px',
            padding: '0 4px',
            background: '#EF4444',
            color: 'white',
            fontSize: '10px',
            fontFamily: 'Space Grotesk, sans-serif',
            border: '1.5px solid #0B0819',
            boxShadow: '0 0 8px rgba(239,68,68,0.6)',
            lineHeight: 1,
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
};
