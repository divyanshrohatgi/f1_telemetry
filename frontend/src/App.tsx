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
import SimulatorView from './components/Simulator/SimulatorView';
import ReplayPage from './components/Replay/ReplayPage';
import EmptyState from './components/common/EmptyState';
import LatestRaceDashboard from './components/LatestRace/LatestRaceDashboard';
import Homepage from './components/Homepage/Homepage';

import { useSessionData } from './hooks/useSessionData';
import { useLiveStatus } from './hooks/useLiveStatus';
import type { AppMode, TabView, SessionMetadata } from './types/f1.types';
import LiveBanner from './components/LiveBanner/LiveBanner';
import LiveRaceDashboard from './components/LiveBanner/LiveRaceDashboard';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('home');
  const { mode: liveMode, liveSession, nextSession } = useLiveStatus();

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mode === 'home' ? '' : 'hidden';
  }, [mode]);

  // Dynamic page title
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

  const handleGoToSimulator = useCallback((driver: string) => {
    setSelectedDrivers([driver]);
    setActiveTab('simulator');
  }, []);

  const handleGoToAnalysis = useCallback(
    (year: number, gp: string, session: string, tab: TabView) => {
      setSelectedDrivers([]);
      setSelectedLap(null);
      setActiveTab(tab);
      loadSession(year, gp, session);
      setMode('analysis');
    },
    [loadSession]
  );

  // Homepage — minimal launchpad
  if (mode === 'home') {
    return (
      <Homepage
        liveMode={liveMode}
        liveSession={liveSession}
        nextSession={nextSession}
        onGoToLatest={() => setMode('latest')}
        onGoToAnalysis={handleGoToAnalysis}
        loadSeason={loadSeason}
        season={season}
        isLoadingSchedule={isLoadingSchedule}
        isLoadingSession={isLoadingSession}
      />
    );
  }

  // Replay gets its own fullscreen layout — no sidebar, no tab bar
  if (mode === 'analysis' && activeTab === 'replay' && sessionMeta) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0A0A0A',
          overflow: 'hidden',
        }}
      >
        <ReplayPage sessionMeta={sessionMeta} onBack={() => setActiveTab('laps')} />
      </div>
    );
  }

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
          flexDirection: 'column',
          flex: 1,
          marginTop: 'var(--topbar-height)',
          overflow: 'hidden',
        }}
      >
        <LiveBanner mode={liveMode} liveSession={liveSession} nextSession={nextSession} />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {mode === 'latest' ? (
          /* ── LATEST RACE or LIVE ─────────────────────────────────── */
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
            {liveMode === 'live' && liveSession
              ? <LiveRaceDashboard session={liveSession} />
              : <LatestRaceDashboard />
            }
          </main>
        ) : (
          /* ── HISTORICAL ANALYSIS ─────────────────────────────────── */
          <>
            {/* Mobile sidebar toggle */}
            <button
              className="md:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center text-white text-xl shadow-lg"
              style={{ background: 'var(--color-f1-red)' }}
              onClick={() => setSidebarOpen(o => !o)}
            >
              {sidebarOpen ? '✕' : '☰'}
            </button>

            <aside
              className={`
                fixed md:relative inset-y-0 left-0 z-40
                transition-transform duration-200
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                md:translate-x-0
              `}
              style={{
                width: 'var(--sidebar-width)',
                borderRight: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--color-bg)',
                flexShrink: 0,
                marginTop: 'var(--topbar-height)',
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
                    onGoToSimulator={handleGoToSimulator}
                  />
                )}
              </div>
            </main>
          </>
        )}
        </div>
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
  onGoToSimulator: (driver: string) => void;
}

const ActiveView: React.FC<ActiveViewProps> = ({
  tab, sessionMeta, selectedDrivers, hoveredDriver, selectedLap, onLapSelect, onGoToSimulator,
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
      return <PitSense sessionMeta={sessionMeta} onGoToSimulator={onGoToSimulator} />;
    case 'simulator':
      return (
        <SimulatorView
          sessionMeta={sessionMeta}
          driver={selectedDrivers[0]}
        />
      );
    case 'replay':
      return <ReplayPage sessionMeta={sessionMeta} />;
    default:
      return null;
  }
};

export default App;
