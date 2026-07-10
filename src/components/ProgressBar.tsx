import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
  className?: string;
  showPercent?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  className = '',
  showPercent = false
}) => {
  const percentage = Math.min((current / total) * 100, 100);

  return (
    <div className={className}>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      {showPercent && (
        <span className="text-xs text-[#8B7BB5] mt-1 block">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
};

export default ProgressBar;
