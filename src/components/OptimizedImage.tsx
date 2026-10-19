import React, { useState, useEffect } from 'react';
import { ImageSkeleton } from './ImageSkeleton';
import { getOptimizedUrl } from '../lib/utils';
import { Building2 } from 'lucide-react';

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

  // Détermination de l'URL initiale optimisée
  const resolveInitialSrc = (url: string) => {
    if (!url) return '';
    // Si l'URL n'a pas d'extension, utiliser getOptimizedUrl
    if (!url.match(/\.[a-zA-Z0-9]+(\?.*)?$/)) {
      return getOptimizedUrl(url, 'medium') || url;
    }
    return url;
  };

  const [activeSrc, setActiveSrc] = useState(() => resolveInitialSrc(src));

  useEffect(() => {
    setIsLoaded(false);
    setError(false);
    setActiveSrc(resolveInitialSrc(src));
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
          
          // Chaîne de fallbacks intelligents
          if (activeSrc.endsWith('_medium.webp')) {
            // Tenter _thumb.webp
            setActiveSrc(activeSrc.replace('_medium.webp', '_thumb.webp'));
            return;
          }
          if (activeSrc.endsWith('_thumb.webp')) {
            // Tenter _hd.webp
            setActiveSrc(activeSrc.replace('_thumb.webp', '_hd.webp'));
            return;
          }
          if (fallbackSrc && activeSrc !== fallbackSrc) {
            setIsLoaded(false);
            setActiveSrc(fallbackSrc);
            return;
          }
          // Si l'URL initiale était différente de src brute
          if (activeSrc !== src) {
            setIsLoaded(false);
            setActiveSrc(src);
            return;
          }
          setError(true);
          setIsLoaded(true);
        }}
        {...props}
      />
      
      {error && (
        <div className="absolute inset-0 bg-gray-100 flex flex-col items-center justify-center text-gray-400 gap-1 p-2">
          <Building2 size={24} className="text-gray-300" />
          <span className="text-[10px] font-space-grotesk text-center">Image indisponible</span>
        </div>
      )}
    </div>
  );
};


