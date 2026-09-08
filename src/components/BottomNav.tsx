import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Heart, User, Plus, Building2, ClipboardList, CreditCard, MessageSquare, HelpCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useKeyboard } from '../hooks/useKeyboard';
import { haptics } from '../lib/haptics';
import { useToast } from './Toast';

// ─────────────────────────────────────────────────────────────────────────────
// BottomNav — Navigation inférieure ImoFlex
//
// 3 configurations distinctes :
//   - Visiteur     → Accueil (/), Aide (/aide), Publier (+ / login), Favoris (/favoris), Compte (/login)
//   - Locataire    → Accueil/Marketplace (/), Demandes (/mes-demandes), Payer (/dashboard), Favoris (/favoris), Profil (/profil)
//   - Propriétaire → Dashboard (/pro/dashboard), Annonces (/pro/annonces), Publier (+), Demandes (/pro/demandes), Profil (/profil)
// ─────────────────────────────────────────────────────────────────────────────

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { showToast } = useToast();
  const { isKeyboardOpen } = useKeyboard();

  const isActive = (path: string) => {
    if (path === '/' && location.pathname !== '/') return false;
    return location.pathname === path;
  };

  const handleCenterPress = (actionType: 'publier' | 'payer') => {
    haptics.medium();
    if (actionType === 'payer') {
      navigate('/dashboard');
    } else if (role === 'proprietaire') {
      navigate('/pro/publier');
    } else if (role === 'locataire') {
      showToast('La publication d\'annonces est réservée aux propriétaires.', 'info');
    } else {
      navigate('/login');
    }
  };

  interface NavItemDef {
    icon: React.ElementType;
    label: string;
    path: string;
    isCenter?: boolean;
    centerType?: 'publier' | 'payer';
    badge?: number;
  }

  const getNavItems = (): NavItemDef[] => {
    if (role === 'proprietaire') {
      return [
        { icon: Home, label: 'Dashboard', path: '/pro/dashboard' },
        { icon: Building2, label: 'Annonces', path: '/pro/annonces' },
        { icon: Plus, label: 'Publier', path: '/pro/publier', isCenter: true, centerType: 'publier' },
        { icon: ClipboardList, label: 'Demandes', path: '/pro/demandes' },
        { icon: User, label: 'Profil', path: '/profil' },
      ];
    }
    if (role === 'locataire') {
      return [
        { icon: Home, label: 'Accueil', path: '/' },
        { icon: MessageSquare, label: 'Demande', path: '/mes-demandes' },
        { icon: CreditCard, label: 'Payer', path: '/dashboard', isCenter: true, centerType: 'payer' },
        { icon: Heart, label: 'Favoris', path: '/favoris' },
        { icon: User, label: 'Profil', path: '/profil' },
      ];
    }
    // Visiteur — « Aide » remplace « Rechercher » (la barre de recherche est déjà en haut de la Marketplace)
    return [
      { icon: Home, label: 'Accueil', path: '/' },
      { icon: HelpCircle, label: 'Aide', path: '/aide' },
      { icon: Plus, label: 'Publier', path: '/pro/publier', isCenter: true, centerType: 'publier' },
      { icon: Heart, label: 'Favoris', path: '/favoris' },
      { icon: User, label: 'Compte', path: '/login' },
    ];
  };

  const navItemsDef = getNavItems();

  if (isKeyboardOpen) return null;

  return (
    <nav
      className="bottom-nav w-full sm:max-w-[430px]"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        background: 'var(--imx-nav-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--imx-border)',
        boxShadow: '0 -4px 20px rgba(23, 19, 43, 0.05)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div className="flex justify-around items-center h-[68px] px-2 relative">
        {navItemsDef.map((item) => {
          const active = isActive(item.path);
          const IconComponent = item.icon;
          
          if (item.isCenter) {
            return (
              <button
                key={item.label}
                onClick={() => handleCenterPress(item.centerType || 'publier')}
                className="flex flex-col items-center justify-center -mt-7 z-[50] flex-1"
              >
                <div className="w-[56px] h-[56px] rounded-full flex items-center justify-center bg-[#7B3FE4] text-white border-[3.5px] border-white shadow-[0_6px_18px_rgba(123,63,228,0.35)] hover:scale-105 active:scale-95 transition-all">
                  <IconComponent size={26} color="white" strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-space-grotesk font-bold mt-1 text-[var(--imx-accent)]">
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => haptics.light()}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-14 relative rounded-xl transition-all duration-200 ${
                active ? '' : 'hover:bg-[var(--imx-surface-2)]'
              }`}
              style={{
                margin: '0 4px',
                background: active ? 'var(--imx-surface-2)' : 'transparent',
              }}
            >
              <div className="relative">
                <IconComponent 
                  size={22} 
                  color={active ? 'var(--imx-accent)' : 'var(--imx-text-muted)'} 
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
                      border: '1.5px solid var(--imx-nav-bg)',
                      boxShadow: '0 2px 4px rgba(239,68,68,0.3)',
                      lineHeight: 1,
                    }}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </div>
                ) : null}
              </div>
              <span
                className={`text-[10.5px] font-space-grotesk transition-colors ${active ? 'font-bold' : 'font-medium'}`}
                style={{ color: active ? 'var(--imx-accent)' : 'var(--imx-text-muted)' }}
              >
                {item.label}
              </span>
              {active && (
                <div className="w-1 h-1 rounded-full bg-[#7B3FE4] -mt-0.5" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
