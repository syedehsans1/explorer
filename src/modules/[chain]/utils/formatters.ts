import { TX_TYPE_LABELS } from './constants';

/** Converts seconds to a human-readable duration: "45s" or "2m 5s" */
export function formatBlockTime(seconds?: string | number): string {
  if (!seconds) return '0s';
  const total = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (total < 60) return `${Math.round(total)}s`;
  const mins = Math.floor(total / 60);
  const secs = Math.round(total % 60);
  return `${mins}m ${secs}s`;
}

/** Formats a number with locale commas: 1234567 → "1,234,567" */
export function formatWithCommas(value: number): string {
  try {
    return Number(value || 0).toLocaleString();
  } catch {
    return String(value);
  }
}

/** Formats a large number in compact notation: 1234567 → "1.23M" */
export function formatCompact(value: number): string {
  const n = Number(value || 0);
  if (n >= 1_000_000_000_000) return (n / 1_000_000_000_000).toFixed(2) + 'T';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

/**
 * Returns a human-readable transaction type label.
 * Falls back to stripping the "Msg" prefix and " (module)" suffix.
 */
export function formatTxType(type: string): string {
  if (!type) return type;
  if (TX_TYPE_LABELS[type]) return TX_TYPE_LABELS[type];
  return type.replace(/^Msg/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** Returns the token id when the name is an IBC hash or 0x address. */
export function shortName(name: string, id: string): string {
  return name.toLowerCase().startsWith('ibc/') || name.toLowerCase().startsWith('0x') ? id : name;
}
