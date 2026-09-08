import React from 'react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon?: React.ReactNode | null;
  imageSrc?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16">
      <div className="w-32 h-32 mb-8 relative flex items-center justify-center">
        {/* Abstract shapes behind the icon */}
        <div className="absolute inset-0 bg-[var(--imx-accent-xlight)] rounded-full opacity-50 scale-110" />
        <div className="absolute inset-0 bg-[var(--imx-surface)] rounded-[2rem] rotate-12 shadow-sm border border-[var(--imx-border)]" />
        <div className="absolute inset-0 bg-[var(--imx-surface)] rounded-[2rem] -rotate-6 shadow-sm border border-[var(--imx-border)]" />
        
        {/* Main Icon container */}
        <div className="relative z-10 w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border border-[var(--imx-border)] text-[var(--imx-accent)]">
          {icon ? (
            icon
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
          )}
        </div>
      </div>

      <h3 className="font-nunito font-800 text-[var(--imx-text-primary)] text-lg mb-2">{title}</h3>
      
      {description && (
        <p className="text-[var(--imx-text-secondary)] text-sm leading-relaxed mb-8 max-w-[260px] font-space-grotesk">
          {description}
        </p>
      )}
      
      {action && (
        action.href ? (
          <Link
            to={action.href}
            className="btn-primary w-full max-w-[240px]"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="btn-primary w-full max-w-[240px]"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
};

export default EmptyState;
