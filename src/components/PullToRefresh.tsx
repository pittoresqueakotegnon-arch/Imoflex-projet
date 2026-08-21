import React, { useState, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { haptics } from '../lib/haptics';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  disabled?: boolean;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  disabled = false,
}) => {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const THRESHOLD = 65;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshing || window.scrollY > 5) return;
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null || disabled || refreshing || window.scrollY > 5) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      // Amortissement logarithmique pour une sensation élastique naturelle
      const damp = Math.min(diff * 0.45, 90);
      setPullY(damp);
      if (damp >= THRESHOLD && pullY < THRESHOLD) {
        haptics.light();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (startYRef.current === null) return;
    startYRef.current = null;

    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(50);
      haptics.medium();
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative w-full"
    >
      {/* Indicateur de pull to refresh */}
      <div
        className="absolute left-0 right-0 top-0 flex items-center justify-center pointer-events-none transition-all duration-200 z-30"
        style={{
          transform: `translateY(${pullY > 0 || refreshing ? pullY - 35 : -40}px)`,
          opacity: pullY > 15 || refreshing ? 1 : 0,
        }}
      >
        <div
          className="w-9 h-9 rounded-full bg-[var(--imx-surface-2)] border border-[var(--imx-border)] shadow-xl flex items-center justify-center text-[var(--imx-accent-light)]"
        >
          <Loader2
            size={18}
            className={`transition-transform ${refreshing ? 'animate-spin' : ''}`}
            style={{ transform: `rotate(${Math.min(pullY * 4, 360)}deg)` }}
          />
        </div>
      </div>

      <div
        style={{
          transform: `translateY(${pullY > 0 ? pullY * 0.5 : 0}px)`,
          transition: pullY === 0 ? 'transform 0.25s ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
