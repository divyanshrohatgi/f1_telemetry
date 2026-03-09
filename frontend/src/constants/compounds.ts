import type { TyreCompound } from '../types/f1.types';

export const COMPOUND_COLORS: Record<TyreCompound, string> = {
  SOFT:    '#FF3333',
  MEDIUM:  '#FFC906',
  HARD:    '#CCCCCC',
  INTER:   '#39B54A',
  WET:     '#0072C6',
  UNKNOWN: '#666666',
};

export const COMPOUND_LABELS: Record<TyreCompound, string> = {
  SOFT:    'S',
  MEDIUM:  'M',
  HARD:    'H',
  INTER:   'I',
  WET:     'W',
  UNKNOWN: '?',
};

export const COMPOUND_TEXT_COLORS: Record<TyreCompound, string> = {
  SOFT:    '#111111',
  MEDIUM:  '#111111',
  HARD:    '#111111',
  INTER:   '#111111',
  WET:     '#FFFFFF',
  UNKNOWN: '#CCCCCC',
};

export function getCompoundColor(compound: string | null): string {
  return COMPOUND_COLORS[(compound as TyreCompound) ?? 'UNKNOWN'] ?? '#666666';
}

export function getCompoundLabel(compound: string | null): string {
  return COMPOUND_LABELS[(compound as TyreCompound) ?? 'UNKNOWN'] ?? '?';
}
