import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Search, Heart, User, LogOut, Settings,
  Building2, CreditCard, FileText, ClipboardList,
  LayoutDashboard, Plus, Bell, Menu, X, ChevronDown,
  Wallet, Users, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';

/* ─────────────────────────────────────────────────────────────
   WebLayout — layout desktop/tablette pour la version web
   Sidebar adaptée par rôle + header fixe + contenu scrollable
───────────────────────────────────────────────────────────── */

function getNavItems(role: string | null) {
  if (role === 'locataire') {
    return [
      { icon: LayoutDashboard, label: 'Mon espace', path: '/web/dashboard' },
      { icon: CreditCard, label: 'Paiements', path: '/web/paiements' },
      { icon: FileText, label: 'Documents', path: '/web/documents' },
      { icon: Search, label: 'Rechercher', path: '/web/annonces' },
      { icon: Heart, label: 'Favoris', path: '/web/favoris' },
      { icon: Bell, label: 'Notifications', path: '/web/notifications' },
      { icon: User, label: 'Mon profil', path: '/web/profil' },
    ];
  }
  if (role === 'proprietaire') {
    return [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/web/pro/dashboard' },
      { icon: Building2, label: 'Mes annonces', path: '/web/pro/annonces' },
      { icon: Plus, label: 'Publier', path: '/web/pro/publier' },
      { icon: ClipboardList, label: 'Demandes', path: '/web/pro/demandes' },
      { icon: Users, label: 'Mes locataires', path: '/web/pro/locataires' },
      { icon: Wallet, label: 'Wallet & loyers', path: '/web/pro/wallet' },
      { icon: ShieldCheck, label: 'Vérification', path: '/web/pro/verification' },
      { icon: Bell, label: 'Notifications', path: '/web/notifications' },
      { icon: User, label: 'Mon profil', path: '/web/profil' },
    ];
  }
  if (role === 'agence') {
    return [
      { icon: LayoutDashboard, label: 'Tableau de bord', path: '/web/agence/dashboard' },
      { icon: Building2, label: 'Annonces', path: '/web/agence/annonces' },
      { icon: Plus, label: 'Publier', path: '/web/agence/publier' },
      { icon: ClipboardList, label: 'Demandes', path: '/web/agence/demandes' },
      { icon: Settings, label: 'Profil agence', path: '/web/agence/profil' },
      { icon: Bell, label: 'Notifications', path: '/web/notifications' },
      { icon: User, label: 'Mon profil', path: '/web/profil' },
    ];
  }
  // Visiteur
  return [
    { icon: Home, label: 'Accueil', path: '/web' },
    { icon: Search, label: 'Rechercher', path: '/web/annonces' },
    { icon: Heart, label: 'Favoris', path: '/web/favoris' },
  ];
}

function getRoleBadge(role: string | null) {
  const map: Record<string, { label: string; color: string }> = {
    locataire:    { label: 'Locataire',    color: '#3B82F6' },
    proprietaire: { label: 'Propriétaire', color: '#7B3FE4' },
    agence:       { label: 'Agence',       color: '#10B981' },
    admin:        { label: 'Admin',        color: '#EF4444' },
  };
  return map[role ?? ''] ?? null;
}

