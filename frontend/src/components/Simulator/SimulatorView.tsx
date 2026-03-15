import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type {
  SessionMetadata, StrategyResponse, DriverStrategy, Stint,
  WhatIfResponse,
} from '../../types/f1.types';
import { api } from '../../api/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#E8002D',
  MEDIUM: '#FFC906',
  HARD: '#C8C8C8',
  INTERMEDIATE: '#39B54A',
  WET: '#0067FF',
  UNKNOWN: '#888',
};

const COMPOUNDS = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function CompoundBadge({ compound }: { compound: string }) {
  const c = compound.toUpperCase();
  const color = COMPOUND_COLORS[c] || COMPOUND_COLORS.UNKNOWN;
  const text = c === 'INTERMEDIATE' ? 'INTER' : c;
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide"
      style={{ background: color, color: c === 'MEDIUM' || c === 'HARD' ? '#111' : '#fff' }}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Strategy stint bar (single driver)
// ---------------------------------------------------------------------------

interface StintBarProps {
  stints: Stint[];
  totalLaps: number;
  selectedStintIdx: number | null; // index into stints where stint_number > 1
  onSelectPit: (pitIdx: number) => void;
}

function StintBar({ stints, totalLaps, selectedStintIdx, onSelectPit }: StintBarProps) {
  if (!stints.length || totalLaps === 0) return null;
  const pitStints = stints.filter(s => s.stint_number > 1);

  return (
    <div className="relative flex items-center h-7 w-full rounded overflow-hidden select-none">
      {stints.map((stint) => {
        const left = ((stint.start_lap - 1) / totalLaps) * 100;
        const width = ((stint.end_lap - stint.start_lap + 1) / totalLaps) * 100;
        const compound = stint.compound.toUpperCase();
        const color = COMPOUND_COLORS[compound] || COMPOUND_COLORS.UNKNOWN;
        return (
          <div
            key={stint.stint_number}
            className="absolute top-0 h-full border-r border-[#111]"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: color,
              opacity: 0.85,
            }}
          />
        );
      })}
      {/* Pit stop markers */}
      {pitStints.map((stint, idx) => {
        const x = ((stint.start_lap - 1) / totalLaps) * 100;
        const isSelected = selectedStintIdx === idx;
        return (
          <button
            key={stint.stint_number}
            className="absolute top-0 h-full flex flex-col items-center justify-center z-10 group"
            style={{ left: `calc(${x}% - 6px)`, width: 12 }}
            onClick={() => onSelectPit(idx)}
            title={`Pit → ${stint.compound} on lap ${stint.start_lap}`}
          >
            <div
              className="w-2 h-full transition-all"
              style={{
                background: isSelected ? '#fff' : 'rgba(0,0,0,0.6)',
                border: isSelected ? '1px solid #fff' : '1px solid #555',
                borderRadius: 1,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver list item
// ---------------------------------------------------------------------------

function DriverRow({
  ds,
  totalLaps,
  isSelected,
  selectedPitIdx,
  onSelect,
  onSelectPit,
}: {
  ds: DriverStrategy;
  totalLaps: number;
  isSelected: boolean;
  selectedPitIdx: number | null;
  onSelect: () => void;
  onSelectPit: (idx: number) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
        isSelected
          ? 'bg-[#1e1e1e] border border-[#444]'
          : 'hover:bg-[#181818] border border-transparent'
      }`}
      onClick={onSelect}
    >
      {/* Color bar + code */}
      <div className="flex items-center gap-2 w-16 shrink-0">
        <div className="w-1 h-8 rounded-full" style={{ background: `#${ds.team_color}` }} />
        <span className="text-xs font-bold tracking-wider" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
          {ds.driver_code}
        </span>
      </div>
      {/* Stint bar */}
      <div className="flex-1">
        <StintBar
          stints={ds.stints}
          totalLaps={totalLaps}
          selectedStintIdx={isSelected ? selectedPitIdx : null}
          onSelectPit={onSelectPit}
        />
      </div>
      {/* Pit count */}
      <span className="text-[10px] text-[#555] w-4 text-right shrink-0">
        {ds.total_pit_stops}P
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Position-by-lap chart
// ---------------------------------------------------------------------------

interface PosChartProps {
  result: WhatIfResponse;
  teamColor: string;
}

function PositionChart({ result, teamColor }: PosChartProps) {
  const data = result.actual_laps.map((a, i) => ({
    lap: a.lap,
    actual: a.position,
    simulated: result.simulated_laps[i]?.position ?? null,
  }));

  const color = `#${teamColor}`;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
        <XAxis
          dataKey="lap"
          stroke="#444"
          tick={{ fill: '#555', fontSize: 10 }}
          label={{ value: 'Lap', position: 'insideBottomRight', offset: -4, fill: '#555', fontSize: 10 }}
        />
        <YAxis
          reversed
          domain={[1, 20]}
          ticks={[1, 5, 10, 15, 20]}
          stroke="#444"
          tick={{ fill: '#555', fontSize: 10 }}
        />
        <Tooltip
          contentStyle={{ background: '#151515', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
          labelFormatter={(l) => `Lap ${l}`}
          formatter={(v: any, name: any) => [
            `P${v}`,
            name === 'actual' ? 'Actual' : 'Simulated',
          ]}
        />
        <Legend
          iconSize={10}
          iconType="line"
          wrapperStyle={{ fontSize: 11, color: '#888' }}
          formatter={(v) => v === 'actual' ? 'Actual' : 'Simulated'}
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="simulated"
          stroke={color}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Final standings comparison table
// ---------------------------------------------------------------------------

function StandingsTable({ result }: { result: WhatIfResponse }) {
  const { all_drivers_actual_final: actual, all_drivers_simulated_final: simulated, summary } = result;

  const simMap = new Map(simulated.map(d => [d.driver, d]));

  const rows = actual.map((a) => {
    const s = simMap.get(a.driver);
    const delta = s ? a.position - s.position : 0;
    return { driver: a.driver, actualPos: a.position, simPos: s?.position ?? a.position, delta };
  });

  rows.sort((a, b) => a.simPos - b.simPos);

  return (
    <div className="overflow-auto max-h-72">
      <table className="w-full text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        <thead>
          <tr className="text-[#555] uppercase tracking-wider border-b border-[#222]">
            <th className="text-left py-1.5 pl-2 w-6">#</th>
            <th className="text-left py-1.5">Driver</th>
            <th className="text-right py-1.5 pr-2">Actual</th>
            <th className="text-right py-1.5 pr-2">Simulated</th>
            <th className="text-right py-1.5 pr-2">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isTarget = r.driver === summary.driver;
            const improved = r.delta > 0;
            const worsened = r.delta < 0;
            return (
              <tr
                key={r.driver}
                className={`border-b border-[#1a1a1a] ${isTarget ? 'bg-[#1c1c1c]' : ''}`}
              >
                <td className="py-1.5 pl-2 text-[#666]">{r.simPos}</td>
                <td className={`py-1.5 font-bold tracking-wider ${isTarget ? 'text-white' : 'text-[#999]'}`}>
                  {r.driver}
                </td>
                <td className="py-1.5 pr-2 text-right text-[#666]">P{r.actualPos}</td>
                <td className={`py-1.5 pr-2 text-right ${isTarget ? 'text-white' : 'text-[#666]'}`}>
                  P{r.simPos}
                </td>
                <td className={`py-1.5 pr-2 text-right font-bold ${
                  improved ? 'text-green-500' : worsened ? 'text-red-500' : 'text-[#555]'
                }`}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `${r.delta}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SimulatorViewProps {
  sessionMeta: SessionMetadata;
  driver: string;
}

const SimulatorView: React.FC<SimulatorViewProps> = ({ sessionMeta, driver }) => {
  const [strategy, setStrategy] = useState<StrategyResponse | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(true);

  const [selectedDriver, setSelectedDriver] = useState(driver);
  const [selectedPitIdx, setSelectedPitIdx] = useState<number | null>(null);

  const [newPitLap, setNewPitLap] = useState(1);
  const [newCompound, setNewCompound] = useState('MEDIUM');

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parse session_key: "{year}_{gp_sanitized}_{session_type}"
  const { year, sessionType } = useMemo(() => {
    const parts = sessionMeta.session_key.split('_');
    return {
      year: parseInt(parts[0]),
      sessionType: parts[parts.length - 1].toUpperCase(),
    };
  }, [sessionMeta.session_key]);

  useEffect(() => {
    setStrategyLoading(true);
    const parts = sessionMeta.session_key.split('_');
    const gp = parts.slice(1, -1).join('_');
    api.getStrategy(year, gp, sessionType)
      .then(setStrategy)
      .catch(console.error)
      .finally(() => setStrategyLoading(false));
  }, [year, sessionType, sessionMeta.session_key]);

  // Reset pit selection when driver changes
  useEffect(() => {
    setSelectedPitIdx(null);
    setResult(null);
    setError(null);
  }, [selectedDriver]);

  const driversSorted = useMemo(() => {
    if (!strategy) return [];
    return [...strategy.drivers].sort(
      (a, b) => (a.finishing_position ?? 99) - (b.finishing_position ?? 99)
    );
  }, [strategy]);

  const selectedDS = useMemo(
    () => driversSorted.find(d => d.driver_code === selectedDriver) || null,
    [driversSorted, selectedDriver]
  );

  const pitStints = useMemo(() => {
    if (!selectedDS) return [] as Stint[];
    return selectedDS.stints.filter(s => s.stint_number > 1);
  }, [selectedDS]);

  const selectedStint = selectedPitIdx !== null ? pitStints[selectedPitIdx] ?? null : null;

  // Init form values when a pit is selected
  useEffect(() => {
    if (selectedStint) {
      setNewPitLap(selectedStint.start_lap);
      setNewCompound(selectedStint.compound);
    }
  }, [selectedStint]);

  const handleSelectPit = (driverCode: string, pitIdx: number) => {
    if (driverCode !== selectedDriver) {
      setSelectedDriver(driverCode);
      // Reset will happen via useEffect; set pit after delay
      setTimeout(() => setSelectedPitIdx(pitIdx), 0);
    } else {
      setSelectedPitIdx(pitIdx === selectedPitIdx ? null : pitIdx);
    }
  };

  const handleRun = async () => {
    if (!selectedStint) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.whatIfSimulate({
        year,
        gp_name: sessionMeta.gp_name,
        session: sessionType,
        changes: [{
          driver: selectedDriver,
          original_pit_lap: selectedStint.start_lap,
          new_pit_lap: newPitLap,
          new_compound: newCompound,
        }],
      });
      setResult(res);
    } catch (err: any) {
      setError(err.detail || err.message || 'Simulation failed');
    } finally {
      setIsRunning(false);
    }
  };

  const teamColor = selectedDS?.team_color || 'E10600';

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#0d0d0d]" style={{ color: '#ccc' }}>
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[#1a1a1a]">
        <div className="flex items-baseline gap-3">
          <h2
            className="text-lg font-black uppercase tracking-widest text-white"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            What-If Simulator
          </h2>
          <span className="text-[11px] text-[#555] uppercase tracking-wider">
            {sessionMeta.gp_name} · {sessionType}
          </span>
        </div>
        <p className="text-[11px] text-[#444] mt-1">
          Select a driver, click a pit marker on their strategy bar, then adjust the timing and compound.
        </p>
      </div>

      <div className="flex flex-1 gap-0 min-h-0 overflow-hidden">
        {/* Left: driver + strategy list */}
        <div className="w-[340px] shrink-0 border-r border-[#1a1a1a] flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-[#1a1a1a]">
            <div className="flex items-center gap-2">
              {/* Compound legend */}
              {['SOFT', 'MEDIUM', 'HARD'].map(c => (
                <span key={c} className="flex items-center gap-1 text-[9px] text-[#555] uppercase">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: COMPOUND_COLORS[c] }} />
                  {c[0]}
                </span>
              ))}
              <span className="ml-auto text-[9px] text-[#444]">click pit marker to select</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {strategyLoading ? (
              <div className="flex items-center justify-center h-24 text-[#444] text-sm">Loading strategy…</div>
            ) : (
              driversSorted.map(ds => (
                <DriverRow
                  key={ds.driver_code}
                  ds={ds}
                  totalLaps={sessionMeta.total_laps || 60}
                  isSelected={selectedDriver === ds.driver_code}
                  selectedPitIdx={selectedDriver === ds.driver_code ? selectedPitIdx : null}
                  onSelect={() => setSelectedDriver(ds.driver_code)}
                  onSelectPit={(idx) => handleSelectPit(ds.driver_code, idx)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: modifier + results */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Pit modifier */}
          <div className="px-5 py-4 border-b border-[#1a1a1a]">
            <div className="flex items-start gap-6 flex-wrap">
              {/* Driver info */}
              <div className="flex items-center gap-2 min-w-[120px]">
                <div className="w-1.5 h-10 rounded-full" style={{ background: `#${teamColor}` }} />
                <div>
                  <div
                    className="text-base font-black tracking-wider text-white"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {selectedDriver}
                  </div>
                  <div className="text-[10px] text-[#555] uppercase">
                    {selectedDS?.full_name}
                  </div>
                </div>
              </div>

              {/* Selected pit info */}
              {selectedStint ? (
                <>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-[#555] uppercase tracking-wider">Original Pit</span>
                    <span className="text-sm font-bold">Lap {selectedStint.start_lap}</span>
                    <CompoundBadge compound={selectedStint.compound} />
                  </div>
                  <div className="text-[#333] self-center text-lg">→</div>
                  {/* New lap */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-[#555] uppercase tracking-wider">New Pit Lap</span>
                    <input
                      type="number"
                      min={1}
                      max={sessionMeta.total_laps || 70}
                      value={newPitLap}
                      onChange={(e) => setNewPitLap(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 bg-[#111] border border-[#333] text-white text-sm px-2 py-1 rounded focus:border-[#555] focus:outline-none"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    />
                  </div>
                  {/* New compound */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-[#555] uppercase tracking-wider">New Compound</span>
                    <select
                      value={newCompound}
                      onChange={(e) => setNewCompound(e.target.value)}
                      className="bg-[#111] border border-[#333] text-white text-sm px-2 py-1 rounded focus:border-[#555] focus:outline-none"
                    >
                      {COMPOUNDS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {/* Run */}
                  <button
                    onClick={handleRun}
                    disabled={isRunning}
                    className="self-end px-5 py-2 rounded font-bold text-sm uppercase tracking-wider text-white transition-colors disabled:opacity-40"
                    style={{ background: '#E10600' }}
                  >
                    {isRunning ? 'Running…' : 'Simulate'}
                  </button>
                </>
              ) : (
                <div className="flex-1 flex items-center">
                  <p className="text-[11px] text-[#444] italic">
                    {selectedDS
                      ? pitStints.length === 0
                        ? `${selectedDriver} made no pit stops.`
                        : 'Click a white pit marker on the strategy bar above to select a stop.'
                      : 'Select a driver from the list.'}
                  </p>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-3 px-3 py-2 rounded border border-red-900 bg-red-950/30 text-red-400 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 px-5 py-4">
            {!result ? (
              <div className="flex items-center justify-center h-48 text-[#333] text-sm italic">
                Run a simulation to see results.
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#111] rounded-lg p-3 border border-[#1e1e1e]">
                    <div className="text-[9px] text-[#555] uppercase tracking-wider mb-1">Actual Finish</div>
                    <div className="text-2xl font-black text-white" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      P{result.summary.actual_position}
                    </div>
                  </div>
                  <div className="bg-[#111] rounded-lg p-3 border border-[#1e1e1e]">
                    <div className="text-[9px] text-[#555] uppercase tracking-wider mb-1">Simulated Finish</div>
                    <div
                      className="text-2xl font-black"
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        color: result.summary.position_change > 0 ? '#22c55e' :
                               result.summary.position_change < 0 ? '#ef4444' : '#fff',
                      }}
                    >
                      P{result.summary.simulated_position}
                    </div>
                  </div>
                  <div className="bg-[#111] rounded-lg p-3 border border-[#1e1e1e]">
                    <div className="text-[9px] text-[#555] uppercase tracking-wider mb-1">Time Delta</div>
                    <div
                      className="text-2xl font-black"
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        color: result.summary.time_delta < 0 ? '#22c55e' :
                               result.summary.time_delta > 0 ? '#ef4444' : '#fff',
                      }}
                    >
                      {result.summary.time_delta > 0 ? '+' : ''}{result.summary.time_delta.toFixed(1)}s
                    </div>
                  </div>
                </div>

                {/* Charts + table side by side */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {/* Position chart */}
                  <div className="bg-[#111] rounded-lg p-4 border border-[#1e1e1e]">
                    <div className="text-[9px] text-[#555] uppercase tracking-wider mb-3">
                      Position by Lap — <span className="text-[#666]">dashed = actual · solid = simulated</span>
                    </div>
                    <PositionChart result={result} teamColor={teamColor} />
                  </div>

                  {/* Final standings */}
                  <div className="bg-[#111] rounded-lg p-4 border border-[#1e1e1e]">
                    <div className="text-[9px] text-[#555] uppercase tracking-wider mb-3">
                      Final Classification (simulated order)
                    </div>
                    <StandingsTable result={result} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulatorView;
