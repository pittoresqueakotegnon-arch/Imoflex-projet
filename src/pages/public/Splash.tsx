import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Splash() {
  const navigate = useNavigate();

  const { role, loading } = useAuth();

  useEffect(() => {
    if (loading) return; // Attend que l'auth soit chargée

    const timer = setTimeout(() => {
      if (role === 'admin') {
        navigate('/admin', { replace: true });
      } else if (role === 'proprietaire') {
        navigate('/pro/dashboard', { replace: true });
      } else if (role === 'locataire') {
        navigate('/dashboard', { replace: true });
      } else {
        // Visiteur non connecté :
        // → Onboarding si première visite, sinon Accueil directement
        const hasSeenOnboarding = sessionStorage.getItem('hasSeenOnboarding');
        if (hasSeenOnboarding) {
          navigate('/', { replace: true });
        } else {
          navigate('/onboarding', { replace: true });
        }
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate, role, loading]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0D0720 0%, #1E1545 45%, #120D2A 100%)' }}
    >
      <style>{`
        @keyframes splashLogoIn {
          0% { opacity: 0; transform: scale(0.75); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splashTextIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Logo */}
      <div
        className="w-32 h-32 rounded-full flex items-center justify-center mb-8 overflow-hidden"
        style={{
          boxShadow: '0 12px 48px rgba(123, 63, 228, 0.4), 0 0 0 1px rgba(123,63,228,0.2)',
          opacity: 0,
          animation: 'splashLogoIn 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        }}
      >
        <img
          src="/assets/logo-icon-transparent-recadre.png"
          alt="ImoFlex"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Brand */}
      <h1
        className="text-5xl mb-3"
        style={{
          fontFamily: 'Nunito',
          fontWeight: 900,
          opacity: 0,
          animation: 'splashTextIn 0.6s ease-out 0.4s forwards',
        }}
      >
        <span style={{ color: '#E8E0FF' }}>Imo</span>
        <span style={{ color: '#A855F7' }}>Flex</span>
      </h1>

      <p
        className="text-xs tracking-[0.18em] uppercase"
        style={{
          color: '#8B7BB5',
          fontFamily: 'Space Grotesk',
          letterSpacing: '0.18em',
          opacity: 0,
          animation: 'splashTextIn 0.6s ease-out 0.6s forwards',
        }}
      >
        Trouvez. Louez. Payez à votre rythme.
      </p>

      {/* Pagination dots */}
      <div
        className="absolute bottom-12 flex gap-2 items-center"
        style={{ opacity: 0, animation: 'splashTextIn 0.6s ease-out 0.8s forwards' }}
      >
        <div className="w-6 h-1.5 rounded-full" style={{ background: '#A855F7' }} />
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(139,123,181,0.4)' }} />
      </div>
    </div>
  );
}
