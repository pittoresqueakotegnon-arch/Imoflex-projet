import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Search, Heart, User, LogOut, Settings,
  Building2, CreditCard, FileText, ClipboardList,
  LayoutDashboard, Plus, Bell, Menu, X, ChevronDown,
  Wallet, Users, ShieldCheck, HelpCircle,
  BadgeCheck
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { supabase } from '../lib/supabase';
import { UserAvatar } from '../components/UserAvatar';

/* ─────────────────────────────────────────────────────────────
   WebLayout v2 — Layout desktop/tablette premium ImoFlex Web
   Sidebar structurée + header raffiné + responsive complet
───────────────────────────────────────────────────────────── */

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

function getNavGroups(role: string | null, unreadCount: number): NavGroup[] {
  if (role === 'locataire') {
    return [
      {
        label: 'Mon espace',
        items: [
          { icon: LayoutDashboard, label: 'Tableau de bord',   path: '/web/dashboard' },
          { icon: CreditCard,      label: 'Paiements',          path: '/web/paiements' },
          { icon: ClipboardList,   label: 'Mes candidatures',   path: '/web/mes-demandes' },
          { icon: FileText,        label: 'Documents',          path: '/web/documents' },
        ],
      },
      {
        label: 'Explorer',
        items: [
          { icon: Search,  label: 'Rechercher',   path: '/web/annonces' },
          { icon: Heart,   label: 'Mes favoris',  path: '/web/favoris' },
        ],
      },
      {
        label: 'Compte',
        items: [
          { icon: Bell,  label: 'Notifications',  path: '/web/notifications', badge: unreadCount },
          { icon: User,  label: 'Mon profil',     path: '/web/profil' },
          { icon: HelpCircle, label: 'Aide',      path: '/web/aide' },
        ],
      },
    ];
  }
  if (role === 'proprietaire') {
    return [
      {
        label: 'Gestion',
        items: [
          { icon: LayoutDashboard, label: 'Tableau de bord',   path: '/web/pro/dashboard' },
          { icon: Building2,       label: 'Mes annonces',      path: '/web/pro/annonces' },
          { icon: FileText,         label: 'Mandats agence',    path: '/web/pro/mandats' },
          { icon: Plus,            label: 'Publier',            path: '/web/pro/publier' },
          { icon: ClipboardList,   label: 'Demandes',           path: '/web/pro/demandes' },
          { icon: Users,           label: 'Mes locataires',    path: '/web/pro/locataires' },
          { icon: Wallet,          label: 'Wallet & loyers',   path: '/web/pro/wallet' },
          { icon: ShieldCheck,     label: 'Vérification',      path: '/web/pro/verification' },
        ],
      },
      {
        label: 'Compte',
        items: [
          { icon: Bell,  label: 'Notifications',  path: '/web/notifications', badge: unreadCount },
          { icon: User,  label: 'Mon profil',     path: '/web/profil' },
          { icon: HelpCircle, label: 'Aide',      path: '/web/aide' },
        ],
      },
    ];
  }
  if (role === 'agence') {
    return [
      {
        label: 'Agence',
        items: [
          { icon: LayoutDashboard, label: 'Tableau de bord',   path: '/web/agence/dashboard' },
          { icon: Building2,       label: 'Annonces',           path: '/web/agence/annonces' },
          { icon: Plus,            label: 'Publier',            path: '/web/agence/publier' },
          { icon: ClipboardList,   label: 'Demandes',           path: '/web/agence/demandes' },
          { icon: BadgeCheck,      label: 'Profil agence',     path: '/web/agence/profil' },
        ],
      },
      {
        label: 'Compte',
        items: [
          { icon: Bell,       label: 'Notifications',  path: '/web/notifications', badge: unreadCount },
          { icon: User,       label: 'Mon profil',     path: '/web/profil' },
          { icon: HelpCircle, label: 'Aide',           path: '/web/aide' },
        ],
      },
    ];
  }
  // Visiteur
  return [
    {
      items: [
        { icon: Home,    label: 'Accueil',    path: '/web' },
        { icon: Search,  label: 'Annonces',   path: '/web/annonces' },
        { icon: Heart,   label: 'Favoris',    path: '/web/favoris' },
        { icon: HelpCircle, label: 'Aide',    path: '/web/aide' },
      ],
    },
  ];
}

interface BottomNavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
  isPrimary?: boolean;
}

