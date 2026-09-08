import React, { useState } from 'react';
import { Headset } from 'lucide-react';
import { ReportProblemModal } from './ReportProblemModal';

interface HeaderSupportProps {
  className?: string;
  style?: React.CSSProperties;
}

export const HeaderSupport: React.FC<HeaderSupportProps> = ({ className, style }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={className || "relative flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"}
        style={style || {
          width: '44px',
          height: '44px',
          borderRadius: '12px',
          background: 'var(--imx-surface-2)',
          border: '1px solid var(--imx-border)',
        }}
        aria-label="Contacter le support"
      >
        <Headset size={20} className="text-[#7B3FE4]" />
      </button>

      <ReportProblemModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
};
