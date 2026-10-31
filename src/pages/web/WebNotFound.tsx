import { Link, useNavigate } from 'react-router-dom';
import { Home, Search, ArrowLeft, Building2 } from 'lucide-react';

export default function WebNotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16 text-center">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-sm"
        style={{ background: '#F1EBFF', color: 'var(--imx-accent)' }}
      >
        <Building2 size={40} />
      </div>

      <span
        className="text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3"
        style={{ background: '#F1EBFF', color: 'var(--imx-accent)' }}
      >
        Erreur 404
      </span>

      <h1
        className="text-3xl sm:text-4xl font-black mb-3"
        style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
      >
        Page introuvable
      </h1>

      <p
        className="text-sm sm:text-base max-w-md mb-8 leading-relaxed"
        style={{ color: 'var(--imx-text-secondary)' }}
      >
        L'adresse que vous avez saisie n'existe pas ou la page a été déplacée. Retrouvez vos repères ci-dessous.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-sm">
        <button
          onClick={() => navigate(-1)}
          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
          style={{
            background: 'var(--imx-surface)',
            border: '1px solid var(--imx-border)',
            color: 'var(--imx-text-primary)',
          }}
        >
          <ArrowLeft size={16} />
          Retour
        </button>

        <Link
          to="/web/annonces"
          className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
          style={{
            background: 'var(--imx-surface-2)',
            border: '1px solid var(--imx-border)',
            color: 'var(--imx-text-primary)',
          }}
        >
          <Search size={16} />
          Annonces
        </Link>

        <Link
          to="/web"
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold text-white shadow-md transition-all hover:opacity-95"
          style={{ background: 'var(--imx-accent)' }}
        >
          <Home size={16} />
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
