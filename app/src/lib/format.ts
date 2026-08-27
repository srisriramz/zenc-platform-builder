/** Human-readable formatting for counts, rates, and byte sizes. */

export function formatCount(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1_000_000) return `${(n / 1000).toFixed(digits)}k`;
  if (abs < 1_000_000_000) return `${(n / 1_000_000).toFixed(digits)}M`;
  return `${(n / 1_000_000_000).toFixed(digits)}B`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const i = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : digits)} ${BYTE_UNITS[i]}`;
}

export function formatBytesRate(bytesPerSecond: number, digits = 1): string {
  return `${formatBytes(bytesPerSecond, digits)}/s`;
}

export function formatEps(eps: number): string {
  return `${formatCount(eps, 1)}/s`;
}

/** bytes/second → projected bytes/day */
export function perDay(perSecond: number): number {
  return perSecond * 86_400;
}
