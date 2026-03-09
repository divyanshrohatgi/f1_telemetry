/**
 * TelemetryView — loads telemetry for the active driver and renders TelemetryPlot.
 * Shows a driver switcher bar when multiple drivers are selected.
 */

import React, { useState, useEffect } from 'react';
import type { SessionMetadata, TelemetryResponse } from '../../types/f1.types';
import { api } from '../../api/client';
import TelemetryPlot from './TelemetryPlot';
import CircuitMap from '../CircuitMap/CircuitMap';
import EmptyState from '../common/EmptyState';

interface TelemetryViewProps {
  sessionMeta: SessionMetadata;
  selectedDrivers: string[];
  selectedLap: number | null;
}

const TelemetryView: React.FC<TelemetryViewProps> = ({
  sessionMeta,
  selectedDrivers,
  selectedLap,
}) => {
  const [activeDriver, setActiveDriver] = useState<string | null>(selectedDrivers[0] ?? null);
  const [telemetry, setTelemetry] = useState<TelemetryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localLap, setLocalLap] = useState<number | null>(null);
  const [hoveredDistance, setHoveredDistance] = useState<number | null>(null);
  const [rotationOffset, setRotationOffset] = useState(0);

  // Effective lap: local override takes priority, then parent selectedLap
  const effectiveLap = localLap ?? selectedLap;

  // If the active driver is no longer in selectedDrivers, switch to the first available one.
  useEffect(() => {
    if (selectedDrivers.length === 0) {
      setActiveDriver(null);
      return;
    }
    if (!activeDriver || !selectedDrivers.includes(activeDriver)) {
      setActiveDriver(selectedDrivers[0]);
    }
  }, [selectedDrivers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch telemetry whenever activeDriver, effectiveLap, or session changes.
  useEffect(() => {
    if (!activeDriver) return;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setTelemetry(null);
      try {
        let data: TelemetryResponse;
        if (effectiveLap != null) {
          data = await api.getTelemetry(
            sessionMeta.year,
            sessionMeta.gp_name,
            sessionMeta.session_type,
            activeDriver,
            effectiveLap
          );
        } else {
          data = await api.getFastestLapTelemetry(
            sessionMeta.year,
            sessionMeta.gp_name,
            sessionMeta.session_type,
            activeDriver
          );
        }
        setTelemetry(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load telemetry');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [activeDriver, effectiveLap, sessionMeta]);

  if (!activeDriver) {
    return (
      <EmptyState
        message="Select a driver from the sidebar"
        subMessage="Telemetry will appear here"
      />
    );
  }

  if (error) {
    return <EmptyState message="Failed to load telemetry" subMessage={error} />;
  }

  const driverInfo = sessionMeta.drivers[activeDriver];
  const driverColor = driverInfo?.team_color ?? '#FFFFFF';

  return (
    <div className="w-full h-full flex flex-col">
      {/* Driver selector + Lap selector */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {selectedDrivers.length > 1 && (
          <>
            <span className="label">VIEWING:</span>
            {selectedDrivers.map((code) => {
              const info = sessionMeta.drivers[code];
              const color = info?.team_color ?? '#fff';
              const isActive = activeDriver === code;
              return (
                <button
                  key={code}
                  onClick={() => setActiveDriver(code)}
                  className="mono text-xs px-2 py-0.5 rounded transition-all"
                  style={{
                    color: isActive ? color : 'var(--color-text-tertiary)',
                    border: `1px solid ${isActive ? color : 'var(--color-border)'}`,
                    background: isActive ? `${color}22` : 'transparent',
                    cursor: 'pointer',
                    fontWeight: isActive ? 'bold' : 'normal',
                  }}
                >
                  {code}
                </button>
              );
            })}
          </>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="label">LAP:</span>
          <select
            value={localLap ?? ''}
            onChange={(e) => setLocalLap(e.target.value ? Number(e.target.value) : null)}
            style={{
              fontSize: 9, fontFamily: 'JetBrains Mono', padding: '2px 6px',
              background: 'var(--color-elevated)', color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)', borderRadius: 3, outline: 'none',
            }}
          >
            <option value="">FASTEST</option>
            {Array.from({ length: sessionMeta.total_laps || 70 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>L{n}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {/* Circuit map — shown when GPS data is available */}
        {telemetry?.circuit_points?.length ? (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--color-border)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <CircuitMap
              circuitPoints={telemetry.circuit_points}
              circuitRotation={(telemetry.circuit_rotation ?? 0) + rotationOffset}
              trackColor={driverColor}
              hoveredDistance={hoveredDistance}
              lapDistance={telemetry.lap_distance}
              onRotate={() => setRotationOffset((r) => (r + 90) % 360)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="label" style={{ marginBottom: 4 }}>POSITION TRACKER</div>
              <div className="mono text-2xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Hover over any telemetry channel to track position on circuit
              </div>
              {hoveredDistance != null && (
                <div className="mono text-xs" style={{ color: driverColor }}>
                  Distance: {Math.round(hoveredDistance)}m / {Math.round(telemetry.lap_distance)}m
                  {' '}({((hoveredDistance / telemetry.lap_distance) * 100).toFixed(1)}%)
                </div>
              )}
            </div>
          </div>
        ) : null}

        <TelemetryPlot
          telemetry={telemetry}
          isLoading={isLoading}
          driverColor={driverColor}
          onCrosshairMove={setHoveredDistance}
        />
      </div>
    </div>
  );
};

export default TelemetryView;
