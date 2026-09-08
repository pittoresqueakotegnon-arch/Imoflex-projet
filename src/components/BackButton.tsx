import React from 'react';
import { useNavigate } from 'react-router-dom';
import { haptics } from '../lib/haptics';

export const BackButton: React.FC = () => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => {
        haptics.light();
        navigate(-1);
      }}
      className="flex items-center gap-1.5 text-[var(--imx-accent-light)] font-space-grotesk font-semibold text-[15px] -ml-2 p-2 hover:opacity-80 transition-opacity"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"></line>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      Retour
    </button>
  );
};