export default function WebLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, role, signOut } = useAuth();
  const { unreadCount } = useNotifications(user?.id);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems = getNavItems(role);
  const roleBadge = getRoleBadge(role);

  const isActive = (path: string) => {
    if (path === '/web' && location.pathname !== '/web') return false;
    return location.pathname.startsWith(path) && (path !== '/web' || location.pathname === '/web');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/web');
  };

  const Sidebar = ({ isMobile = false }: { isMobile?: boolean }) => (
    <aside
      className={`flex flex-col h-full ${isMobile ? 'w-72' : 'w-64'}`}
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
        <Link to="/web" className="flex items-center gap-2.5" onClick={() => isMobile && setSidebarOpen(false)}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ background: '#F1EBFF' }}
          >
            <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-sm leading-none" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
              ImoFlex
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--imx-text-muted)' }}>
              Version Web
            </p>
          </div>
        </Link>
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} style={{ color: 'var(--imx-text-muted)' }}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => isMobile && setSidebarOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 relative"
              style={
                active
                  ? {
                      background: 'rgba(123, 63, 228, 0.10)',
                      color: 'var(--imx-accent)',
                      fontWeight: 600,
                    }
                  : {
                      color: 'var(--imx-text-secondary)',
                    }
              }
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
              <Icon size={17} />
              <span>{item.label}</span>
              {item.label === 'Notifications' && unreadCount > 0 && (
                <span
                  className="ml-auto flex items-center justify-center text-white font-bold"
                  style={{
                    minWidth: '18px',
                    height: '18px',
                    borderRadius: '9px',
                    background: '#EF4444',
                    fontSize: '10px',
                    padding: '0 4px',
                  }}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              {active && (
                <span
                  className="absolute right-3 w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--imx-accent)' }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Profile card */}
      {user && profile ? (
        <div
          className="mx-3 mb-3 p-3 rounded-xl border"
          style={{ background: 'var(--imx-surface-2)', borderColor: 'var(--imx-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)', color: '#fff', fontFamily: 'Sora' }}
            >
              {profile.full_name
                ? profile.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--imx-text-primary)' }}>
                {profile.full_name}
              </p>
              {roleBadge && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: `${roleBadge.color}15`, color: roleBadge.color }}
                >
                  {roleBadge.label}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full mt-3 px-2 py-1.5 rounded-lg text-xs transition-colors text-red-400 hover:bg-red-50"
          >
            <LogOut size={13} />
            <span>Déconnexion</span>
          </button>
        </div>
      ) : (
        <div className="mx-3 mb-3 space-y-2">
          <Link
            to="/web/login"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}
            onClick={() => isMobile && setSidebarOpen(false)}
          >
            Se connecter
          </Link>
          <Link
            to="/web/register"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ border: '1px solid var(--imx-border)', color: 'var(--imx-text-secondary)', background: 'transparent' }}
            onClick={() => isMobile && setSidebarOpen(false)}
          >
            Créer un compte
          </Link>
        </div>
      )}
    </aside>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--imx-bg-app)' }}>
      
      {/* ── Sidebar desktop (cachée sur mobile) ── */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
      </div>

      {/* ── Sidebar mobile (overlay) ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative" onClick={e => e.stopPropagation()}>
            <Sidebar isMobile />
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Header ── */}
        <header
          className="flex items-center gap-4 px-4 lg:px-6 h-14 flex-shrink-0"
          style={{
            background: 'var(--imx-surface)',
            borderBottom: '1px solid var(--imx-border)',
            boxShadow: '0 1px 0 var(--imx-border)',
          }}
        >
          {/* Mobile menu toggle */}
          <button
            className="lg:hidden p-2 rounded-lg"
            onClick={() => setSidebarOpen(true)}
            style={{ color: 'var(--imx-text-secondary)' }}
          >
            <Menu size={20} />
          </button>

          {/* Logo mobile */}
          <Link to="/web" className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg overflow-hidden" style={{ background: '#F1EBFF' }}>
              <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-sm" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>
              ImoFlex
            </span>
          </Link>

          {/* Search bar desktop */}
          <div className="hidden md:flex flex-1 max-w-md">
            <Link
              to="/web/annonces"
              className="flex items-center gap-2 w-full px-4 py-2 rounded-xl text-sm transition-colors"
              style={{
                background: 'var(--imx-surface-2)',
                border: '1px solid var(--imx-border)',
                color: 'var(--imx-text-muted)',
              }}
            >
              <Search size={15} />
              <span>Rechercher un logement, une ville…</span>
            </Link>
          </div>

          <div className="flex-1" />

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Notifications bell */}
            <Link
              to="/web/notifications"
              className="relative p-2 rounded-xl transition-colors hover:bg-[var(--imx-surface-2)]"
              style={{ color: 'var(--imx-text-secondary)' }}
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full"
                  style={{ background: '#EF4444' }}
                />
              )}
            </Link>

            {/* User menu */}
            {user && profile ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors hover:bg-[var(--imx-surface-2)]"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)', color: '#fff' }}
                  >
                    {profile.full_name?.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() ?? '?'}
                  </div>
                  <span className="hidden md:block text-sm font-medium max-w-[100px] truncate" style={{ color: 'var(--imx-text-primary)' }}>
                    {profile.full_name?.split(' ')[0]}
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--imx-text-muted)' }} />
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                    <div
                      className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-lg z-20 py-1"
                      style={{
                        background: 'var(--imx-surface)',
                        border: '1px solid var(--imx-border)',
                        boxShadow: 'var(--imx-card-shadow)',
                      }}
                    >
                      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--imx-border)' }}>
                        <p className="text-xs font-semibold" style={{ color: 'var(--imx-text-primary)' }}>
                          {profile.full_name}
                        </p>
                        {roleBadge && (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                            style={{ background: `${roleBadge.color}15`, color: roleBadge.color }}
                          >
                            {roleBadge.label}
                          </span>
                        )}
                      </div>
                      <Link
                        to="/web/profil"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--imx-surface-2)]"
                        style={{ color: 'var(--imx-text-secondary)' }}
                      >
                        <User size={15} /> Mon profil
                      </Link>
                      <Link
                        to="/web/notifications"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--imx-surface-2)]"
                        style={{ color: 'var(--imx-text-secondary)' }}
                      >
                        <Bell size={15} /> Notifications
                      </Link>
                      {role === 'admin' && (
                        <Link
                          to="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-[var(--imx-surface-2)]"
                          style={{ color: '#EF4444' }}
                        >
                          <Settings size={15} /> Console admin
                        </Link>
                      )}
                      <div className="border-t my-1" style={{ borderColor: 'var(--imx-border)' }} />
                      <button
                        onClick={() => { setUserMenuOpen(false); handleSignOut(); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors hover:bg-red-50 text-red-400"
                      >
                        <LogOut size={15} /> Déconnexion
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/web/login"
                  className="hidden sm:flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-[var(--imx-surface-2)]"
                  style={{ color: 'var(--imx-text-secondary)', border: '1px solid var(--imx-border)' }}
                >
                  Connexion
                </Link>
                <Link
                  to="/web/register"
                  className="flex items-center px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}
                >
                  S'inscrire
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 overflow-y-auto" style={{ background: 'var(--imx-bg-app)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
