/**
 * Team colors by season. Frontend fallback when FastF1 color data is unavailable.
 * Canonical 2025 team colors used for all display.
 */

export const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#3671C6',
  'McLaren': '#FF8000',
  'Ferrari': '#E8002D',
  'Mercedes': '#27F4D2',
  'Aston Martin': '#229971',
  'Alpine': '#0093CC',
  'Williams': '#64C4FF',
  'Racing Bulls': '#6692FF',
  'Kick Sauber': '#52E252',
  'Haas F1 Team': '#B6BABD',
  // Historical variants — map to closest current equivalent
  'AlphaTauri': '#6692FF',
  'Toro Rosso': '#6692FF',
  'RB F1 Team': '#6692FF',
  'Alfa Romeo': '#52E252',
  'Alfa Romeo Racing': '#52E252',
  'Sauber': '#52E252',
  'Renault': '#0093CC',
  'Racing Point': '#229971',
  'Force India': '#229971',
};

export function getTeamColor(teamName: string): string {
  return TEAM_COLORS[teamName] ?? '#FFFFFF';
}
