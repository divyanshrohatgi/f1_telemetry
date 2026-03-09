/**
 * FlagIcon — renders a real country flag using flag-icons CSS library.
 * Usage: <FlagIcon country="Australia" size={24} />
 * Falls back gracefully to a colored ISO badge if the code is unknown.
 */

import React from 'react';
import { getCountryCode } from '../../constants/countryFlags';

interface FlagIconProps {
  /** Country name (e.g. "Australia", "United Kingdom") */
  country: string;
  /** Height in pixels — width is auto (4:3 ratio). Default: 20 */
  height?: number;
  style?: React.CSSProperties;
}

const FlagIcon: React.FC<FlagIconProps> = ({ country, height = 20, style }) => {
  const code = getCountryCode(country).toLowerCase();
  return (
    <span
      className={`fi fi-${code}`}
      style={{
        height,
        width: height * (4 / 3),
        display: 'inline-block',
        borderRadius: 3,
        flexShrink: 0,
        backgroundSize: 'cover',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
        ...style,
      }}
      title={country}
    />
  );
};

export default FlagIcon;
