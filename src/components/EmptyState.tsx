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

const EmptyState: React.FC<EmptyStateProps> = ({ icon, imageSrc, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16">
      {imageSrc ? (
        <div className="w-full max-w-[200px] aspect-square rounded-[32px] overflow-hidden mb-8 shadow-xl relative" style={{ border: '4px solid var(--imx-surface)' }}>
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--imx-bg-app)]/20 to-transparent z-10" />
          <img
            src={imageSrc}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      ) : icon ? (
        <div className="mb-5 opacity-50">
          {icon}
        </div>
      ) : null}
      <h3 className="font-nunito font-800 text-[var(--imx-text-primary)] text-lg mb-2">{title}</h3>
      {description && (
        <p className="text-[var(--imx-text-secondary)] text-sm leading-relaxed mb-8 max-w-[260px]">{description}</p>
      )}
      {action && (
        action.href ? (
          <Link
            to={action.href}
            className="btn-primary px-8"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="btn-primary px-8"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
};

export default EmptyState;
