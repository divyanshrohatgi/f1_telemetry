import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { SeasonResponse, SessionMetadata } from '../types/f1.types';

interface UseSessionDataReturn {
  season: SeasonResponse | null;
  sessionMeta: SessionMetadata | null;
  isLoadingSchedule: boolean;
  isLoadingSession: boolean;
  error: string | null;
  loadSeason: (year: number) => Promise<void>;
  loadSession: (year: number, gp: string, sessionType: string) => Promise<void>;
}

export function useSessionData(): UseSessionDataReturn {
  const [season, setSeason] = useState<SeasonResponse | null>(null);
  const [sessionMeta, setSessionMeta] = useState<SessionMetadata | null>(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSeason = useCallback(async (year: number) => {
    setIsLoadingSchedule(true);
    setError(null);
    try {
      const data = await api.getSeason(year);
      setSeason(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load season');
    } finally {
      setIsLoadingSchedule(false);
    }
  }, []);

  const loadSession = useCallback(async (year: number, gp: string, sessionType: string) => {
    setIsLoadingSession(true);
    setError(null);
    setSessionMeta(null);
    try {
      const data = await api.getSession(year, gp, sessionType);
      setSessionMeta(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setIsLoadingSession(false);
    }
  }, []);

  return {
    season,
    sessionMeta,
    isLoadingSchedule,
    isLoadingSession,
    error,
    loadSeason,
    loadSession,
  };
}
