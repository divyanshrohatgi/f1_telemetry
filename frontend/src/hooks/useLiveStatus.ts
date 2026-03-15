import { useState, useEffect } from 'react';

export interface LiveSession {
  name: string;
  gp: string;
  type: string;
  circuit: string;
}

export interface NextSession {
  name: string;
  gp: string;
  circuit: string;
  country: string;
  country_code: string;
  date: string;
  session_name: string;
  start_time: string;
  hours_until: number;
  round: number;
  total_laps: number | null;
}

export type PageMode = 'live' | 'countdown' | 'analysis';

export function useLiveStatus(): {
  mode: PageMode;
  liveSession: LiveSession | null;
  nextSession: NextSession | null;
  loading: boolean;
} {
  const [mode, setMode] = useState<PageMode>('analysis');
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);
  const [nextSession, setNextSession] = useState<NextSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      fetch('/api/v1/live/status')
        .then(r => r.json())
        .then(data => {
          if (cancelled) return;
          if (data.live) {
            setMode('live');
            setLiveSession(data.session);
          } else if (data.next_session_in_hours < 24) {
            setMode('countdown');
            setNextSession(data.next);
          } else {
            setMode('analysis');
            setNextSession(data.next);
          }
          setLoading(false);
        })
        .catch(() => { if (!cancelled) setLoading(false); });
    };

    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { mode, liveSession, nextSession, loading };
}
