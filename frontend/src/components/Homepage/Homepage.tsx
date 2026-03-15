
// import { useState, useEffect } from 'react';
// import { Radio } from 'lucide-react';
// import type { PageMode, LiveSession, NextSession } from '../../hooks/useLiveStatus';
// import type { SeasonResponse, GrandPrixInfo, HomepageData, TabView } from '../../types/f1.types';
// import { api } from '../../api/client';
// import { formatLapTime } from '../../utils/formatting';
// import MiniTrackAnimation from './MiniTrackAnimation';

// const STRATEGY_ROWS: { name: string; stints: [string, string][] }[] = [
//   { name: 'P1', stints: [['#E10600', '58%'], ['#FFC906', '42%']] },
//   { name: 'P2', stints: [['#E10600', '40%'], ['#FFC906', '35%'], ['#EBEBEB', '25%']] },
//   { name: 'P3', stints: [['#FFC906', '52%'], ['#EBEBEB', '48%']] },
// ];

// const SESSION_TYPES = ['R', 'Q', 'SQ', 'S', 'FP3', 'FP2', 'FP1'];
// const YEARS = Array.from({ length: 9 }, (_, i) => 2026 - i);
// const DEFAULT_YEAR = 2025;

// interface HomepageProps {
//   liveMode: PageMode;
//   liveSession: LiveSession | null;
//   nextSession: NextSession | null;
//   onGoToLatest: () => void;
//   onGoToAnalysis: (year: number, gp: string, session: string, tab: TabView) => void;
//   loadSeason: (year: number) => void;
//   season: SeasonResponse | null;
//   isLoadingSchedule: boolean;
//   isLoadingSession: boolean;
// }

// function formatCountdown(h: number): string {
//   const d = Math.floor(h / 24);
//   const hh = Math.floor(h % 24);
//   const mm = Math.floor((h - Math.floor(h)) * 60);
//   if (d > 0) return `${d}d ${hh}h`;
//   return `${hh}h ${mm}m`;
// }

// export default function Homepage({
//   liveMode, liveSession, nextSession,
//   onGoToLatest, onGoToAnalysis,
//   loadSeason, season, isLoadingSchedule, isLoadingSession,
// }: HomepageProps) {
//   const [homeData, setHomeData] = useState<HomepageData | null>(null);
//   const [customYear, setCustomYear] = useState(DEFAULT_YEAR);
//   const [customGP, setCustomGP] = useState<GrandPrixInfo | null>(null);
//   const [customSession, setCustomSession] = useState('R');

//   useEffect(() => {
//     api.getHomepageData().then(setHomeData).catch(() => {});
//   }, []);

//   useEffect(() => {
//     if (!season || season.year !== customYear) loadSeason(customYear);
//   }, [customYear]); // eslint-disable-line react-hooks/exhaustive-deps

//   const handleYearChange = (year: number) => {
//     setCustomYear(year);
//     setCustomGP(null);
//     loadSeason(year);
//   };

//   const handleGPChange = (roundStr: string) => {
//     const gp = season?.grands_prix.find(g => g.round_number.toString() === roundStr) ?? null;
//     setCustomGP(gp);
//     if (gp?.sessions.includes('R')) setCustomSession('R');
//   };

//   const handleGo = () => {
//     if (customGP) onGoToAnalysis(customYear, customGP.round_number.toString(), customSession, 'laps');
//   };

//   const hero = homeData?.hero;
//   const isLive = liveMode === 'live' && liveSession;

//   const raceYear = isLive ? (new Date().getFullYear()) : (hero?.year ?? '');
//   const raceName = isLive ? liveSession.gp : (hero?.gp_name ?? '—');
//   const circuitName = isLive ? liveSession.circuit : (hero?.circuit_name ?? null);
//   const country = isLive ? null : (hero?.country ?? null);

//   return (
//     <div style={{
//       height: '100vh', display: 'flex', flexDirection: 'column',
//       background: '#0E0E0E', overflow: 'hidden',
//       fontFamily: 'Titillium Web, sans-serif',
//     }}>

