import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import type { SessionMetadata, TyreCompound, SimulationResponse } from '../../types/f1.types';
import LiveTrackMap from './LiveTrackMap';
import type { TrackPoint, DriverMarker } from '../../utils/trackRenderer';

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#FF3333', MEDIUM: '#FFC906', HARD: '#CCCCCC',
  INTERMEDIATE: '#39B54A', WET: '#0072C6', UNKNOWN: '#666666',
};

interface SimulatorViewProps {
  sessionMeta: SessionMetadata;
  driver: string;
}

const SimulatorView: React.FC<SimulatorViewProps> = ({ sessionMeta, driver }) => {
  const [startingCompound, setStartingCompound] = useState<TyreCompound>('SOFT');
  const [pitStops, setPitStops] = useState<{ lap: number; compound: TyreCompound }[]>([
    { lap: 20, compound: 'MEDIUM' }
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualStints, setActualStints] = useState<any[] | null>(null);

  // Ghost Car Replay State
  const [trackPoints, setTrackPoints] = useState<TrackPoint[]>([]);
  const [trackRotation, setTrackRotation] = useState<number>(0);
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const [lapDistances, setLapDistances] = useState<number[]>([]);

  // Fetch track map data on load
  useEffect(() => {
    const fetchTrack = async () => {
      try {
        const parts = sessionMeta.session_key.split('_');
        const year = parts[0];
        const gp = parts.slice(1, -1).join('_');
        const sessionType = parts[parts.length - 1];

        // Just fetch lap 1 to get the circuit layout (use proxy-relative path)
        const endpoint = `/api/v1/telemetry/${year}/${gp}/${sessionType}/${driver}/1`;
        
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          if (data.circuit_points) {
            setTrackPoints(data.circuit_points.map((cp: any) => ({ 
              x: cp.x, 
              y: cp.y,
              distance: cp.distance 
            })));
            setLapDistances(data.circuit_points.map((cp: any) => cp.distance));
            setTrackRotation(data.circuit_rotation || 0);
          }
        }
      } catch (e) {
        console.error("Failed to load track points for ghost car.", e);
      }
    };
    fetchTrack();
  }, [sessionMeta.session_key, driver]);

  // Fetch actual race strategy and pre-fill pit stops
  useEffect(() => {
    if (!driver || !sessionMeta) return;
    const parts = sessionMeta.session_key.split('_');
    const year = parts[0];
    const gp = parts.slice(1, -1).join('_');
    const sessionType = parts[parts.length - 1];
    fetch(`/api/v1/strategy/${year}/${gp}/${sessionType}`)
      .then(r => r.json())
      .then(data => {
        const drvStrategy = data.drivers?.find((d: any) => d.driver_code === driver);
        if (drvStrategy?.stints && drvStrategy.stints.length > 0) {
          const stints = drvStrategy.stints;
          setActualStints(stints);
          setStartingCompound((stints[0].compound || 'SOFT').toUpperCase() as TyreCompound);
          if (stints.length >= 2) {
            const stops = stints.slice(0, -1).map((s: any, i: number) => ({
              lap: s.end_lap || 20,
              compound: (stints[i + 1].compound || 'MEDIUM').toUpperCase() as TyreCompound,
            }));
            setPitStops(stops);
          }
        }
      })
      .catch(() => {});
  }, [driver, sessionMeta?.session_key]);

  const handleSimulate = async () => {
    setIsSimulating(true);
    setError(null);
    try {
      // Parse session_key to extract year, gp, sessionType
      // session_key format: 2024_bahrain_r
      const parts = sessionMeta.session_key.split('_');
      const year = parts[0];
      const gp = parts.slice(1, -1).join('_');
      const sessionType = parts[parts.length - 1];

      const endpoint = `/api/v1/simulate/${year}/${gp}/${sessionType}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          driver_code: driver,
          starting_compound: startingCompound,
          pit_stops: pitStops,
        }),
      });

      if (!response.ok) {
        throw new Error(`Simulation failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const addPitStop = () => {
    setPitStops([...pitStops, { lap: sessionMeta.total_laps > 0 ? Math.floor(sessionMeta.total_laps / 2) : 30, compound: 'HARD' }]);
  };

  const removePitStop = (index: number) => {
    const newStops = [...pitStops];
    newStops.splice(index, 1);
    setPitStops(newStops);
  };

  const updatePitStop = (index: number, field: 'lap' | 'compound', value: any) => {
    const newStops = [...pitStops];
    newStops[index] = { ...newStops[index], [field]: value };
    setPitStops(newStops);
  };

  const formatTimeInfo = (seconds: number) => {
    if (seconds === 0) return '0.000s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) return `${h}h ${m}m ${s.toFixed(3)}s`;
    return `${m}m ${s.toFixed(3)}s`;
  };

  // Replay Animation Logic
  useEffect(() => {
    if (!isPlaying || !result) return;
    
    const animate = (time: number) => {
      if (lastUpdateRef.current === 0) {
        lastUpdateRef.current = time;
      }
      const dt = (time - lastUpdateRef.current) / 1000; // seconds elapsed
      lastUpdateRef.current = time;

      setPlaybackTime(prev => {
        // Run animation at 50x speed
        const nextTime = prev + (dt * 50);
        if (nextTime >= result.simulated_total_time) {
          setIsPlaying(false);
          return result.simulated_total_time;
        }
        return nextTime;
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      lastUpdateRef.current = 0;
    };
  }, [isPlaying, result]);

  const togglePlayback = () => {
    if (playbackTime >= (result?.simulated_total_time || 0)) {
      setPlaybackTime(0);
    }
    setIsPlaying(!isPlaying);
  };

  const ghostMarker = useMemo((): DriverMarker[] => {
    if (!result || trackPoints.length === 0 || lapDistances.length === 0) return [];
    
    // 1. Find the current lap based on playbackTime
    let currentLapIndex = 0;
    while (
      currentLapIndex < result.simulated_laps.length - 1 && 
      result.simulated_laps[currentLapIndex].cumulative_time < playbackTime
    ) {
      currentLapIndex++;
    }

    const lap = result.simulated_laps[currentLapIndex];
    const lapStart = currentLapIndex === 0 ? 0 : result.simulated_laps[currentLapIndex - 1].cumulative_time;
    
    // 2. Compute fraction of lap completed
    const timeInLap = Math.max(0, playbackTime - lapStart);
    const fraction = timeInLap / lap.lap_time;
    
    // 3. Map fraction to track distance
    const totalLapDist = lapDistances[lapDistances.length - 1];
    const targetDist = fraction * totalLapDist;

    // 4. Interpolate X/Y pos
    let pIdx = 0;
    while (pIdx < trackPoints.length - 1 && (trackPoints[pIdx] as any).distance < targetDist) {
      pIdx++;
    }

    const p1 = trackPoints[Math.max(0, pIdx - 1)] as any;
    const p2 = trackPoints[pIdx] as any;
    
    let x = p1.x;
    let y = p1.y;

    if (p2.distance > p1.distance) {
      const distRatio = (targetDist - p1.distance) / (p2.distance - p1.distance);
      x = p1.x + (p2.x - p1.x) * distRatio;
      y = p1.y + (p2.y - p1.y) * distRatio;
    }

    // Determine compound color
    const colors: Record<string, string> = {
      'SOFT': '#E10600',
      'MEDIUM': '#F5C518',
      'HARD': '#FFFFFF'
    };
    
    return [{
      abbr: 'SIM',
      x,
      y,
      color: colors[lap.compound] || '#FFFFFF',
      position: null
    }];
  }, [playbackTime, result, trackPoints, lapDistances]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.simulated_laps.map(lap => ({
      lap: lap.lap_number,
      lapTime: lap.lap_time,
      compound: lap.compound,
      isPitIn: lap.is_pit_in_lap,
    }));
  }, [result]);

  return (
    <div className="flex flex-col h-full bg-f1-dark p-6 overflow-y-auto" style={{ color: 'var(--color-text-primary)' }}>
      <h2 className="text-2xl font-bold uppercase mb-6 tracking-wide">Strategy Simulator: {driver}</h2>
      {sessionMeta && parseInt(sessionMeta.session_key.split('_')[0]) < 2022 && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 12,
          background: 'rgba(255,201,6,0.08)', border: '1px solid rgba(255,201,6,0.2)',
          fontSize: 10, color: '#FFC906', fontFamily: 'JetBrains Mono',
        }}>
          Predictions may be less accurate for pre-2022 races — model trained on 2022–2025 data.
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-[400px_1fr] gap-8 mb-8">
        {/* Strategy Configuration Panel */}
        <div className="p-5 rounded flex flex-col" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-lg font-bold uppercase mb-4 text-f1-red">Configure Strategy</h3>
          
          {/* Actual strategy from real race */}
          {actualStints && actualStints.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="text-2xs uppercase text-f1-gray-500 font-semibold tracking-wider" style={{ marginBottom: 8 }}>
                Actual Strategy — {driver}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 32, background: 'var(--color-bg)', borderRadius: 8, padding: '4px 6px' }}>
                {actualStints.map((stint: any, i: number) => {
                  const compound = (stint.compound || 'UNKNOWN').toUpperCase();
                  const laps = stint.tyre_life || stint.laps || 10;
                  const totalLaps = sessionMeta.total_laps || 56;
                  return (
                    <div
                      key={i}
                      style={{
                        width: `${Math.max(15, (laps / totalLaps) * 100)}%`,
                        height: '100%', borderRadius: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, fontFamily: 'JetBrains Mono',
                        backgroundColor: COMPOUND_COLORS[compound] || '#666',
                        color: compound === 'HARD' ? '#333' : '#000',
                        opacity: 0.85,
                      }}
                    >
                      {compound[0]} · L{stint.start_lap}–{stint.end_lap}
                    </div>
                  );
                })}
              </div>
              <div className="text-2xs text-f1-gray-600 mt-1" style={{ fontStyle: 'italic' }}>
                Modify the pit stops below to test an alternate strategy
              </div>
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-semibold uppercase mb-2 text-f1-gray-400">Starting Tyre</label>
            <select 
              value={startingCompound}
              onChange={(e) => setStartingCompound(e.target.value as TyreCompound)}
              className="w-full bg-f1-black border border-f1-gray-700 text-white p-2 rounded focus:border-f1-red focus:outline-none"
            >
              <option value="SOFT">SOFT (C5/C4/C3)</option>
              <option value="MEDIUM">MEDIUM (C4/C3/C2)</option>
              <option value="HARD">HARD (C3/C2/C1)</option>
            </select>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold uppercase text-f1-gray-400">Pit Stops</label>
              <button onClick={addPitStop} className="text-xs uppercase font-bold text-f1-red hover:text-white transition-colors">+ Add Stop</button>
            </div>
            
            {pitStops.map((stop, i) => (
              <div key={i} className="flex gap-2 mb-3 items-center bg-f1-black p-3 rounded border border-f1-gray-800">
                <div className="flex-1">
                  <label className="text-2xs uppercase text-f1-gray-500 mb-1 block">Lap</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={sessionMeta.total_laps || 80} 
                    value={stop.lap}
                    onChange={(e) => updatePitStop(i, 'lap', parseInt(e.target.value))}
                    className="w-full bg-transparent border-b border-f1-gray-700 text-white px-1 py-1 focus:border-f1-red outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-2xs uppercase text-f1-gray-500 mb-1 block">Compound</label>
                  <select 
                    value={stop.compound}
                    onChange={(e) => updatePitStop(i, 'compound', e.target.value)}
                    className="w-full bg-transparent border-b border-f1-gray-700 text-white px-1 py-1 outline-none"
                  >
                    <option value="SOFT">SOFT</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HARD">HARD</option>
                  </select>
                </div>
                <button 
                  onClick={() => removePitStop(i)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-f1-gray-800 text-f1-gray-500 hover:text-white mt-4 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            {pitStops.length === 0 && <div className="text-sm text-f1-gray-500 italic py-2">No pit stops. (Zero stop strategy)</div>}
          </div>

          <button 
            onClick={handleSimulate}
            disabled={isSimulating}
            className="w-full mt-4 bg-f1-red hover:bg-red-600 text-white font-bold uppercase tracking-wider py-3 px-4 rounded transition-colors disabled:opacity-50"
          >
            {isSimulating ? 'Simulating...' : 'Run Simulation'}
          </button>
          
          {error && <div className="mt-4 p-3 bg-red-900/30 border border-red-500 text-red-400 text-sm rounded">{error}</div>}
        </div>

        {/* Results Panel */}
        <div className="p-5 rounded flex flex-col" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h3 className="text-lg font-bold uppercase mb-4 text-f1-red">Simulation Results</h3>
          
          {!result ? (
            <div className="flex-1 flex items-center justify-center text-f1-gray-500 italic text-sm text-center">
              Configure your strategy and click run to see how {driver} would have performed.
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-f1-black p-4 rounded border border-f1-gray-800">
                  <div className="text-xs uppercase text-f1-gray-500 mb-1">Actual Race Time</div>
                  <div className="text-xl font-mono">{formatTimeInfo(result.original_total_time)}</div>
                </div>
                <div className="bg-f1-black p-4 rounded border border-f1-gray-800">
                  <div className="text-xs uppercase text-f1-gray-500 mb-1">Simulated Time</div>
                  <div className="text-xl font-mono">{formatTimeInfo(result.simulated_total_time)}</div>
                </div>
              </div>
              
              {result.actual_final_position != null && result.simulated_final_position != null ? (
                <div className="bg-f1-black p-6 rounded border border-f1-gray-800 flex items-center justify-center gap-8 mb-6">
                  <div className="text-center">
                    <div className="text-2xs uppercase text-f1-gray-500 mb-1 tracking-wider">Actual</div>
                    <div className="text-4xl font-black text-white font-mono">P{result.actual_final_position}</div>
                  </div>
                  <div className="text-f1-gray-600 text-2xl">→</div>
                  <div className="text-center">
                    <div className="text-2xs uppercase text-f1-gray-500 mb-1 tracking-wider">Simulated</div>
                    <div className={`text-4xl font-black font-mono ${
                      (result.position_change ?? 0) > 0 ? 'text-green-500' :
                      (result.position_change ?? 0) < 0 ? 'text-f1-red' : 'text-white'
                    }`}>P{result.simulated_final_position}</div>
                  </div>
                  <div className="text-right ml-4">
                    <div className={`text-lg font-bold font-mono ${result.time_delta < 0 ? 'text-green-500' : 'text-f1-red'}`}>
                      {result.time_delta > 0 ? '+' : ''}{result.time_delta.toFixed(1)}s
                    </div>
                    <div className="text-2xs text-f1-gray-500 uppercase tracking-wide">
                      {(result.position_change ?? 0) > 0
                        ? `Gained ${result.position_change} position${(result.position_change ?? 0) > 1 ? 's' : ''}`
                        : (result.position_change ?? 0) < 0
                        ? `Lost ${Math.abs(result.position_change!)} position${Math.abs(result.position_change!) > 1 ? 's' : ''}`
                        : 'Same position'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-f1-black p-6 rounded border border-f1-gray-800 flex flex-col items-center justify-center mb-6">
                  <div className="text-sm uppercase text-f1-gray-500 mb-2">Net Time Difference</div>
                  <div className={`text-4xl font-bold font-mono ${result.time_delta < 0 ? 'text-green-500' : 'text-f1-red'}`}>
                    {result.time_delta > 0 ? '+' : ''}{result.time_delta.toFixed(3)}s
                  </div>
                  <div className="text-xs text-f1-gray-400 mt-2 uppercase tracking-wide">
                    {result.time_delta < 0 ? 'Faster than reality' : 'Slower than reality'}
                  </div>
                </div>
              )}
              
              <div className="bg-f1-black p-4 rounded border border-f1-gray-800 mb-6">
                <div className="text-sm uppercase text-f1-gray-500 mb-4">Simulated Pace Profile</div>
                <div className="w-full">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                      <XAxis dataKey="lap" stroke="#666" tick={{ fill: '#666', fontSize: 11 }} />
                      <YAxis domain={['auto', 'auto']} stroke="#666" tick={{ fill: '#666', fontSize: 11 }} width={45} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#151515', border: '1px solid #333', borderRadius: '4px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px' }}
                        labelStyle={{ color: '#aaa', fontSize: '10px', marginBottom: '4px' }}
                        formatter={(value: any) => [`${value}s`, 'Pace']}
                        labelFormatter={(label) => `Lap ${label}`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="lapTime" 
                        stroke="var(--color-f1-red)" 
                        strokeWidth={2} 
                        dot={false}
                        activeDot={{ r: 4 }} 
                      />
                      {pitStops.map((stop, i) => (
                        <ReferenceLine key={i} x={stop.lap} stroke="#eab308" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'PIT', fill: '#eab308', fontSize: 10 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              {/* Position by lap chart */}
              {result.simulated_laps.some(l => l.position != null) && (
                <div className="bg-f1-black p-4 rounded border border-f1-gray-800 mb-6">
                  <div className="text-sm uppercase text-f1-gray-500 mb-4">Position by Lap — Actual vs Simulated</div>
                  <div className="w-full">
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={result.simulated_laps
                          .filter(l => l.position != null)
                          .map(l => ({ lap: l.lap_number, actual: l.actual_position, simulated: l.position }))}
                        margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="lap" stroke="#555" tick={{ fill: '#555', fontSize: 10 }} />
                        <YAxis reversed domain={[1, 'dataMax']} stroke="#555" tick={{ fill: '#555', fontSize: 10 }} width={30} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#151515', border: '1px solid #333', borderRadius: 4 }}
                          itemStyle={{ fontSize: 11 }}
                          labelFormatter={l => `Lap ${l}`}
                        />
                        <Line type="stepAfter" dataKey="actual" stroke="#FFFFFF" strokeWidth={1.5} strokeOpacity={0.35} dot={false} name="Actual" />
                        <Line type="stepAfter" dataKey="simulated" stroke="var(--color-f1-red)" strokeWidth={2} dot={false} name="Simulated" />
                        {pitStops.map((stop, i) => (
                          <ReferenceLine key={i} x={stop.lap} stroke="#eab308" strokeDasharray="3 3"
                            label={{ value: 'PIT', fill: '#eab308', fontSize: 9, position: 'insideTopLeft' }} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-2xs text-f1-gray-500">
                      <span style={{ width: 12, height: 2, background: '#FFF', opacity: 0.35, display: 'inline-block', borderRadius: 1 }} />
                      Actual
                    </span>
                    <span className="flex items-center gap-1.5 text-2xs text-f1-gray-500">
                      <span style={{ width: 12, height: 2, background: 'var(--color-f1-red)', display: 'inline-block', borderRadius: 1 }} />
                      Simulated
                    </span>
                  </div>
                </div>
              )}

              {/* Final standings grid */}
              {result.final_standings && result.final_standings.length > 0 && (
                <div className="bg-f1-black p-4 rounded border border-f1-gray-800 mb-6">
                  <div className="text-sm uppercase text-f1-gray-500 mb-3">Simulated Final Classification — Top 10</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))', gap: 4 }}>
                    {result.final_standings.slice(0, 10).map(s => {
                      const diff = (s.actual_position || 0) - s.simulated_position;
                      const isTarget = s.driver_code === driver;
                      return (
                        <div
                          key={s.driver_code}
                          style={{
                            padding: '6px 8px', borderRadius: 4, fontSize: 10,
                            background: isTarget ? 'rgba(225,6,0,0.1)' : '#111',
                            border: `1px solid ${isTarget ? 'rgba(225,6,0,0.3)' : '#222'}`,
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <span className="font-mono font-bold text-f1-gray-400" style={{ width: 20 }}>P{s.simulated_position}</span>
                          <span className={`font-bold ${isTarget ? 'text-f1-red' : 'text-white'}`} style={{ fontSize: 11 }}>{s.driver_code}</span>
                          {diff !== 0 && (
                            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: diff > 0 ? '#22C55E' : '#EF4444' }}>
                              {diff > 0 ? `▲${diff}` : `▼${Math.abs(diff)}`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-xs text-f1-gray-500 italic mt-auto">
                * Note: Simulation accounts for generic fuel burn, estimated tyre degradation for this compound, average traffic patterns, and standard pit stop time loss.
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Ghost Replay Integration */}
      {result && trackPoints.length > 0 && (
        <div className="p-5 rounded mt-auto flex flex-col h-[500px]" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex flex-row justify-between items-center mb-4 border-b border-f1-gray-800 pb-4">
             <div className="flex items-center gap-3">
               <h3 className="text-lg font-bold uppercase text-f1-red">Ghost Car Interactive Replay</h3>
               <span className="bg-f1-red text-white text-2xs px-2 py-0.5 uppercase mb-1 rounded-sm font-bold tracking-wider">New</span>
             </div>
             
             <div className="flex items-center gap-4">
               <div className="text-sm font-mono text-f1-gray-400 w-24">
                 T: {formatTimeInfo(playbackTime)}
               </div>
               <button 
                 onClick={togglePlayback}
                 className="flex items-center justify-center w-8 h-8 rounded-full bg-f1-red text-white hover:bg-red-600 transition-colors"
               >
                 {isPlaying ? '⏸' : '▶'}
               </button>
             </div>
          </div>
          
          <div className="px-4 mb-4">
            <input 
              type="range" 
              min={0} 
              max={result.simulated_total_time} 
              step={0.1}
              value={playbackTime}
              onChange={(e) => {
                setPlaybackTime(parseFloat(e.target.value));
              }}
              className="w-full accent-f1-red"
            />
          </div>

          <div className="relative flex-1 bg-f1-black rounded border border-f1-gray-800 overflow-hidden group">
            <LiveTrackMap 
              trackPoints={trackPoints}
              rotation={trackRotation}
              drivers={ghostMarker}
              highlightedDrivers={['SIM']}
              showDriverNames={true}
            />
            {/* Overlay stats */}
            <div className="absolute top-4 right-4 bg-f1-dark/80 backdrop-blur-sm p-3 rounded border border-f1-gray-700 pointer-events-none transition-opacity opacity-100 group-hover:opacity-50">
               {ghostMarker.length > 0 && (
                 <div className="flex items-center gap-2">
                   <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ghostMarker[0].color }}></div>
                   <span className="text-xs uppercase font-bold tracking-widest text-white">SIMULATED PACE</span>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulatorView;
