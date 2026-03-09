import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import type { SessionMetadata, WeatherResponse } from '../../types/f1.types';
import { api } from '../../api/client';
import { formatTemp } from '../../utils/formatting';
import EmptyState from '../common/EmptyState';
import { PanelSkeleton } from '../common/LoadingSpinner';

interface WeatherPanelProps {
  sessionMeta: SessionMetadata;
}

const WeatherPanel: React.FC<WeatherPanelProps> = ({ sessionMeta }) => {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await api.getWeather(
          sessionMeta.year,
          sessionMeta.gp_name,
          sessionMeta.session_type
        );
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load weather');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [sessionMeta]);

  if (isLoading) return <PanelSkeleton rows={2} />;
  if (error) return <EmptyState message="Failed to load weather data" subMessage={error} />;
  if (!data || !data.points.length) return <EmptyState message="No weather data available" />;

  // Find rain laps for overlay
  const rainLaps = data.points.filter((p) => p.rainfall).map((p) => p.lap_number);

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #333' }}>
        <div className="label">WEATHER</div>
      </div>

      {/* Temperature chart */}
      <div className="px-4 pt-4">
        <div className="label mb-2">TEMPERATURE</div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data.points} margin={{ top: 4, right: 16, bottom: 20, left: 48 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#2A2A2A" vertical={false} />
            {rainLaps.map((lap) => (
              <ReferenceArea key={lap} x1={lap - 0.5} x2={lap + 0.5} fill="rgba(0,114,198,0.15)" />
            ))}
            <XAxis
              dataKey="lap_number"
              tick={{ fill: '#555', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#333' }}
              tickLine={false}
              label={{ value: 'LAP', position: 'insideBottomRight', fill: '#555', fontSize: 9, offset: -8 }}
            />
            <YAxis
              tick={{ fill: '#555', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#333' }}
              tickLine={false}
              width={44}
              tickFormatter={(v) => `${v}°C`}
            />
            <Tooltip
              contentStyle={{ background: '#252525', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
              formatter={(v: unknown, name: unknown) => [formatTemp(v as number), name as string]}
              labelStyle={{ color: '#888' }}
            />
            <Line
              dataKey="track_temp"
              stroke="#E10600"
              dot={false}
              strokeWidth={2}
              name="TRACK TEMP"
            />
            <Line
              dataKey="air_temp"
              stroke="#888"
              dot={false}
              strokeWidth={1.5}
              name="AIR TEMP"
              strokeDasharray="4 2"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Humidity */}
      <div className="px-4 pt-4">
        <div className="label mb-2">HUMIDITY</div>
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={data.points} margin={{ top: 4, right: 16, bottom: 20, left: 48 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#2A2A2A" vertical={false} />
            <XAxis
              dataKey="lap_number"
              tick={{ fill: '#555', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#333' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#555', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#333' }}
              tickLine={false}
              width={44}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              contentStyle={{ background: '#252525', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
              formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, 'HUMIDITY']}
            />
            <Line
              dataKey="humidity"
              stroke="#0093CC"
              dot={false}
              strokeWidth={1.5}
              name="HUMIDITY"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="px-4 pt-4 pb-4">
        <div className="label mb-2">SESSION AVERAGES</div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'TRACK TEMP', value: formatTemp(avg(data.points.map((p) => p.track_temp))) },
            { label: 'AIR TEMP', value: formatTemp(avg(data.points.map((p) => p.air_temp))) },
            { label: 'HUMIDITY', value: `${avg(data.points.map((p) => p.humidity))?.toFixed(0) ?? '—'}%` },
          ].map(({ label, value }) => (
            <div key={label} className="panel p-2">
              <div className="label" style={{ marginBottom: 2 }}>{label}</div>
              <div className="mono text-sm" style={{ color: '#F0F0F0' }}>{value}</div>
            </div>
          ))}
        </div>
        {rainLaps.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#0072C6' }} />
            <span className="text-xs" style={{ color: '#0072C6' }}>
              RAINFALL detected on {rainLaps.length} lap{rainLaps.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

function avg(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((v): v is number => v != null && !isNaN(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export default WeatherPanel;