function getBottomNavItems(role: string | null, _unreadCount: number): BottomNavItem[] {
  if (role === 'locataire') {
    return [
      { icon: LayoutDashboard, label: 'Tableau',   path: '/web/dashboard' },
      { icon: CreditCard,      label: 'Paiements', path: '/web/paiements' },
      { icon: Search,          label: 'Annonces',  path: '/web/annonces' },
      { icon: Heart,           label: 'Favoris',   path: '/web/favoris' },
      { icon: User,            label: 'Profil',    path: '/web/profil' },
    ];
  }
  if (role === 'proprietaire') {
    return [
      { icon: LayoutDashboard, label: 'Tableau',    path: '/web/pro/dashboard' },
      { icon: Building2,       label: 'Annonces',   path: '/web/pro/annonces' },
      { icon: Plus,            label: 'Publier',    path: '/web/pro/publier', isPrimary: true },
      { icon: Users,           label: 'Locataires', path: '/web/pro/locataires' },
      { icon: Wallet,          label: 'Wallet',     path: '/web/pro/wallet' },
    ];
  }
  if (role === 'agence') {
    return [
      { icon: LayoutDashboard, label: 'Tableau',  path: '/web/agence/dashboard' },
      { icon: Building2,       label: 'Annonces', path: '/web/agence/annonces' },
      { icon: Plus,            label: 'Publier',  path: '/web/agence/publier', isPrimary: true },
      { icon: ClipboardList,   label: 'Demandes', path: '/web/agence/demandes' },
      { icon: BadgeCheck,      label: 'Agence',   path: '/web/agence/profil' },
    ];
  }
  // Visiteur
  return [
    { icon: Home,   label: 'Accueil',  path: '/web' },
    { icon: Search, label: 'Annonces', path: '/web/annonces' },
    { icon: Heart,  label: 'Favoris',  path: '/web/favoris' },
    { icon: User,   label: 'Compte',   path: '/web/login' },
  ];
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  locataire:    { label: 'Locataire',    color: '#2563EB', bg: '#EFF6FF' },
  proprietaire: { label: 'Propriétaire', color: '#7B3FE4', bg: '#F5F3FF' },
  agence:       { label: 'Agence',       color: '#059669', bg: '#ECFDF5' },
  admin:        { label: 'Admin',        color: '#DC2626', bg: '#FEF2F2' },
};

