import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { TelemetryResponse, DriverLapsResponse } from '../types/f1.types';

interface UseTelemetryReturn {
  telemetry: TelemetryResponse | null;
  driverLaps: DriverLapsResponse | null;
  isLoadingTelemetry: boolean;
  isLoadingLaps: boolean;
  error: string | null;
  loadTelemetry: (year: number, gp: string, sessionType: string, driver: string, lap: number) => Promise<void>;
  loadFastestLapTelemetry: (year: number, gp: string, sessionType: string, driver: string) => Promise<void>;
  loadDriverLaps: (year: number, gp: string, sessionType: string, driver: string) => Promise<void>;
}

export function useTelemetry(): UseTelemetryReturn {
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [driverLaps, setDriverLaps] = useState<DriverLapsResponse | null>(null);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState(false);
  const [isLoadingLaps, setIsLoadingLaps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTelemetry = useCallback(async (
    year: number, gp: string, sessionType: string, driver: string, lap: number
  ) => {
    setIsLoadingTelemetry(true);
    setError(null);
    try {
      const data = await api.getTelemetry(year, gp, sessionType, driver, lap);
      setTelemetry(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load telemetry');
    } finally {
      setIsLoadingTelemetry(false);
    }
  }, []);

  const loadFastestLapTelemetry = useCallback(async (
    year: number, gp: string, sessionType: string, driver: string
  ) => {
    setIsLoadingTelemetry(true);
    setError(null);
    try {
      const data = await api.getFastestLapTelemetry(year, gp, sessionType, driver);
      setTelemetry(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load telemetry');
    } finally {
      setIsLoadingTelemetry(false);
    }
  }, []);

  const loadDriverLaps = useCallback(async (
    year: number, gp: string, sessionType: string, driver: string
  ) => {
    setIsLoadingLaps(true);
    setError(null);
    try {
      const data = await api.getDriverLaps(year, gp, sessionType, driver);
      setDriverLaps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load laps');
    } finally {
      setIsLoadingLaps(false);
    }
  }, []);

  return {
    telemetry,
    driverLaps,
    isLoadingTelemetry,
    isLoadingLaps,
    error,
    loadTelemetry,
    loadFastestLapTelemetry,
    loadDriverLaps,
  };
}
