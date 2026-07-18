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
        navigate('/', { replace: true });
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate, role, loading]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0D0720 0%, #1E1545 45%, #120D2A 100%)' }}
    >
      {/* Logo */}
      <div
        className="w-32 h-32 rounded-full flex items-center justify-center mb-8 overflow-hidden"
        style={{ boxShadow: '0 12px 48px rgba(123, 63, 228, 0.4), 0 0 0 1px rgba(123,63,228,0.2)' }}
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
        style={{ fontFamily: 'Nunito', fontWeight: 900 }}
      >
        <span style={{ color: '#E8E0FF' }}>Imo</span>
        <span style={{ color: '#A855F7' }}>Flex</span>
      </h1>

      <p
        className="text-xs tracking-[0.18em] uppercase"
        style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk', letterSpacing: '0.18em' }}
      >
        Trouvez. Louez. Payez à votre rythme.
      </p>

      {/* Pagination dots */}
      <div className="absolute bottom-12 flex gap-2 items-center">
        <div className="w-6 h-1.5 rounded-full" style={{ background: '#A855F7' }} />
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(139,123,181,0.4)' }} />
      </div>
    </div>
  );
}
