import { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, ArrowRight, User, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { UserAvatar } from '../components/UserAvatar';

export default function PublicLayout() {
  const { user, profile, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const getDashboardPath = () => {
    if (role === 'locataire') return '/web/dashboard';
    if (role === 'proprietaire') return '/web/pro/dashboard';
    if (role === 'agence') return '/web/agence/dashboard';
    if (role === 'admin') return '/admin';
    return '/web/dashboard';
  };

  const handleSignOut = async () => {
    await signOut();
    setUserDropdownOpen(false);
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7FC] text-[#17132B] selection:bg-[#F1EBFF] selection:text-[#7B3FE4]">
      {/* ── HEADER NAVIGATION (Page 1) ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-[#F1EBFF] flex items-center justify-center p-1.5 transition-transform group-hover:scale-105">
              <img
                src="/assets/logo-icon-transparent-recadre.png"
                alt="ImoFlex"
                className="w-full h-full object-contain"
              />
            </div>
            <span
              className="text-2xl font-black tracking-tight text-[#17132B]"
              style={{ fontFamily: 'Sora, sans-serif' }}
            >
              Imo<span className="text-[#7B3FE4]">Flex</span>
            </span>
          </Link>

          {/* Center Links (Desktop) */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              to="/annonces"
              className="text-sm font-semibold text-gray-600 hover:text-[#7B3FE4] transition-colors"
            >
              Louer
            </Link>
            <a
              href="#proprietaires"
              onClick={(e) => {
                if (location.pathname === '/') {
                  e.preventDefault();
                  document.getElementById('proprietaires')?.scrollIntoView({ behavior: 'smooth' });
                } else {
                  navigate('/#proprietaires');
                }
              }}
              className="text-sm font-semibold text-gray-600 hover:text-[#7B3FE4] transition-colors"
            >
              Propriétaires
            </a>
            <a
              href="#agences"
              onClick={(e) => {
                if (location.pathname === '/') {
                  e.preventDefault();
                  document.getElementById('agences')?.scrollIntoView({ behavior: 'smooth' });
                } else {
                  navigate('/#agences');
                }
              }}
              className="text-sm font-semibold text-gray-600 hover:text-[#7B3FE4] transition-colors"
            >
              Agences
            </a>
            <Link
              to="/web/aide"
              className="text-sm font-semibold text-gray-600 hover:text-[#7B3FE4] transition-colors"
            >
              Aide
            </Link>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200/80 hover:bg-gray-100 transition-colors"
                >
                  <UserAvatar
                    src={profile?.avatar_url}
                    name={profile?.full_name}
                    size="sm"
                    shape="rounded"
                  />
                  <span className="text-sm font-medium text-gray-800 max-w-[120px] truncate">
                    {profile?.full_name || 'Mon compte'}
                  </span>
                  <ChevronDown size={14} className="text-gray-500" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-gray-100 shadow-xl py-2 z-50 animate-slideUp">
                    <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-3">
                      <UserAvatar
                        src={profile?.avatar_url}
                        name={profile?.full_name}
                        size="md"
                        shape="rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-500 font-medium">Connecté en tant que</p>
                        <p className="text-sm font-bold text-gray-900 truncate">{profile?.full_name}</p>
                        <p className="text-[11px] text-[#7B3FE4] font-semibold capitalize mt-0.5">{role}</p>
                      </div>
                    </div>
                    <Link
                      to={getDashboardPath()}
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-[#F1EBFF]/60 hover:text-[#7B3FE4] transition-colors font-medium"
                    >
                      <User size={16} />
                      Tableau de bord
                    </Link>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        setShowLogoutConfirm(true);
                      }}
                      className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                    >
                      <LogOut size={16} />
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  to="/web/login"
                  className="text-sm font-semibold text-gray-700 hover:text-[#7B3FE4] px-3.5 py-2 transition-colors"
                >
                  Connexion
                </Link>
                <Link
                  to="/web/register"
                  className="bg-[#7B3FE4] hover:bg-[#682FD0] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md hover:shadow-purple-500/20 active:scale-95"
                >
                  Créer un compte
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <div className="flex md:hidden items-center gap-2">
            {!user && (
              <Link
                to="/web/login"
                className="text-xs font-semibold text-gray-700 hover:text-[#7B3FE4] px-2.5 py-1.5"
              >
                Connexion
              </Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 pt-4 pb-6 space-y-3 shadow-lg">
            <Link
              to="/annonces"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-base font-semibold text-gray-800 hover:bg-gray-50"
            >
              Louer un logement
            </Link>
            <a
              href="#proprietaires"
              onClick={(e) => {
                setMobileMenuOpen(false);
                if (location.pathname === '/') {
                  e.preventDefault();
                  document.getElementById('proprietaires')?.scrollIntoView({ behavior: 'smooth' });
                } else {
                  navigate('/#proprietaires');
                }
              }}
              className="block px-3 py-2.5 rounded-xl text-base font-semibold text-gray-800 hover:bg-gray-50"
            >
              Espace Propriétaires
            </a>
            <a
              href="#agences"
              onClick={(e) => {
                setMobileMenuOpen(false);
                if (location.pathname === '/') {
                  e.preventDefault();
                  document.getElementById('agences')?.scrollIntoView({ behavior: 'smooth' });
                } else {
                  navigate('/#agences');
                }
              }}
              className="block px-3 py-2.5 rounded-xl text-base font-semibold text-gray-800 hover:bg-gray-50"
            >
              Espace Agences
            </a>
            <Link
              to="/web/aide"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 rounded-xl text-base font-semibold text-gray-800 hover:bg-gray-50"
            >
              Centre d'aide
            </Link>

            <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
              {user ? (
                <>
                  <Link
                    to={getDashboardPath()}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#7B3FE4] text-white font-semibold text-sm"
                  >
                    Accéder à mon espace
                    <ArrowRight size={16} />
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowLogoutConfirm(true);
                    }}
                    className="py-2.5 text-center text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl"
                  >
                    Se déconnecter
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/web/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center py-3 rounded-xl bg-[#7B3FE4] text-white font-semibold text-sm shadow-sm"
                  >
                    Créer un compte
                  </Link>
                  <Link
                    to="/web/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
                  >
                    Se connecter
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── FOOTER MINIMALISTE (Page 2) ── */}
      <footer className="border-t border-gray-100 bg-[#FAFAFC] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="text-lg font-black tracking-tight text-[#17132B]">
            Imo<span className="text-[#7B3FE4]">Flex</span>
          </Link>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-gray-500">
            <Link to="/web/aide" className="hover:text-gray-900 transition-colors">Aide</Link>
            <span>·</span>
            <Link to="/web/cgu" className="hover:text-gray-900 transition-colors">Conditions</Link>
            <span>·</span>
            <Link to="/web/politique-confidentialite" className="hover:text-gray-900 transition-colors">Confidentialité</Link>
            <span>·</span>
            <Link to="/web/contact" className="hover:text-gray-900 transition-colors">Contact</Link>
          </div>

          <div className="text-xs text-gray-400">
            © ImoFlex
          </div>
        </div>
      </footer>

      {/* Modal de confirmation de déconnexion */}
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
              Vous devrez vous reconnecter pour accéder à nouveau à votre espace.
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
