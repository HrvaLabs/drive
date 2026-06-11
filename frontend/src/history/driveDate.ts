// Car Scanner names its exports with the drive's start datetime, e.g.
// "2026-06-05 23-20-43.csv". v1 logs carry no calendar date in their rows, so we
// recover the real drive date from the filename — for history bucketing + display.
const RE = /(\d{4})-(\d{2})-(\d{2})(?:[ _T]+(\d{2})[-:.](\d{2})(?:[-:.](\d{2}))?)?/;

export function parseDriveDate(filename?: string | null): number | null {
  if (!filename) return null;
  const m = RE.exec(filename);
  if (!m) return null;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0'] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  // Reject impossible components (e.g. month 13 silently rolling over) by round-tripping.
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return date.getTime();
}
