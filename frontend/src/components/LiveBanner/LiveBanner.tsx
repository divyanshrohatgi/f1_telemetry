import { Radio } from 'lucide-react';
import type { LiveSession, NextSession, PageMode } from '../../hooks/useLiveStatus';

interface LiveBannerProps {
  mode: PageMode;
  liveSession: LiveSession | null;
  nextSession: NextSession | null;
}

function formatCountdown(hoursUntil: number): string {
  const h = Math.floor(hoursUntil);
  const m = Math.floor((hoursUntil - h) * 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

export default function LiveBanner({ mode, liveSession, nextSession }: LiveBannerProps) {
  if (mode === 'analysis') return null;

  if (mode === 'countdown' && nextSession) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 16px', borderBottom: '1px solid #1A1A1A',
        background: '#0D0D0D', flexShrink: 0,
      }}>
        <span style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>NEXT SESSION</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#F0F0F0', fontFamily: 'Titillium Web, sans-serif' }}>
          {nextSession.name}
        </span>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#E10600', fontWeight: 700 }}>
          {formatCountdown(nextSession.hours_until)}
        </span>
      </div>
    );
  }

  if (mode === 'live' && liveSession) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 16px', borderBottom: '1px solid #1A1A1A',
        background: '#0D0D0D', flexShrink: 0,
      }}>
        <Radio size={11} style={{ color: '#E10600', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#E10600', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>LIVE</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#F0F0F0', fontFamily: 'Titillium Web, sans-serif' }}>
          {liveSession.gp} — {liveSession.name}
        </span>
        <span style={{ fontSize: 10, color: '#555', fontFamily: 'JetBrains Mono' }}>{liveSession.circuit}</span>
      </div>
    );
  }

  return null;
}
