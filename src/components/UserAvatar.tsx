import React, { useState, useEffect } from 'react';

export interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'rounded';
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_CLASSES: Record<string, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-7 h-7 text-xs font-bold',
  md: 'w-8 h-8 text-xs font-black',
  lg: 'w-10 h-10 text-sm font-black',
  xl: 'w-24 h-24 text-2xl font-black',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  name,
  size = 'md',
  shape = 'circle',
  className = '',
  style,
}) => {
  const [imgError, setImgError] = useState(false);

  // Reset error when src changes
  useEffect(() => {
    setImgError(false);
  }, [src]);

  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : '?';

  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  const showImg = Boolean(src && !imgError);

  return (
    <div
      className={`relative flex items-center justify-center flex-shrink-0 overflow-hidden select-none ${shapeClass} ${sizeClass} ${className}`}
      style={{
        background: 'linear-gradient(135deg, #7B3FE4, #A855F7)',
        color: '#FFFFFF',
        fontFamily: 'Sora, sans-serif',
        ...style,
      }}
    >
      {showImg ? (
        <img
          src={src as string}
          alt={name || 'Photo utilisateur'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="leading-none">{initials}</span>
      )}
    </div>
  );
};

export default UserAvatar;
