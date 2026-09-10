import React from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';

interface HeaderBellProps {
  className?: string;
  iconSize?: number;
}

export const HeaderBell: React.FC<HeaderBellProps> = ({
  className = "relative w-9 h-9 flex items-center justify-center text-[#17132B] rounded-full bg-gray-50 border border-gray-100 active:bg-gray-100 transition-colors flex-shrink-0",
  iconSize = 18,
}) => {
  const { profile } = useAuth();
  const { unreadCount } = useNotifications(profile?.id);

  return (
    <Link
      to="/notifications"
      className={className}
      aria-label="Notifications"
    >
      <Bell size={iconSize} className="text-[#17132B]" />

      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center font-bold text-white bg-[#EF4444] rounded-full border-2 border-white shadow-sm leading-none"
          style={{
            minWidth: unreadCount > 9 ? '18px' : '16px',
            height: '16px',
            padding: '0 3px',
            fontSize: '9px',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
};
