import React from 'react';
import type { TabView } from '../../types/f1.types';

interface Tab {
  id: TabView;
  label: string;
  requiresSession?: boolean;
  requiresDrivers?: number;  // minimum selected drivers
}

const TABS: Tab[] = [
  { id: 'laps',        label: 'LAP TIMES',   requiresSession: true, requiresDrivers: 1 },
  { id: 'telemetry',   label: 'TELEMETRY',   requiresSession: true, requiresDrivers: 1 },
  { id: 'comparison',  label: 'COMPARISON',  requiresSession: true, requiresDrivers: 2 },
  { id: 'strategy',    label: 'STRATEGY',    requiresSession: true },
  { id: 'weather',     label: 'WEATHER',     requiresSession: true },
  { id: 'degradation', label: 'PITSENSE™',   requiresSession: true },
];

interface TabNavProps {
  activeTab: TabView;
  onTabChange: (tab: TabView) => void;
  hasSession: boolean;
  selectedDriverCount: number;
}

const TabNav: React.FC<TabNavProps> = ({
  activeTab,
  onTabChange,
  hasSession,
  selectedDriverCount,
}) => {
  return (
    <div
      className="flex items-center gap-0 shrink-0"
      style={{ borderBottom: '1px solid var(--color-border)' }}
    >
      {TABS.map((tab) => {
        const disabled =
          (tab.requiresSession && !hasSession) ||
          (tab.requiresDrivers != null && selectedDriverCount < tab.requiresDrivers);
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => !disabled && onTabChange(tab.id)}
            disabled={disabled}
            className="px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider transition-all duration-150 relative"
            style={{
              color: isActive
                ? 'var(--color-text-primary)'
                : disabled
                ? 'var(--color-text-tertiary)'
                : 'var(--color-text-secondary)',
              background: isActive ? 'var(--color-panel)' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--color-f1-red)' : '2px solid transparent',
              cursor: disabled ? 'not-allowed' : 'pointer',
              letterSpacing: '0.12em',
            }}
          >
            {tab.label}
            {tab.requiresDrivers === 2 && selectedDriverCount < 2 && !disabled && (
              <span
                className="ml-1 text-2xs"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                (select 2)
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default TabNav;
