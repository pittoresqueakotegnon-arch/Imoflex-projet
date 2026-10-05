import React, { useState, useEffect } from 'react';
import { ImageSkeleton } from './ImageSkeleton';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  skeletonClassName?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  fallbackSrc,
  alt,
  className = '',
  skeletonClassName = '',
  loading = 'lazy',
  fetchPriority,
  onError: onImageError,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [activeSrc, setActiveSrc] = useState(src);

  useEffect(() => {
    setIsLoaded(false);
    setError(false);
    setActiveSrc(src);
  }, [src]);

  return (
    <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
      {!isLoaded && !error && (
        <ImageSkeleton className={`absolute inset-0 w-full h-full ${skeletonClassName}`} />
      )}
      
      <img
        src={activeSrc}
        alt={alt}
        decoding="async"
        loading={loading}
        fetchPriority={fetchPriority}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          isLoaded ? 'opacity-100' : 'opacity-90'
        }`}
        onLoad={() => setIsLoaded(true)}
        onError={(event) => {
          onImageError?.(event);
          if (fallbackSrc && activeSrc !== fallbackSrc) {
            setIsLoaded(false);
            setActiveSrc(fallbackSrc);
            return;
          }
          setError(true);
          setIsLoaded(true);
        }}
        {...props}
      />
      
      {error && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-grotesk">
          Image non disponible
        </div>
      )}
    </div>
  );
};

