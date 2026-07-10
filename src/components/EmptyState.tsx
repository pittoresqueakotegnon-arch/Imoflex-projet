import React from 'react';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon?: React.ReactNode | null;
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
      {icon && (
        <div className="mb-5 opacity-50">
          {icon}
        </div>
      )}
      <h3 className="font-nunito font-800 text-[#E8E0FF] text-lg mb-2">{title}</h3>
      {description && (
        <p className="text-[#8B7BB5] text-sm leading-relaxed mb-8 max-w-[260px]">{description}</p>
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