export default function WebLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, role, signOut } = useAuth();
  const { unreadCount } = useNotifications(user?.id);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const navGroups = getNavGroups(role, unreadCount);
  const roleConfig = ROLE_CONFIG[role ?? ''] ?? null;

  const [agencyLogo, setAgencyLogo] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'agence' && user?.id) {
      supabase
        .from('agences_profiles')
        .select('logo_url')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.logo_url) setAgencyLogo(data.logo_url);
        });
    }
  }, [role, user?.id]);

  const userPhoto = agencyLogo || profile?.avatar_url || null;

  const isActive = (path: string) => {
    if (path === '/web' && location.pathname !== '/web') return false;
    return location.pathname.startsWith(path) && (path !== '/web' || location.pathname === '/web');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/web');
  };

  // ── Sidebar component ────────────────────────────────────────
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <aside
      className={`flex flex-col h-full ${isMobile ? 'w-72' : 'w-64'} web-scrollbar overflow-y-auto`}
      style={{
        background: 'var(--imx-surface)',
        borderRight: '1px solid var(--imx-border)',
      }}
    >
      {/* Logo */}
      <div
        className="px-5 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid var(--imx-border)' }}
      >
        <Link
          to="/web"
          className="flex items-center gap-3"
          onClick={() => isMobile && setSidebarOpen(false)}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)' }}
          >
            <img
              src="/assets/logo-icon-transparent-recadre.png"
              alt="ImoFlex"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p
              className="font-black text-sm leading-none tracking-tight"
              style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}
            >
              ImoFlex
            </p>
            <p className="text-[10px] mt-0.5 font-medium" style={{ color: 'var(--imx-text-muted)' }}>
              Plateforme web
            </p>
          </div>
        </Link>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--imx-surface-2)]"
            style={{ color: 'var(--imx-text-muted)' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-3' : ''}>
            {group.label && (
              <p
                className="px-3 mb-1.5"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--imx-text-muted)',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = isActive(item.path);
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => isMobile && setSidebarOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 relative group"
                  style={{
                    background: active ? 'rgba(123, 63, 228, 0.08)' : 'transparent',
                    color: active ? 'var(--imx-accent)' : 'var(--imx-text-secondary)',
                    fontWeight: active ? 600 : 400,
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)';
                      (e.currentTarget as HTMLElement).style.color = 'var(--imx-text-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = 'var(--imx-text-secondary)';
                    }
                  }}
                >
                  {/* Active indicator */}
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full"
                      style={{ background: 'var(--imx-accent)' }}
                    />
                  )}
                  <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span
                      className="flex items-center justify-center text-white font-bold"
                      style={{
                        minWidth: '18px',
                        height: '18px',
                        borderRadius: '9px',
                        background: '#EF4444',
                        fontSize: '10px',
                        padding: '0 4px',
                        fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {gi < navGroups.length - 1 && (
              <div
                className="mx-3 my-2"
                style={{ height: '1px', background: 'var(--imx-border)' }}
              />
            )}
          </div>
        ))}
      </nav>

      {/* Profile zone */}
      <div
        className="p-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--imx-border)' }}
      >
        {user && profile ? (
          <div
            className="rounded-xl p-3 space-y-3"
            style={{ background: 'var(--imx-surface-2)' }}
          >
            <div className="flex items-center gap-3">
              <UserAvatar
                src={userPhoto}
                name={profile.full_name}
                size="md"
                shape="circle"
                className="w-9 h-9 ring-2 ring-purple-100 shadow-2xs"
              />
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold truncate leading-none mb-1"
                  style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
                >
                  {profile.full_name}
                </p>
                {roleConfig && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: roleConfig.bg, color: roleConfig.color, fontFamily: 'Inter, sans-serif' }}
                  >
                    {roleConfig.label}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (isMobile) setSidebarOpen(false);
                setShowLogoutConfirm(true);
              }}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ color: '#EF4444', fontFamily: 'Inter, sans-serif' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <LogOut size={13} />
              <span>Déconnexion</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Link
              to="/web/login"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: 'var(--imx-accent)', fontFamily: 'Inter, sans-serif' }}
              onClick={() => isMobile && setSidebarOpen(false)}
            >
              Se connecter
            </Link>
            <Link
              to="/web/register"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                border: '1.5px solid var(--imx-border)',
                color: 'var(--imx-text-secondary)',
                background: 'transparent',
                fontFamily: 'Inter, sans-serif',
              }}
              onClick={() => isMobile && setSidebarOpen(false)}
            >
              Créer un compte
            </Link>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--imx-bg-app)' }}>

      {/* ── Sidebar desktop ── */}
      <div className="hidden lg:flex h-full flex-shrink-0">
        <SidebarContent />
      </div>

      {/* ── Sidebar mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative" onClick={e => e.stopPropagation()}>
            <SidebarContent isMobile />
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Header ── */}
        <header
          className="flex items-center gap-3 px-4 lg:px-5 h-14 flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid var(--imx-border)',
            boxShadow: '0 1px 0 var(--imx-border)',
          }}
        >
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ color: 'var(--imx-text-secondary)', background: 'var(--imx-surface-2)' }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          {/* Logo mobile */}
          <Link to="/web" className="lg:hidden flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)' }}
            >
              <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
            </div>
            <span
              className="font-black text-sm"
              style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}
            >
              ImoFlex
            </span>
          </Link>

          {/* Search bar */}
          <div className="hidden md:flex flex-1 max-w-lg">
            <Link
              to="/web/annonces"
              className="flex items-center gap-2.5 w-full px-3.5 py-2 rounded-xl text-sm transition-colors group"
              style={{
                background: 'var(--imx-surface-2)',
                border: '1.5px solid var(--imx-border)',
                color: 'var(--imx-text-muted)',
                fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-accent)';
                (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-border)';
                (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)';
              }}
            >
              <Search size={14} style={{ flexShrink: 0 }} />
              <span className="flex-1">Rechercher un logement, une ville…</span>
              <span
                className="hidden lg:flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{
                  background: 'var(--imx-border)',
                  color: 'var(--imx-text-muted)',
                  fontFamily: 'Inter, monospace',
                }}
              >
                ⌘K
              </span>
            </Link>
          </div>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-1.5">

            {/* Search icon mobile */}
            <Link
              to="/web/annonces"
              className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
              style={{ color: 'var(--imx-text-secondary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Search size={17} />
            </Link>

            {/* Quick action button for owners & agencies */}
            {(role === 'proprietaire' || role === 'agence') && (
              <Link
                to={role === 'agence' ? '/web/agence/publier' : '/web/pro/publier'}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all shadow-sm"
                style={{
                  background: 'var(--imx-accent)',
                  fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#6A35C7'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--imx-accent)'; }}
              >
                <Plus size={14} />
                <span>Publier</span>
              </Link>
            )}

            {/* Notifications bell */}
            <Link
              to="/web/notifications"
              className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
              style={{ color: 'var(--imx-text-secondary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                  style={{ background: '#EF4444', border: '1.5px solid white' }}
                />
              )}
            </Link>

            {/* User menu */}
            {user && profile ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl transition-colors"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <UserAvatar
                    src={userPhoto}
                    name={profile.full_name}
                    size="sm"
                    shape="circle"
                    className="ring-1 ring-purple-200"
                  />
                  <span
                    className="hidden md:block text-sm font-medium max-w-[96px] truncate"
                    style={{ color: 'var(--imx-text-primary)' }}
                  >
                    {profile.full_name?.split(' ')[0]}
                  </span>
                  <ChevronDown size={13} style={{ color: 'var(--imx-text-muted)' }} />
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div
                      className="absolute right-0 top-full mt-2 w-56 rounded-2xl z-20 overflow-hidden"
                      style={{
                        background: 'var(--imx-surface)',
                        border: '1px solid var(--imx-border)',
                        boxShadow: '0 8px 32px rgba(17, 13, 38, 0.12), 0 2px 8px rgba(17, 13, 38, 0.06)',
                      }}
                    >
                      {/* User info */}
                      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--imx-border)' }}>
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            src={userPhoto}
                            name={profile.full_name}
                            size="lg"
                            shape="circle"
                            className="ring-2 ring-purple-100"
                          />
                          <div className="min-w-0">
                            <p
                              className="text-sm font-semibold truncate"
                              style={{ color: 'var(--imx-text-primary)', fontFamily: 'Inter, sans-serif' }}
                            >
                              {profile.full_name}
                            </p>
                            {roleConfig && (
                              <span
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: roleConfig.bg, color: roleConfig.color, fontFamily: 'Inter, sans-serif' }}
                              >
                                {roleConfig.label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Menu items */}
                      <div className="py-1.5">
                        {[
                          { to: '/web/profil',        icon: User,      label: 'Mon profil' },
                          { to: '/web/notifications', icon: Bell,      label: 'Notifications' },
                          { to: '/web/aide',           icon: HelpCircle, label: 'Aide' },
                        ].map(item => (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                            style={{
                              color: 'var(--imx-text-secondary)',
                              fontFamily: 'Inter, sans-serif',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--imx-text-primary)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--imx-text-secondary)'; }}
                          >
                            <item.icon size={15} />
                            {item.label}
                          </Link>
                        ))}

                        {role === 'admin' && (
                          <Link
                            to="/admin"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                            style={{ color: '#DC2626', fontFamily: 'Inter, sans-serif' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                          >
                            <Settings size={15} />
                            Console admin
                          </Link>
                        )}
                      </div>

                      <div style={{ borderTop: '1px solid var(--imx-border)' }} className="py-1.5">
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setShowLogoutConfirm(true);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors"
                          style={{ color: '#EF4444', fontFamily: 'Inter, sans-serif' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#FEF2F2'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                        >
                          <LogOut size={15} />
                          Déconnexion
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/web/login"
                  className="hidden sm:flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    color: 'var(--imx-text-secondary)',
                    border: '1.5px solid var(--imx-border)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--imx-surface-2)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-accent)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--imx-accent)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = '';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--imx-border)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--imx-text-secondary)';
                  }}
                >
                  Connexion
                </Link>
                <Link
                  to="/web/register"
                  className="flex items-center px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{
                    background: 'var(--imx-accent)',
                    boxShadow: '0 2px 8px rgba(123, 63, 228, 0.25)',
                    fontFamily: 'Inter, sans-serif',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = '#6A35C7';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(123, 63, 228, 0.35)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--imx-accent)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(123, 63, 228, 0.25)';
                  }}
                >
                  S'inscrire
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* ── Page content ── */}
        <main
          className="flex-1 overflow-y-auto web-scrollbar pb-14 lg:pb-0"
          style={{ background: 'var(--imx-bg-app)' }}
        >
          <div className="web-fade-in h-full min-h-full flex flex-col">
            <Outlet />
          </div>
        </main>

        {/* ── Bottom Navigation Mobile (lg:hidden) ── */}
        <nav
          className="lg:hidden flex-shrink-0 flex items-center justify-around border-t bg-white/95 backdrop-blur-md"
          style={{
            borderColor: 'var(--imx-border)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {getBottomNavItems(role, unreadCount).map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all ${
                  item.isPrimary ? 'relative' : ''
                }`}
              >
                {item.isPrimary ? (
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md -mt-4"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    <Icon size={22} />
                  </div>
                ) : (
                  <>
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        active
                          ? 'bg-purple-50 text-[var(--imx-accent)]'
                          : 'text-gray-400'
                      }`}
                    >
                      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                      {item.badge && item.badge > 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-semibold truncate ${
                        active ? 'text-[var(--imx-accent)]' : 'text-gray-400'
                      }`}
                    >
                      {item.label}
                    </span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Modal de confirmation de déconnexion ── */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border space-y-5 animate-scaleUp"
            style={{ borderColor: 'var(--imx-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                <LogOut size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                  Confirmer la déconnexion
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Voulez-vous vraiment vous déconnecter ?
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
              Vous devrez vous reconnecter pour accéder à nouveau à votre tableau de bord et à vos données.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors border"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowLogoutConfirm(false);
                  await handleSignOut();
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
              >
                Oui, me déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
