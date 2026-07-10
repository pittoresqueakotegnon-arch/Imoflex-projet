import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

// SVG icons inline pour correspondre mieux aux maquettes
const IconMarche = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const IconFavoris = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#A855F7' : 'none'} stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </svg>
);

const IconLoyer = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
    <line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);

const IconProfil = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconDashboard = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);

const IconAnnonces = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const IconDemandes = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);

const IconWallet = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#A855F7' : '#4A3D7A'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
    <path d="M16 3l-4 4-4-4"/>
    <circle cx="16" cy="13" r="1" fill="currentColor"/>
  </svg>
);


export const BottomNav: React.FC = () => {
  const location = useLocation();
  const { role, profile } = useAuth();
  const { unreadCount } = useNotifications(profile?.id);

  const isActive = (path: string) => location.pathname === path;

  interface NavItemDef {
    icon: (active: boolean) => React.ReactNode;
    label: string;
    path: string;
    badge?: number;
  }

  const navItemsDef: NavItemDef[] = (() => {
    switch (role) {
      case 'proprietaire':
        return [
          { icon: (a) => <IconDashboard active={a} />, label: 'Dashboard', path: '/pro/dashboard' },
          { icon: (a) => <IconAnnonces active={a} />, label: 'Annonces', path: '/pro/annonces' },
          { icon: (a) => <IconDemandes active={a} />, label: 'Demandes', path: '/pro/demandes', badge: unreadCount },
          { icon: (a) => <IconWallet active={a} />, label: 'Wallet', path: '/pro/wallet' },
          { icon: (a) => <IconProfil active={a} />, label: 'Profil', path: '/profil' },
        ];
      case 'locataire':
      default:
        return [
          { icon: (a) => <IconMarche active={a} />, label: 'Marché', path: '/' },
          { icon: (a) => <IconFavoris active={a} />, label: 'Favoris', path: '/favoris' },
          { icon: (a) => <IconLoyer active={a} />, label: 'Mon loyer', path: '/dashboard' },
          { icon: (a) => <IconProfil active={a} />, label: 'Profil', path: '/profil' },
        ];
    }
  })();

  return (
    <nav
      className="bottom-nav"
      style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '390px' }}
    >
      <div className="flex justify-around items-center h-[68px]">
        {navItemsDef.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center gap-0.5 flex-1 py-2 relative"
            >
              <div className="relative">
                {item.icon(active)}
                {item.badge && item.badge > 0 ? (
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#EF4444] rounded-full flex items-center justify-center">
                    <span className="text-white text-[9px] font-bold">{item.badge > 9 ? '9+' : item.badge}</span>
                  </div>
                ) : null}
              </div>
              <span
                className="text-[10.5px] font-space-grotesk font-600 transition-colors"
                style={{ color: active ? '#A855F7' : '#4A3D7A' }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
