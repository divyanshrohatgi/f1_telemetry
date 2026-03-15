import React from 'react';
import type { SessionMetadata, AppMode } from '../../types/f1.types';
import { formatSessionType } from '../../utils/formatting';
import FlagIcon from '../common/FlagIcon';
import { useTheme } from '../../context/ThemeContext';

interface TopBarProps {
  sessionMeta: SessionMetadata | null;
  isLoading: boolean;
  loadingProgress?: number;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const TopBar: React.FC<TopBarProps> = ({
  sessionMeta,
  isLoading,
  loadingProgress = 0,
  mode,
  onModeChange,
}) => {
  const { theme, toggleTheme, isDark } = useTheme();

  // Hide TopBar completely when in home mode (Homepage has its own header)
  if (mode === 'home') return null;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center"
      style={{
        height: 'var(--topbar-height)',
        background: isDark ? '#0D0D0D' : '#FFFFFF',
        borderBottom: `1px solid ${isDark ? '#1E1E1E' : '#E5E5E5'}`,
        boxShadow: isDark ? 'none' : '0 1px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* Loading bar */}
      {isLoading && (
        <div
          className="absolute top-0 left-0 h-0.5 transition-all duration-300"
          style={{ width: `${Math.max(5, loadingProgress)}%`, background: 'var(--color-f1-red)' }}
        />
      )}

      {/* Brand — GridInsight */}
      <button
        onClick={() => onModeChange('home')}
        className="flex items-center px-4 gap-2.5 shrink-0 bg-transparent border-none cursor-pointer"
        style={{
          width: mode === 'analysis' ? 'var(--sidebar-width)' : 'auto',
          borderRight: mode === 'analysis' ? `1px solid ${isDark ? '#1E1E1E' : '#E5E5E5'}` : 'none',
          minWidth: 145,
          height: '100%',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 3, background: 'var(--color-f1-red)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 8, color: '#fff', fontWeight: 900, letterSpacing: '-0.02em' }}>F1</span>
        </div>
        <div className="flex items-baseline">
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.04em', color: isDark ? '#F0F0F0' : '#111' }}>
            GRID
          </span>
          <span style={{ fontWeight: 400, fontSize: 13, letterSpacing: '0.04em', color: 'var(--color-f1-red)' }}>
            INSIGHT
          </span>
        </div>
      </button>

      {/* Mode switcher */}
      <div className="flex items-center gap-1 px-3 shrink-0">
        <ModePill label="HOME" active={false} onClick={() => onModeChange('home')}
          activeColor="#888" isDark={isDark} />
        <ModePill label="LATEST RACE" active={mode === 'latest'} onClick={() => onModeChange('latest')}
          activeColor="var(--color-f1-red)" isDark={isDark} />
        <ModePill label="ANALYSIS" active={mode === 'analysis'} onClick={() => onModeChange('analysis')}
          activeColor="#00FF87" isDark={isDark} />
      </div>

      {/* Session info strip */}
      {mode === 'analysis' && (
        <div className="flex items-center gap-5 px-5 flex-1 overflow-hidden">
          {sessionMeta ? (
            <>
              <FlagIcon country={sessionMeta.country} height={20} />
              <span style={{ fontSize: 12, fontWeight: 700, color: isDark ? '#F0F0F0' : '#111', whiteSpace: 'nowrap' }}>
                {sessionMeta.gp_name}
              </span>
              <Divider isDark={isDark} />
              <span className="label" style={{ whiteSpace: 'nowrap' }}>{formatSessionType(sessionMeta.session_type)}</span>
              <Divider isDark={isDark} />
              <span className="label" style={{ whiteSpace: 'nowrap' }}>{sessionMeta.circuit_name}</span>
              <Divider isDark={isDark} />
              <span className="label" style={{ whiteSpace: 'nowrap' }}>{sessionMeta.date}</span>
              {sessionMeta.weather_summary && (
                <>
                  <Divider isDark={isDark} />
                  <span className="label" style={{ whiteSpace: 'nowrap' }}>{sessionMeta.weather_summary}</span>
                </>
              )}
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00FF87' }} />
                <span style={{ fontSize: 9, color: '#00FF87', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>
                  {Object.keys(sessionMeta.drivers).length} DRIVERS
                </span>
              </div>
            </>
          ) : (
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
              {isLoading ? 'Loading session data…' : 'Select a session to begin'}
            </span>
          )}
        </div>
      )}

      {/* Right: theme toggle */}
      <div className="flex items-center px-3 shrink-0" style={{ marginLeft: mode !== 'analysis' ? 'auto' : 0 }}>
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{
            width: 30, height: 30, borderRadius: 6,
            background: isDark ? '#1A1A1A' : '#F2F2F2',
            border: `1px solid ${isDark ? '#2E2E2E' : '#DDD'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 15, transition: 'all 0.15s',
            color: isDark ? '#888' : '#666',
          }}
        >
          {isDark ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
};

// ---------------------------------------------------------------------------

const ModePill: React.FC<{
  label: string; active: boolean; onClick: () => void;
  activeColor: string; isDark: boolean;
}> = ({ label, active, onClick, activeColor, isDark }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 4,
      border: `1px solid ${active ? activeColor + '88' : isDark ? '#2A2A2A' : '#DDD'}`,
      background: active ? activeColor + '18' : 'transparent',
      color: active ? activeColor : isDark ? '#444' : '#888',
      fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: active ? 'bold' : 'normal',
      letterSpacing: '0.08em', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}
  >
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: active ? activeColor : isDark ? '#333' : '#CCC', display: 'inline-block',
    }} />
    {label}
  </button>
);

const Divider: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div style={{ width: 1, height: 14, background: isDark ? '#2A2A2A' : '#E0E0E0', flexShrink: 0 }} />
);

export default TopBar;