//       {/* Top bar */}
//       <div style={{
//         height: 48, borderBottom: '1px solid #1E1E1E',
//         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
//         padding: '0 24px', flexShrink: 0,
//       }}>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
//           <span style={{ color: '#E10600', fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em' }}>GRID</span>
//           <span style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em' }}>INSIGHT</span>
//         </div>
//         <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 12 }}>
//           {isLive && (
//             <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#E10600', fontWeight: 600 }}>
//               <Radio size={11} style={{ animation: 'pulse-live 1.5s ease-in-out infinite' }} />
//               LIVE
//             </span>
//           )}
//           {liveMode === 'countdown' && nextSession && (
//             <span style={{ color: '#666', fontFamily: 'JetBrains Mono', fontSize: 11 }}>
//               {nextSession.name} in <span style={{ color: '#E10600', fontWeight: 700 }}>{formatCountdown(nextSession.hours_until)}</span>
//             </span>
//           )}
//           <button onClick={onGoToLatest} style={linkStyle}>Results</button>
//         </div>
//       </div>

//       {/* Center content */}
//       <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
//         <div style={{ width: '100%', maxWidth: 900 }}>

//           {/* Race heading row */}
//           <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
//             <div>
//               <p style={{ fontSize: 10, color: '#666', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
//                 {isLive ? 'Happening now' : 'Latest race'}
//               </p>
//               <h1 style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1.1, margin: 0 }}>
//                 {raceYear} {raceName}
//               </h1>
//             </div>
//             <div style={{ textAlign: 'right' }}>
//               {circuitName && (
//                 <p style={{ fontSize: 13, fontWeight: 700, color: '#CCC', marginBottom: 3 }}>{circuitName}</p>
//               )}
//               <p style={{ fontSize: 11, color: '#666' }}>
//                 {country && `${country} · `}
//                 {hero?.total_laps ? `${hero.total_laps} laps` : ''}
//                 {hero?.race_distance_km ? ` · ${hero.race_distance_km.toFixed(0)} km` : ''}
//                 {hero?.fastest_lap_time && hero?.fastest_lap_driver
//                   ? ` · FL ${formatLapTime(hero.fastest_lap_time)} ${hero.fastest_lap_driver}`
//                   : ''}
//               </p>
//             </div>
//           </div>

//           {/* Three cards */}
//           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>

//             {/* Card 1: Race Analysis */}
//             <Card onClick={onGoToLatest} enterLabel={isLive ? 'Watch →' : 'Enter →'}>
//               <h2 style={cardTitleStyle}>{isLive ? 'Live Timing' : 'Race Analysis'}</h2>
//               <p style={cardDescStyle}>Lap times, telemetry, strategy, and driver comparison</p>
//               {/* Static strategy preview bars */}
//               <div style={{ height: 56, background: '#0E0E0E', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
//                 {STRATEGY_ROWS.map(d => (
//                   <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
//                     <span style={{ fontSize: 7, color: '#555', width: 14, fontFamily: 'JetBrains Mono', flexShrink: 0 }}>{d.name}</span>
//                     <div style={{ flex: 1, display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
//                       {d.stints.map(([color, width], i) => (
//                         <div key={i} style={{ width, background: color, opacity: 0.65, borderRadius: 4 }} />
//                       ))}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </Card>

//             {/* Card 2: Race Replay */}
//             <Card
//               onClick={() => hero
//                 ? onGoToAnalysis(hero.year, hero.round_number.toString(), 'R', 'replay')
//                 : onGoToLatest()}
//               enterLabel="Watch →"
//             >
//               <h2 style={cardTitleStyle}>Race Replay</h2>
//               <p style={cardDescStyle}>Watch every car on the track map with full timing tower</p>
//               <div style={{ height: 56, background: '#0E0E0E', borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
//                 <MiniTrackAnimation
//                   colors={['#E10600', '#FF8000', '#27F4D2']}
//                   circuitPoints={hero?.circuit_points ?? undefined}
//                   rotation={hero?.circuit_rotation ?? 0}
//                 />
//               </div>
//             </Card>

//             {/* Card 3: What If */}
//             <Card
//               onClick={() => hero
//                 ? onGoToAnalysis(hero.year, hero.round_number.toString(), 'R', 'simulator')
//                 : onGoToLatest()}
//               enterLabel="Simulate →"
//             >
//               <h2 style={cardTitleStyle}>What If</h2>
//               <p style={cardDescStyle}>Change one pit stop decision and see how the race changes</p>
//               {/* Position swap visual */}
//               <div style={{
//                 height: 56, background: '#0E0E0E', borderRadius: 6,
//                 display: 'flex', alignItems: 'center', justifyContent: 'center',
//                 gap: 20, marginBottom: 12,
//               }}>
//                 <div style={{ textAlign: 'center' }}>
//                   <span style={{ fontSize: 8, color: '#555', display: 'block', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>ACTUAL</span>
//                   <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono' }}>P1</span>
//                 </div>
//                 <span style={{ color: '#333', fontSize: 12 }}>→</span>
//                 <div style={{ textAlign: 'center' }}>
//                   <span style={{ fontSize: 8, color: '#555', display: 'block', marginBottom: 4, fontFamily: 'JetBrains Mono' }}>WHAT IF</span>
//                   <span style={{ fontSize: 13, fontWeight: 700, color: '#FF8000', fontFamily: 'JetBrains Mono' }}>P2</span>
//                 </div>
//               </div>
//             </Card>
//           </div>

