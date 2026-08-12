import React, { useState, useEffect } from 'react';
import { ImageSkeleton } from './ImageSkeleton';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  skeletonClassName?: string;
  loading?: 'lazy' | 'eager';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className = '',
  skeletonClassName = '',
  loading = 'lazy',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Reset state if src changes
    setIsLoaded(false);
    setError(false);
  }, [src]);

  return (
    <div className={`relative ${className}`}>
      {!isLoaded && !error && (
        <ImageSkeleton className={`absolute inset-0 w-full h-full ${skeletonClassName}`} />
      )}
      
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        } ${className}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setError(true);
          setIsLoaded(true); // Stop showing skeleton on error
        }}
        loading={loading}
        {...props}
      />
      
      {error && (
        <div className="absolute inset-0 bg-[var(--imx-surface)] flex items-center justify-center text-[var(--imx-text-secondary)] text-xs font-grotesk">
          Image non disponible
        </div>
      )}
    </div>
  );
};
