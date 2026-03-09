/**
 * F1 Telemetry Dashboard — Root component.
 *
 * Two modes:
 *   latest   → LatestRaceDashboard (f1-dash style timing table, auto-loads latest GP)
 *   analysis → Historical session analysis (laps / telemetry / comparison / strategy / weather)
 */

import React, { useState, useCallback, useEffect } from 'react';
import './styles/globals.css';

import TopBar from './components/TopBar/TopBar';
import SessionSelector from './components/SessionSelector/SessionSelector';
import DriverSidebar from './components/DriverSidebar/DriverSidebar';
import TabNav from './components/common/TabNav';
import LapChart from './components/LapChart/LapChart';
import TelemetryView from './components/TelemetryPlot/TelemetryView';
import DriverComparison from './components/DriverComparison/DriverComparison';
import StrategyViewer from './components/StrategyViewer/StrategyViewer';
import WeatherPanel from './components/WeatherPanel/WeatherPanel';
import PitSense from './components/DegradationPredictor/PitSense';
import EmptyState from './components/common/EmptyState';
import LatestRaceDashboard from './components/LatestRace/LatestRaceDashboard';

import { useSessionData } from './hooks/useSessionData';
import type { AppMode, TabView, SessionMetadata } from './types/f1.types';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('latest');

  const {
    season,
    sessionMeta,
    isLoadingSchedule,
    isLoadingSession,
    error,
    loadSeason,
    loadSession,
  } = useSessionData();

  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [hoveredDriver, setHoveredDriver] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabView>('laps');
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

  // Dynamic page title for SEO / tab clarity
  useEffect(() => {
    if (mode === 'latest') {
      document.title = 'GridInsight — Latest Race';
    } else if (sessionMeta) {
      document.title = `${sessionMeta.gp_name} ${sessionMeta.session_type} ${sessionMeta.year} — GridInsight`;
    } else {
      document.title = 'GridInsight — F1 Telemetry & Race Analysis';
    }
  }, [mode, sessionMeta]);

  const handleYearChange = useCallback(
    (year: number) => loadSeason(year),
    [loadSeason]
  );

  const handleSessionSelect = useCallback(
    (year: number, gp: string, sessionType: string) => {
      setSelectedDrivers([]);
      setSelectedLap(null);
      setActiveTab('laps');
      loadSession(year, gp, sessionType);
    },
    [loadSession]
  );

  const handleDriverToggle = useCallback((code: string) => {
    setSelectedDrivers((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      return [...prev, code];
    });
  }, []);

  const handleCompare = useCallback(() => {
    setActiveTab('comparison');
  }, []);

  const handleLapSelect = useCallback((lap: number, _driver?: string) => {
    setSelectedLap(lap);
    setActiveTab('telemetry');
  }, []);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      {/* Top bar — always shown, carries mode switcher */}
      <TopBar
        sessionMeta={sessionMeta}
        isLoading={isLoadingSession}
        loadingProgress={isLoadingSession ? 60 : 100}
        mode={mode}
        onModeChange={setMode}
      />

      {/* Below top bar */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          marginTop: 'var(--topbar-height)',
          overflow: 'hidden',
        }}
      >
        {mode === 'latest' ? (
          /* ── LATEST RACE ─────────────────────────────────────────── */
          <main style={{ flex: 1, overflow: 'hidden', background: 'var(--color-bg)' }}>
            <LatestRaceDashboard />
          </main>
        ) : (
          /* ── HISTORICAL ANALYSIS ─────────────────────────────────── */
          <>
            <aside
              style={{
                width: 'var(--sidebar-width)',
                borderRight: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--color-bg)',
                flexShrink: 0,
              }}
            >
              <SessionSelector
                onSessionSelect={handleSessionSelect}
                season={season}
                isLoadingSchedule={isLoadingSchedule}
                isLoadingSession={isLoadingSession}
                onYearChange={handleYearChange}
              />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <DriverSidebar
                  sessionMeta={sessionMeta}
                  selectedDrivers={selectedDrivers}
                  onDriverToggle={handleDriverToggle}
                  hoveredDriver={hoveredDriver}
                  onDriverHover={setHoveredDriver}
                  onCompare={handleCompare}
                />
              </div>

              {error && (
                <div
                  className="p-3 text-xs"
                  style={{
                    borderTop: '1px solid #E10600',
                    background: 'rgba(225,6,0,0.08)',
                    color: '#E10600',
                    flexShrink: 0,
                  }}
                >
                  {error}
                </div>
              )}
            </aside>

            <main
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--color-surface)',
              }}
            >
              <TabNav
                activeTab={activeTab}
                onTabChange={setActiveTab}
                hasSession={sessionMeta !== null}
                selectedDriverCount={selectedDrivers.length}
              />

              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {!sessionMeta ? (
                  <EmptyState
                    message="No session loaded"
                    subMessage="Select a year, grand prix, and session from the left panel, then click LOAD SESSION"
                  />
                ) : (
                  <ActiveView
                    tab={activeTab}
                    sessionMeta={sessionMeta}
                    selectedDrivers={selectedDrivers}
                    hoveredDriver={hoveredDriver}
                    selectedLap={selectedLap}
                    onLapSelect={handleLapSelect}
                  />
                )}
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

interface ActiveViewProps {
  tab: TabView;
  sessionMeta: SessionMetadata;
  selectedDrivers: string[];
  hoveredDriver: string | null;
  selectedLap: number | null;
  onLapSelect: (lap: number) => void;
}

const ActiveView: React.FC<ActiveViewProps> = ({
  tab, sessionMeta, selectedDrivers, hoveredDriver, selectedLap, onLapSelect,
}) => {
  switch (tab) {
    case 'laps':
      return (
        <LapChart
          sessionMeta={sessionMeta}
          selectedDrivers={selectedDrivers}
          hoveredDriver={hoveredDriver}
          onLapSelect={onLapSelect}
        />
      );
    case 'telemetry':
      return (
        <TelemetryView
          sessionMeta={sessionMeta}
          selectedDrivers={selectedDrivers}
          selectedLap={selectedLap}
        />
      );
    case 'comparison':
      if (selectedDrivers.length < 2) {
        return (
          <EmptyState
            message="Select 2 drivers to compare"
            subMessage="Click two drivers in the sidebar"
          />
        );
      }
      return (
        <DriverComparison
          sessionMeta={sessionMeta}
          driver1={selectedDrivers[0]}
          driver2={selectedDrivers[1]}
        />
      );
    case 'strategy':
      return <StrategyViewer sessionMeta={sessionMeta} />;
    case 'weather':
      return <WeatherPanel sessionMeta={sessionMeta} />;
    case 'degradation':
      return <PitSense />;
    default:
      return null;
  }
};

export default App;
