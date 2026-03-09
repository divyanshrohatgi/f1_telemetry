import { useState, useCallback } from 'react';
import { api } from '../api/client';
import type { ComparisonResponse } from '../types/f1.types';

interface UseDriverComparisonReturn {
  comparison: ComparisonResponse | null;
  isLoading: boolean;
  error: string | null;
  loadComparison: (year: number, gp: string, sessionType: string, driver1: string, driver2: string) => Promise<void>;
}

export function useDriverComparison(): UseDriverComparisonReturn {
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComparison = useCallback(async (
    year: number, gp: string, sessionType: string, driver1: string, driver2: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getComparison(year, gp, sessionType, driver1, driver2);
      setComparison(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { comparison, isLoading, error, loadComparison };
}
