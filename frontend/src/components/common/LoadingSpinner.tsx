import React from 'react';

interface SkeletonProps {
  height?: number | string;
  className?: string;
}

/** Skeleton loading block — dark theme, no spinner */
const Skeleton: React.FC<SkeletonProps> = ({ height = 200, className = '' }) => (
  <div
    className={`rounded animate-pulse ${className}`}
    style={{
      height,
      background: 'linear-gradient(90deg, #1E1E1E 0%, #252525 50%, #1E1E1E 100%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }}
  />
);

export const PanelSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="p-4 space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} height={i === 0 ? 300 : 40} />
    ))}
  </div>
);

export default Skeleton;
