import type { DriveMeta } from './types';
import { isParkedLog } from './quality';

// Annualised distance from the user's own logged history: total km of real
// drives extrapolated over the span of recording days. Needs enough data to
// mean something (>= 5 drives across >= 14 days), else null → the analysis
// falls back to its 15 000 km/yr assumption. Honest reading: "if your logging
// reflects your driving".
export function estimateAnnualKm(drives: DriveMeta[]): number | null {
  const usable = drives.filter((d) => !isParkedLog(d) && d.driveDate != null);
  if (usable.length < 5) return null;
  const dates = usable.map((d) => d.driveDate as number);
  const spanDays = (Math.max(...dates) - Math.min(...dates)) / 86400000;
  if (spanDays < 14) return null;
  const totalKm = usable.reduce((s, d) => s + d.distanceKm, 0);
  const annual = (totalKm / spanDays) * 365.25;
  return Math.min(100000, Math.max(1000, Math.round(annual / 100) * 100));
}
