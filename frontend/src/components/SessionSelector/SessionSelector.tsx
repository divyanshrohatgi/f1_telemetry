import React, { useState } from 'react';
import type { SeasonResponse, GrandPrixInfo } from '../../types/f1.types';
import { formatSessionType } from '../../utils/formatting';

const SESSION_TYPES = ['FP1', 'FP2', 'FP3', 'Q', 'SQ', 'R', 'S'];
const YEARS = Array.from({ length: 9 }, (_, i) => 2026 - i); // 2026 → 2018

interface SessionSelectorProps {
  onSessionSelect: (year: number, gp: string, sessionType: string) => void;
  season: SeasonResponse | null;
  isLoadingSchedule: boolean;
  isLoadingSession: boolean;
  onYearChange: (year: number) => void;
}

const SessionSelector: React.FC<SessionSelectorProps> = ({
  onSessionSelect,
  season,
  isLoadingSchedule,
  isLoadingSession,
  onYearChange,
}) => {
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedGP, setSelectedGP] = useState<GrandPrixInfo | null>(null);
  const [selectedSession, setSelectedSession] = useState<string>('R');

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    setSelectedGP(null);
    onYearChange(year);
  };

  const handleGPChange = (gpRoundStr: string) => {
    const gp = season?.grands_prix.find((g) => g.round_number.toString() === gpRoundStr) ?? null;
    setSelectedGP(gp);
    if (gp && gp.sessions.length > 0) {
      const defaultSession = gp.sessions.includes('R') ? 'R' : gp.sessions[gp.sessions.length - 1];
      setSelectedSession(defaultSession);
    }
  };

  const handleLoad = () => {
    if (selectedGP) {
      onSessionSelect(selectedYear, selectedGP.round_number.toString(), selectedSession);
    }
  };

  const availableSessions = selectedGP?.sessions ?? SESSION_TYPES;

  return (
    <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="label mb-2">SESSION SELECT</div>

      {/* Year */}
      <Select
        label="YEAR"
        value={selectedYear}
        onChange={(v) => handleYearChange(Number(v))}
        options={YEARS.map((y) => ({ value: y, label: String(y) }))}
      />

      {/* Grand Prix */}
      <Select
        label="GRAND PRIX"
        value={selectedGP?.round_number?.toString() ?? ''}
        onChange={handleGPChange}
        disabled={isLoadingSchedule || !season}
        placeholder={isLoadingSchedule ? 'Loading...' : 'Select GP'}
        options={(season?.grands_prix ?? []).map((gp) => ({
          value: gp.round_number.toString(),
          label: `R${gp.round_number} ${gp.name.replace(' Grand Prix', '').replace(' GP', '')}`,
        }))}
      />

      {/* Session type */}
      <Select
        label="SESSION"
        value={selectedSession}
        onChange={setSelectedSession}
        disabled={!selectedGP}
        options={availableSessions.map((s) => ({
          value: s,
          label: `${s} — ${formatSessionType(s)}`,
        }))}
      />

      {/* Load button */}
      <button
        onClick={handleLoad}
        disabled={!selectedGP || isLoadingSession}
        className="w-full mt-2 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150"
        style={{
          background: !selectedGP || isLoadingSession
            ? '#333'
            : 'var(--color-f1-red)',
          color: !selectedGP || isLoadingSession
            ? 'var(--color-text-tertiary)'
            : '#fff',
          border: 'none',
          borderRadius: '4px',
          cursor: !selectedGP || isLoadingSession ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoadingSession ? 'LOADING...' : 'LOAD SESSION'}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Simple dark select component
// ---------------------------------------------------------------------------
interface SelectProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  options: { value: string | number; label: string }[];
  disabled?: boolean;
  placeholder?: string;
}

const Select: React.FC<SelectProps> = ({
  label,
  value,
  onChange,
  options,
  disabled = false,
  placeholder,
}) => (
  <div>
    <div className="label mb-0.5">{label}</div>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full text-xs py-1 px-2"
      style={{
        background: 'var(--color-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        outline: 'none',
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {placeholder && !value && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </div>
);

export default SessionSelector;
