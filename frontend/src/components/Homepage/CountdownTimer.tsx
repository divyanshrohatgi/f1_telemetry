import { useState, useEffect } from 'react';

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calcRemaining(target: string): Remaining | null {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline mr-1">
      <span className="text-2xl font-black text-white tabular-nums tracking-tight" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[10px] text-[#555] font-semibold ml-0.5">{label}</span>
    </span>
  );
}

export default function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [remaining, setRemaining] = useState<Remaining | null>(() => calcRemaining(targetDate));

  useEffect(() => {
    setRemaining(calcRemaining(targetDate));
    const id = setInterval(() => setRemaining(calcRemaining(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!remaining) return <span className="text-sm text-[#666]">Session starting...</span>;

  return (
    <div className="flex items-baseline gap-0.5">
      {remaining.days > 0 && <Unit value={remaining.days} label="d" />}
      <Unit value={remaining.hours} label="h" />
      <Unit value={remaining.minutes} label="m" />
      <Unit value={remaining.seconds} label="s" />
    </div>
  );
}
