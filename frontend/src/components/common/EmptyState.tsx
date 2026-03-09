import React from 'react';

interface EmptyStateProps {
  message: string;
  subMessage?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ message, subMessage }) => (
  <div className="flex flex-col items-center justify-center h-full gap-2" style={{ minHeight: 200 }}>
    <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
      {message}
    </div>
    {subMessage && (
      <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {subMessage}
      </div>
    )}
  </div>
);

export default EmptyState;
