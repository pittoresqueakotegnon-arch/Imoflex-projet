import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  List,
  CreditCard,
  FileText,
  Settings,
  LogOut,
  Zap,
  Sun,
  Moon
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useAdminTheme } from '../hooks/useAdminTheme';

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { theme, toggle } = useAdminTheme();

  const isDark = theme === 'dark';

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Erreur de déconnexion:', error);
    }
  };

  const menuItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Tableau de bord' },
    { path: '/admin/annonces', icon: List, label: 'Annonces' },
    { path: '/admin/utilisateurs', icon: Users, label: 'Utilisateurs' },
    { path: '/admin/transactions', icon: CreditCard, label: 'Transactions' },
    { path: '/admin/logs', icon: FileText, label: 'Audit Logs' },
    { path: '/admin/config', icon: Settings, label: 'Configuration' },
  ];

  return (
    <div
      className={`admin-shell ${theme} flex h-screen w-full overflow-hidden`}
      style={{ background: 'var(--adm-bg)', color: 'var(--adm-text)' }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="w-64 flex flex-col border-r flex-shrink-0"
        style={{
          background: 'var(--adm-surface)',
          borderColor: 'var(--adm-border)',
        }}
      >
        {/* Logo */}
        <div
          className="px-6 py-5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--adm-border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: '#120D2A' }}
            >
              <img src="/assets/logo-favicon-imoflex.png" alt="ImoFlex Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <p
                className="font-bold text-sm leading-none"
                style={{ color: 'var(--adm-text)', fontFamily: 'Space Grotesk' }}
              >
                ImoFlex
              </p>
              <p
                className="text-[10px] mt-0.5 uppercase tracking-wider"
                style={{ color: 'var(--adm-text-dim)' }}
              >
                Admin Console
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-sm"
                style={
                  isActive
                    ? {
                        background: 'rgba(124, 58, 237, 0.12)',
                        color: 'var(--adm-accent)',
                        fontWeight: 600,
                      }
                    : { color: 'var(--adm-text-muted)' }
                }
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--adm-hover)';
                    (e.currentTarget as HTMLElement).style.color = 'var(--adm-text)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'var(--adm-text-muted)';
                  }
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {isActive && (
                  <span
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--adm-accent)' }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="px-3 py-4 border-t space-y-1 flex-shrink-0"
          style={{ borderColor: 'var(--adm-border)' }}
        >
          {/* Theme Toggle */}
          <button
            onClick={toggle}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors"
            style={{ color: 'var(--adm-text-muted)' }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--adm-hover)';
              (e.currentTarget as HTMLElement).style.color = 'var(--adm-text)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--adm-text-muted)';
            }}
            title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
            <span>{isDark ? 'Mode clair' : 'Mode sombre'}</span>
            {/* Pill indicator */}
            <span
              className="ml-auto flex items-center w-9 h-5 rounded-full transition-colors duration-300 relative flex-shrink-0"
              style={{ background: isDark ? '#334155' : 'rgba(124,58,237,0.2)' }}
            >
              <span
                className="absolute w-3.5 h-3.5 rounded-full transition-all duration-300"
                style={{
                  background: isDark ? '#64748B' : '#7C3AED',
                  left: isDark ? '3px' : '19px',
                  top: '3px',
                }}
              />
            </span>
          </button>

          {/* Logout */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors text-red-400 hover:bg-red-500/10"
          >
            <LogOut size={17} />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        className="flex-1 h-full overflow-y-auto"
        style={{ background: 'var(--adm-bg)' }}
      >
        <div className="p-8 max-w-7xl mx-auto min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