//           {/* Different race row */}
//           <div style={{
//             display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
//             padding: '10px 12px', background: '#151515',
//             border: '1px solid #1E1E1E', borderRadius: 8,
//           }}>
//             <span style={{ fontSize: 11, color: '#666', marginRight: 4 }}>Different race</span>
//             <RaceSelect
//               value={customYear}
//               onChange={v => handleYearChange(Number(v))}
//               options={YEARS.map(y => ({ value: y, label: String(y) }))}
//             />
//             <RaceSelect
//               value={customGP?.round_number?.toString() ?? ''}
//               onChange={handleGPChange}
//               disabled={isLoadingSchedule || !season}
//               placeholder={isLoadingSchedule ? 'Loading…' : 'Select Grand Prix'}
//               options={(season?.grands_prix ?? []).map(gp => ({
//                 value: gp.round_number.toString(),
//                 label: `R${gp.round_number} ${gp.name.replace(' Grand Prix', '').replace(' GP', '')}`,
//               }))}
//             />
//             <RaceSelect
//               value={customSession}
//               onChange={setCustomSession}
//               disabled={!customGP}
//               options={(customGP?.sessions ?? SESSION_TYPES).map(s => ({ value: s, label: s }))}
//             />
//             <button
//               onClick={handleGo}
//               disabled={!customGP || isLoadingSession}
//               style={{
//                 padding: '6px 16px',
//                 background: !customGP || isLoadingSession ? 'transparent' : '#E10600',
//                 color: !customGP || isLoadingSession ? '#3A3A3A' : '#fff',
//                 border: `1px solid ${!customGP || isLoadingSession ? '#252525' : '#E10600'}`,
//                 borderRadius: 4, fontSize: 11, fontWeight: 700,
//                 cursor: !customGP || isLoadingSession ? 'not-allowed' : 'pointer',
//                 transition: 'background 0.15s',
//                 fontFamily: 'Titillium Web, sans-serif',
//               }}
//             >
//               {isLoadingSession ? '···' : 'Go'}
//             </button>
//           </div>

//         </div>
//       </div>

//       {/* Footer */}
//       <div style={{
//         height: 36, borderTop: '1px solid #1A1A1A',
//         display: 'flex', alignItems: 'center', justifyContent: 'center',
//         flexShrink: 0,
//       }}>
//         <p style={{ fontSize: 9, color: '#333', fontFamily: 'JetBrains Mono', letterSpacing: '0.06em' }}>
//           Unofficial. Not associated with Formula 1. Data via FastF1 &amp; OpenF1.
//         </p>
//       </div>
//     </div>
//   );
// }

// // ---------------------------------------------------------------------------
// // Shared style objects
// // ---------------------------------------------------------------------------

// const cardTitleStyle: React.CSSProperties = {
//   fontSize: 15, fontWeight: 700, color: '#fff',
//   marginBottom: 6, fontFamily: 'Titillium Web, sans-serif',
// };

// const cardDescStyle: React.CSSProperties = {
//   fontSize: 11, color: '#666', lineHeight: 1.5, marginBottom: 12,
//   fontFamily: 'Titillium Web, sans-serif',
// };

// const linkStyle: React.CSSProperties = {
//   background: 'none', border: 'none', cursor: 'pointer',
//   color: '#666', fontSize: 12, padding: 0,
//   fontFamily: 'Titillium Web, sans-serif',
//   transition: 'color 0.15s',
// };

// // ---------------------------------------------------------------------------
// // Card
// // ---------------------------------------------------------------------------

