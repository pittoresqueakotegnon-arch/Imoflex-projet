import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return (
    <div
      className={`bg-[var(--imx-border)] animate-pulse rounded-md ${className}`}
      style={style}
    />
  );
};

export const ListingCardSkeleton: React.FC<{ horizontal?: boolean }> = ({ horizontal }) => {
  if (horizontal) {
    return (
      <div className="listing-card-h p-0 flex items-stretch animate-pulse">
        <div className="w-[110px] bg-[var(--imx-border)]" />
        <div className="flex-1 p-3 flex flex-col justify-between">
          <div>
            <div className="h-4 bg-[var(--imx-border)] rounded w-3/4 mb-2" />
            <div className="h-3 bg-[var(--imx-border)] rounded w-1/2" />
          </div>
          <div className="h-5 bg-[var(--imx-border)] rounded w-24 mt-3" />
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="h-[210px] w-full bg-[var(--imx-border)]" />
      <div className="p-3.5 space-y-2">
        <div className="h-5 bg-[var(--imx-border)] rounded w-1/3 mb-1" />
        <div className="h-4 bg-[var(--imx-border)] rounded w-3/4" />
        <div className="h-3 bg-[var(--imx-border)] rounded w-1/2" />
        <div className="h-5 bg-[var(--imx-border)] rounded w-1/4 mt-2" />
      </div>
    </div>
  );
};
