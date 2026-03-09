/**
 * Country utilities for F1 circuits.
 * Uses flag-icons CSS library for SVG flag rendering (works on all platforms including Windows).
 */

/** Country name → ISO 3166-1 alpha-2 code mapping for all F1 circuits. */
export const COUNTRY_CODES: Record<string, string> = {
  'Bahrain': 'BH',
  'Saudi Arabia': 'SA',
  'Australia': 'AU',
  'Japan': 'JP',
  'China': 'CN',
  'United States': 'US',
  'USA': 'US',
  'Miami': 'US',
  'Italy': 'IT',
  'Monaco': 'MC',
  'Spain': 'ES',
  'Canada': 'CA',
  'Austria': 'AT',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'Great Britain': 'GB',
  'Hungary': 'HU',
  'Belgium': 'BE',
  'Netherlands': 'NL',
  'Singapore': 'SG',
  'Azerbaijan': 'AZ',
  'Mexico': 'MX',
  'Brazil': 'BR',
  'Qatar': 'QA',
  'Abu Dhabi': 'AE',
  'UAE': 'AE',
  'Las Vegas': 'US',
  'Portugal': 'PT',
  'France': 'FR',
  'Germany': 'DE',
  'Russia': 'RU',
  'Turkey': 'TR',
  'South Africa': 'ZA',
  'India': 'IN',
  'South Korea': 'KR',
  'Korea': 'KR',
  'Malaysia': 'MY',
  'Argentina': 'AR',
  'Switzerland': 'CH',
  'Sweden': 'SE',
  'Thailand': 'TH',
};

/** Country colors for badge styling (subset for visual variety). */
const COUNTRY_COLORS: Record<string, { bg: string; text: string }> = {
  'AU': { bg: '#003DA5', text: '#fff' },
  'BH': { bg: '#CE1126', text: '#fff' },
  'SA': { bg: '#006C35', text: '#fff' },
  'JP': { bg: '#BC002D', text: '#fff' },
  'CN': { bg: '#DE2910', text: '#FFD500' },
  'US': { bg: '#002868', text: '#fff' },
  'IT': { bg: '#009246', text: '#fff' },
  'MC': { bg: '#CE1126', text: '#fff' },
  'ES': { bg: '#C60B1E', text: '#FFC400' },
  'CA': { bg: '#FF0000', text: '#fff' },
  'AT': { bg: '#ED2939', text: '#fff' },
  'GB': { bg: '#012169', text: '#fff' },
  'HU': { bg: '#477050', text: '#fff' },
  'BE': { bg: '#FDDA24', text: '#000' },
  'NL': { bg: '#FF6600', text: '#fff' },
  'SG': { bg: '#EF3340', text: '#fff' },
  'AZ': { bg: '#0092BC', text: '#fff' },
  'MX': { bg: '#006847', text: '#fff' },
  'BR': { bg: '#009739', text: '#FEDD00' },
  'QA': { bg: '#8D1B3D', text: '#fff' },
  'AE': { bg: '#00732F', text: '#fff' },
  'PT': { bg: '#006600', text: '#FF0000' },
  'FR': { bg: '#002395', text: '#fff' },
  'DE': { bg: '#000000', text: '#FFCC00' },
};

/**
 * Get a 2-letter country code for display.
 */
export function getCountryCode(country: string): string {
  if (COUNTRY_CODES[country]) return COUNTRY_CODES[country];
  const lower = country.toLowerCase();
  for (const [key, code] of Object.entries(COUNTRY_CODES)) {
    if (key.toLowerCase() === lower) return code;
  }
  for (const [key, code] of Object.entries(COUNTRY_CODES)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return code;
  }
  return country.slice(0, 2).toUpperCase();
}

/**
 * Get badge colors for a country code.
 */
export function getCountryColors(code: string): { bg: string; text: string } {
  return COUNTRY_COLORS[code] ?? { bg: '#333', text: '#fff' };
}
