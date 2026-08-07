import React from 'react';

interface ImageSkeletonProps {
  className?: string;
}

export const ImageSkeleton: React.FC<ImageSkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`relative overflow-hidden bg-[#1A1240] ${className}`}
    >
      {/* Shimmer effect */}
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
        style={{
          backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
        }}
      />
    </div>
  );
};
