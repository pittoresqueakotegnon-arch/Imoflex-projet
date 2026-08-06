import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Store, Heart, Receipt, User, LayoutDashboard, List, ClipboardList, Wallet } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useUnreadRequests } from '../hooks/useUnreadRequests';
import { useKeyboard } from '../hooks/useKeyboard';
import { haptics } from '../lib/haptics';

// ─────────────────────────────────────────────────────────────────────────────
// BottomNav — Navigation inférieure ImoFlex
//
// 3 états : Visiteur (null) | Locataire | Propriétaire
//
// Futures extensions prévues :
//   - Onglet « Messagerie » (Messages temps réel)
//   - Onglet « Notifications » (Alertes push)
//   - Badge sur Favoris pour les visiteurs (nombre en localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const { role, profile } = useAuth();
  const { unreadRequestsCount } = useUnreadRequests(profile?.id, role);
  const { isKeyboardOpen } = useKeyboard();

  const isActive = (path: string) => location.pathname === path;

  interface NavItemDef {
    icon: React.ElementType;
    label: string;
    path: string;
    badge?: number;
  }

  const navItemsDef: NavItemDef[] = (() => {
    switch (role) {
      case 'proprietaire':
        return [
          { icon: LayoutDashboard, label: 'Dashboard', path: '/pro/dashboard' },
          { icon: List,            label: 'Annonces',  path: '/pro/annonces' },
          { icon: ClipboardList,  label: 'Demandes',  path: '/pro/demandes', badge: unreadRequestsCount },
          { icon: Wallet,         label: 'Wallet',    path: '/pro/wallet' },
          { icon: User,           label: 'Profil',    path: '/profil' },
        ];
      case 'locataire':
        return [
          { icon: Store,        label: 'Accueil',   path: '/' },
          { icon: Heart,        label: 'Favoris',   path: '/favoris' },
          { icon: ClipboardList,label: 'Demandes',  path: '/mes-demandes' },
          { icon: Receipt,      label: 'Mon loyer', path: '/dashboard' },
          { icon: User,         label: 'Profil',    path: '/profil' },
        ];
      default:
        // Visiteur non connecté — nav simplifiée
        // « Compte » amène à /login où l'utilisateur peut Se connecter ou Créer un compte
        return [
          { icon: Store, label: 'Accueil',  path: '/' },
          { icon: Heart, label: 'Favoris',  path: '/favoris' },
          { icon: User,  label: 'Compte',   path: '/login' },
        ];
    }
  })();

  if (isKeyboardOpen) return null;

  return (
    <nav
      className="bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '390px',
        zIndex: 40,
        background: 'rgba(11, 8, 25, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.07)',
        boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.45)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div className="flex justify-around items-center h-[68px] px-2">
        {navItemsDef.map((item) => {
          const active = isActive(item.path);
          const IconComponent = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => haptics.light()}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-14 relative rounded-xl transition-all duration-200 ${
                active ? 'bg-purple-500/15' : 'hover:bg-white/5'
              }`}
              style={{ margin: '0 4px' }}
            >
              <div className="relative">
                <IconComponent 
                  size={22} 
                  color={active ? '#c084fc' : '#94a3b8'} 
                  strokeWidth={active ? 2.5 : 2} 
                />
                {item.badge && item.badge > 0 ? (
                  <div
                    className="absolute flex items-center justify-center font-bold"
                    style={{
                      top: '-6px',
                      right: '-6px',
                      minWidth: item.badge > 9 ? '18px' : '16px',
                      height: '16px',
                      borderRadius: '8px',
                      padding: '0 3px',
                      background: '#EF4444',
                      color: 'white',
                      fontSize: '9px',
                      fontFamily: 'Space Grotesk, sans-serif',
                      border: '1.5px solid #0B0819',
                      boxShadow: '0 0 8px rgba(239,68,68,0.55)',
                      lineHeight: 1,
                    }}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </div>
                ) : null}
              </div>
              <span
                className="text-[10.5px] font-space-grotesk font-600 transition-colors"
                style={{ color: active ? '#c084fc' : '#94a3b8' }}
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
