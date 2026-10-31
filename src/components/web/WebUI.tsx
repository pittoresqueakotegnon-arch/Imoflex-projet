import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   ImoFlex Web UI Primitives (Lot 1 — Fondations SaaS)
   Composants standardisés pour toute la plateforme Web.
───────────────────────────────────────────────────────────── */

/* ── 1. WebButton ── */
export interface WebButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const WebButton: React.FC<WebButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'text-xs py-1.5 px-3 rounded-lg',
    md: 'text-sm py-2 px-4 rounded-xl',
    lg: 'text-base py-3 px-6 rounded-2xl',
  };

  const variantClasses = {
    primary: 'web-btn-primary',
    secondary: 'web-btn-secondary',
    outline: 'web-btn-outline',
    ghost: 'web-btn-ghost',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  };

  return (
    <button
      className={`web-btn ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={size === 'sm' ? 12 : 16} className="animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
      {!loading && iconRight && <span className="flex-shrink-0">{iconRight}</span>}
    </button>
  );
};

/* ── 2. WebBadge ── */
export interface WebBadgeProps {
  children: React.ReactNode;
  variant?: 'purple' | 'success' | 'warning' | 'danger' | 'neutral';
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const WebBadge: React.FC<WebBadgeProps> = ({
  children,
  variant = 'purple',
  dot = false,
  size = 'md',
  className = '',
}) => {
  const variantClasses = {
    purple: 'web-badge-purple',
    success: 'web-badge-success',
    warning: 'web-badge-warning',
    danger: 'web-badge-danger',
    neutral: 'web-badge-neutral',
  };

  const dotColors = {
    purple: 'bg-[#7B3FE4]',
    success: 'bg-[#10B981]',
    warning: 'bg-[#F59E0B]',
    danger: 'bg-[#EF4444]',
    neutral: 'bg-gray-400',
  };

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span className={`web-badge ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      <span>{children}</span>
    </span>
  );
};

/* ── 3. WebCard ── */
export interface WebCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const WebCard: React.FC<WebCardProps> = ({
  children,
  hover = false,
  padding = 'md',
  className = '',
  ...props
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8',
  };

  return (
    <div
      className={`web-card ${hover ? 'web-card-hover cursor-pointer' : ''} ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

/* ── 4. WebPageHeader ── */
export interface WebPageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

export const WebPageHeader: React.FC<WebPageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  backHref,
  backLabel,
}) => {
  return (
    <div className="web-page-header">
      <div>
        {backHref && (
          <Link
            to={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[var(--imx-primary)] transition-colors mb-2"
          >
            <span>← {backLabel || 'Retour'}</span>
          </Link>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="web-page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="web-page-subtitle">{subtitle}</p>}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0 mt-3 sm:mt-0">
          {actions}
        </div>
      )}
    </div>
  );
};

/* ── 5. WebInput ── */
export interface WebInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const WebInput: React.FC<WebInputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightElement,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || props.name;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="web-label">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3.5 text-gray-400 pointer-events-none flex-shrink-0">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={`web-input ${leftIcon ? 'pl-10' : ''} ${rightElement ? 'pr-12' : ''} ${
            error ? '!border-red-500 !ring-red-100' : ''
          } ${className}`}
          {...props}
        />
        {rightElement && (
          <span className="absolute right-3 text-gray-400 flex items-center">
            {rightElement}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-[11px] font-semibold text-red-500 mt-1">{error}</p>
      ) : helperText ? (
        <p className="text-[11px] text-gray-400 mt-1">{helperText}</p>
      ) : null}
    </div>
  );
};

/* ── 6. WebEmptyState ── */
export interface WebEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export const WebEmptyState: React.FC<WebEmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="py-16 px-4 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-3xl bg-[var(--imx-primary-subtle)] text-[var(--imx-primary)] flex items-center justify-center mb-4 border border-[var(--imx-primary-border)] shadow-xs">
        {icon}
      </div>
      <h3 className="font-extrabold text-base text-gray-900 mb-1" style={{ fontFamily: 'Sora' }}>
        {title}
      </h3>
      {description && (
        <p className="text-xs text-gray-500 max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        action.href ? (
          <Link to={action.href} className="web-btn web-btn-primary">
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className="web-btn web-btn-primary">
            {action.label}
          </button>
        )
      )}
    </div>
  );
};

/* ── 7. WebSkeleton ── */
export const WebSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return <div className={`web-skeleton ${className}`} />;
};