// function Card({ onClick, enterLabel, children }: {
//   onClick: () => void;
//   enterLabel: string;
//   children: React.ReactNode;
// }) {
//   const [hovered, setHovered] = useState(false);
//   return (
//     <button
//       onClick={onClick}
//       onMouseEnter={() => setHovered(true)}
//       onMouseLeave={() => setHovered(false)}
//       style={{
//         background: '#151515',
//         border: `1px solid ${hovered ? '#404040' : '#252525'}`,
//         borderRadius: 12, padding: '20px 20px 16px',
//         cursor: 'pointer', textAlign: 'left',
//         transition: 'border-color 0.15s',
//         display: 'flex', flexDirection: 'column',
//       }}
//     >
//       {children}
//       <span style={{
//         fontSize: 11, fontWeight: 600,
//         color: hovered ? '#fff' : '#666',
//         transition: 'color 0.15s',
//         fontFamily: 'Titillium Web, sans-serif',
//         marginTop: 'auto',
//       }}>
//         {enterLabel}
//       </span>
//     </button>
//   );
// }

// // ---------------------------------------------------------------------------
// // Select
// // ---------------------------------------------------------------------------

// function RaceSelect({ value, onChange, options, disabled = false, placeholder }: {
//   value: string | number;
//   onChange: (v: string) => void;
//   options: { value: string | number; label: string }[];
//   disabled?: boolean;
//   placeholder?: string;
// }) {
//   return (
//     <select
//       value={value}
//       onChange={e => onChange(e.target.value)}
//       disabled={disabled}
//       style={{
//         background: '#0E0E0E', border: '1px solid #252525', borderRadius: 4,
//         color: disabled ? '#3A3A3A' : '#fff', fontSize: 11,
//         fontFamily: 'Titillium Web, sans-serif',
//         padding: '5px 8px', outline: 'none',
//         cursor: disabled ? 'not-allowed' : 'pointer',
//       }}
//     >
//       {placeholder && !value && <option value="" disabled>{placeholder}</option>}
//       {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
//     </select>
//   );
// }


import { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';
import type { PageMode, LiveSession, NextSession } from '../../hooks/useLiveStatus';
import type { SeasonResponse, GrandPrixInfo, HomepageData, TabView } from '../../types/f1.types';
import { api } from '../../api/client';
//import { formatLapTime } from '../../utils/formatting';
import MiniTrackAnimation from './MiniTrackAnimation';

// F1 Tire colors are universal, so keeping these accurate (Soft/Med/Hard)
const STRATEGY_ROWS: { name: string; stints: [string, string][] }[] = [
  { name: 'P1', stints: [['bg-[#E10600]', 'w-[58%]'], ['bg-[#FFC906]', 'w-[42%]']] },
  { name: 'P2', stints: [['bg-[#E10600]', 'w-[40%]'], ['bg-[#FFC906]', 'w-[35%]'], ['bg-[#FFFFFF]', 'w-[25%]']] },
  { name: 'P3', stints: [['bg-[#FFC906]', 'w-[52%]'], ['bg-[#FFFFFF]', 'w-[48%]']] },
];

const SESSION_TYPES = ['R', 'Q', 'SQ', 'S', 'FP3', 'FP2', 'FP1'];
const YEARS = Array.from({ length: 9 }, (_, i) => 2026 - i);
const DEFAULT_YEAR = 2025;

interface HomepageProps {
  liveMode: PageMode;
  liveSession: LiveSession | null;
  nextSession: NextSession | null;
  onGoToLatest: () => void;
  onGoToAnalysis: (year: number, gp: string, session: string, tab: TabView) => void;
  loadSeason: (year: number) => void;
  season: SeasonResponse | null;
  isLoadingSchedule: boolean;
  isLoadingSession: boolean;
}

function formatCountdown(h: number): string {
  const d = Math.floor(h / 24);
  const hh = Math.floor(h % 24);
  const mm = Math.floor((h - Math.floor(h)) * 60);
  if (d > 0) return `${d}d ${hh}h`;
  return `${hh}h ${mm}m`;
}

export default function Homepage({
  liveMode, liveSession, nextSession,
  onGoToLatest, onGoToAnalysis,
  loadSeason, season, isLoadingSchedule, isLoadingSession,
}: HomepageProps) {
  const [homeData, setHomeData] = useState<HomepageData | null>(null);
  const [customYear, setCustomYear] = useState(DEFAULT_YEAR);
  const [customGP, setCustomGP] = useState<GrandPrixInfo | null>(null);
  const [customSession, setCustomSession] = useState('R');

  useEffect(() => {
    api.getHomepageData().then(setHomeData).catch(() => {});
  }, []);

  useEffect(() => {
    if (!season || season.year !== customYear) loadSeason(customYear);
  }, [customYear, season, loadSeason]);

  const handleYearChange = (year: number) => {
    setCustomYear(year);
    setCustomGP(null);
    loadSeason(year);
  };

  const handleGPChange = (roundStr: string) => {
    const gp = season?.grands_prix.find(g => g.round_number.toString() === roundStr) ?? null;
    setCustomGP(gp);
    if (gp?.sessions.includes('R')) setCustomSession('R');
  };

  const handleGo = () => {
    if (customGP) onGoToAnalysis(customYear, customGP.round_number.toString(), customSession, 'laps');
  };

  const hero = homeData?.hero;
  const isLive = liveMode === 'live' && liveSession;

  const raceYear = isLive ? (new Date().getFullYear()) : (hero?.year ?? '');
  const raceName = isLive ? liveSession.gp : (hero?.gp_name ?? '—');

  return (
    <div className="h-screen w-screen bg-[#0E0E0E] text-gray-300 font-sans flex flex-col overflow-hidden selection:bg-[#E10600] selection:text-white">
      
      {/* Top Bar */}
      <header className="h-16 shrink-0 flex items-center justify-between px-8 border-b border-[#222] bg-[#0E0E0E]/90 backdrop-blur-sm z-10">
        <div className="flex items-center gap-1.5 text-lg font-black tracking-tight">
          <span className="text-white">GRID</span>
          <span className="text-[#E10600]">INSIGHT</span>
        </div>
        
        <div className="flex items-center gap-6">
          {isLive && (
            <span className="flex items-center gap-2 text-[#E10600] text-xs font-bold uppercase tracking-wider animate-pulse">
              <Radio size={14} /> Live
            </span>
          )}
          {liveMode === 'countdown' && nextSession && (
            <span className="text-gray-400 text-xs font-mono">
              {nextSession.name} in <span className="text-[#E10600] font-bold">{formatCountdown(nextSession.hours_until)}</span>
            </span>
          )}
          <button 
            onClick={onGoToLatest} 
            className="text-xs font-semibold text-gray-400 hover:text-white transition-colors"
          >
            Latest Results &rarr;
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center px-8 w-full max-w-6xl mx-auto">
        
        {/* Contextual Title Block */}
        <div className="flex flex-col items-center text-center shrink-0 mb-8 mt-4">
          
          {/* NEW: The Context Badge */}
          <div className="flex items-center justify-center mb-4">
            {isLive ? (
              <div className="flex items-center gap-2 px-2.5 py-1 bg-[#E10600]/10 border border-[#E10600]/20 rounded-sm text-[#E10600] text-[10px] font-mono font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-[#E10600] animate-pulse" />
                Live Session
              </div>
            ) : (
              <div className="px-2.5 py-1 bg-[#151515] border border-white/5 rounded-sm text-gray-500 text-[10px] font-mono font-semibold uppercase tracking-widest">
                Previous Session
              </div>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-3">
            {raceYear} {raceName}
          </h1>
          
          {/* NEW: Clearer instructions */}
          <p className="text-sm text-gray-400 font-medium max-w-2xl">
            Jump straight into the data for the {isLive ? 'current session' : 'most recent Grand Prix'}, or use the archive below to explore historical telemetry and race replays.
          </p>
        </div>

        {/* 3 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full flex-1 min-h-0 mb-8 max-h-[340px]">
          
          <Card onClick={() => hero ? onGoToAnalysis(hero.year, hero.round_number.toString(), 'R', 'replay') : onGoToLatest()}>
            <h2 className="text-sm font-bold text-gray-200 mb-2 uppercase tracking-wide">Race Replay</h2>
            <p className="text-xs text-gray-500 mb-6 line-clamp-2">Watch the interactive track map with a full timing tower and dynamic intervals.</p>
            <div className="flex-1 w-full bg-[#111] rounded-lg border border-[#222] flex items-center justify-center overflow-hidden">
               <div className="h-24 w-full opacity-80 group-hover:opacity-100 transition-opacity">
                 <MiniTrackAnimation
                   colors={['#E10600', '#FF8000', '#27F4D2']}
                   circuitPoints={hero?.circuit_points ?? undefined}
                   rotation={hero?.circuit_rotation ?? 0}
                 />
               </div>
            </div>
          </Card>

          <Card onClick={onGoToLatest}>
            <h2 className="text-sm font-bold text-gray-200 mb-2 uppercase tracking-wide">Telemetry & Strategy</h2>
            <p className="text-xs text-gray-500 mb-6 line-clamp-2">Analyze stint lengths, tire deg, and head-to-head lap time comparisons.</p>
            <div className="flex-1 w-full flex flex-col justify-center gap-3 bg-[#111] rounded-lg border border-[#222] p-4">
              {STRATEGY_ROWS.map(d => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-gray-500 w-4">{d.name}</span>
                  <div className="flex-1 flex h-1.5 rounded-full overflow-hidden bg-[#222]">
                    {d.stints.map(([bgColor, widthClass], i) => (
                      <div key={i} className={`${widthClass} ${bgColor} border-r border-[#111] last:border-0 opacity-90`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card onClick={() => hero ? onGoToAnalysis(hero.year, hero.round_number.toString(), 'R', 'simulator') : onGoToLatest()}>
            <h2 className="text-sm font-bold text-gray-200 mb-2 uppercase tracking-wide">What If Simulator</h2>
            <p className="text-xs text-gray-500 mb-6 line-clamp-2">Adjust a team's pit window and see how it ripples through the final standings.</p>
            <div className="flex-1 w-full flex items-center justify-center gap-6 bg-[#111] rounded-lg border border-[#222]">
              <div className="text-center">
                <span className="block text-[9px] text-gray-500 font-mono mb-1">ACTUAL</span>
                <span className="text-2xl font-bold text-white font-mono">P1</span>
              </div>
              <div className="text-gray-600 text-lg">→</div>
              <div className="text-center">
                <span className="block text-[9px] text-gray-500 font-mono mb-1">PROJECTED</span>
                <span className="text-2xl font-bold text-[#E10600] font-mono">P2</span>
              </div>
            </div>
          </Card>

        </div>
      </main>

      {/* Command Bar */}
      <div className="shrink-0 bg-[#111] border-t border-[#222] p-4">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-3">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mr-2">Archive</span>
          
          <select 
            className="bg-[#1A1A1A] border border-[#333] rounded text-gray-200 text-xs px-3 py-1.5 outline-none cursor-pointer hover:border-[#E10600]/50 focus:border-[#E10600] transition-colors"
            value={customYear} 
            onChange={e => handleYearChange(Number(e.target.value))}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          <select 
            className="bg-[#1A1A1A] border border-[#333] rounded text-gray-200 text-xs px-3 py-1.5 outline-none cursor-pointer hover:border-[#E10600]/50 focus:border-[#E10600] transition-colors disabled:opacity-50 min-w-[180px]"
            value={customGP?.round_number?.toString() ?? ''} 
            onChange={e => handleGPChange(e.target.value)}
            disabled={isLoadingSchedule || !season}
          >
            {!customGP && <option value="" disabled>{isLoadingSchedule ? 'Loading schedule...' : 'Select Grand Prix'}</option>}
            {(season?.grands_prix ?? []).map(gp => (
              <option key={gp.round_number} value={gp.round_number.toString()}>
                R{gp.round_number} - {gp.name.replace(' Grand Prix', '').replace(' GP', '')}
              </option>
            ))}
          </select>

          <select 
            className="bg-[#1A1A1A] border border-[#333] rounded text-gray-200 text-xs px-3 py-1.5 outline-none cursor-pointer hover:border-[#E10600]/50 focus:border-[#E10600] transition-colors disabled:opacity-50"
            value={customSession} 
            onChange={e => setCustomSession(e.target.value)}
            disabled={!customGP}
          >
            {(customGP?.sessions ?? SESSION_TYPES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            onClick={handleGo}
            disabled={!customGP || isLoadingSession}
            className="bg-[#E10600] text-white px-5 py-1.5 rounded text-xs font-bold tracking-wide hover:bg-[#C10500] disabled:bg-[#222] disabled:text-gray-600 transition-colors ml-2"
          >
            {isLoadingSession ? 'Loading...' : 'Load'}
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="h-8 shrink-0 flex items-center justify-center bg-[#0E0E0E]">
        <p className="text-[9px] text-gray-600 font-mono">
          Unofficial. Data via FastF1 & OpenF1.
        </p>
      </footer>
    </div>
  );
}

function Card({ onClick, children }: { onClick: () => void; children: React.ReactNode; }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col h-full bg-[#151515] border border-[#222] rounded-xl p-6 cursor-pointer transition-all duration-200 hover:border-[#E10600]/40 hover:bg-[#1A1A1A] focus:outline-none text-left"
    >
      {children}
    </button>
  );
}