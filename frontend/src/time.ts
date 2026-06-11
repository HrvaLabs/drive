// Drive timestamps are seconds-since-midnight. Charts show ELAPSED time from the
// drive's first sample, so the x-axis answers "how far into the drive" instead of
// a raw value like 58473.

/** Compact axis tick: "45s", "12m", "1h05". */
export function elapsedTick(t: number, t0: number): string {
  const s = Math.max(0, Math.round(t - t0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Drive date, European style with the weekday: "Thu, 11 Jun 2026".
 *  Locale is pinned to en-GB so day-month order never flips per browser. */
export function fmtDriveDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** Drive date + start time: "Thu, 11 Jun 2026 17:57". The time comes from the
 *  filename-parsed driveDate when present; otherwise from the drive's own
 *  logged clock (HH:MM) — never from the upload moment. */
export function fmtDriveDateTime(driveDate: number | null | undefined, savedAt: number, clock?: string | null): string {
  const date = fmtDriveDate(driveDate ?? savedAt);
  const hhmm = driveDate != null
    ? new Date(driveDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : clock ? clock.slice(0, 5) : '';
  return hhmm ? `${date} ${hhmm}` : date;
}

/** Precise tooltip label: "12:34" (m:ss) or "1:05:30" (h:mm:ss). */
export function elapsedFull(t: number, t0: number): string {
  const s = Math.max(0, Math.round(t - t0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
