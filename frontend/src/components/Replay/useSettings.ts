import { useState, useCallback } from 'react';

export interface ReplaySettings {
  showTeamAbbr: boolean;
  showGridChange: boolean;
  showGapToLeader: boolean;
  showPitStops: boolean;
  showPitPrediction: boolean;
  showTyreHistory: boolean;
  showTyreType: boolean;
  showTyreAge: boolean;
  showDriverNames: 'all' | 'selected' | 'none';
  showTelemetry: boolean;
  showWeather: boolean;
  showRaceControl: boolean;
  showSessionTime: boolean;
  intervalMode: 'leader' | 'interval';
  showAirTemp: boolean;
  showTrackTemp: boolean;
  showWind: boolean;
}

const STORAGE_KEY = 'f1replay_settings_v2';

const DEFAULTS: ReplaySettings = {
  showTeamAbbr: true,
  showGridChange: true,
  showGapToLeader: true,
  showPitStops: true,
  showPitPrediction: true,
  showTyreHistory: true,
  showTyreType: true,
  showTyreAge: true,
  showDriverNames: 'all',
  showTelemetry: true,
  showWeather: true,
  showRaceControl: true,
  showSessionTime: false,
  intervalMode: 'leader',
  showAirTemp: true,
  showTrackTemp: true,
  showWind: true,
};

function loadSettings(): ReplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ReplaySettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useSettings(): [ReplaySettings, (patch: Partial<ReplaySettings>) => void] {
  const [settings, setSettings] = useState<ReplaySettings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<ReplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  }, []);

  return [settings, updateSettings];
}
