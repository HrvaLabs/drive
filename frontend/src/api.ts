import type { DriveAnalysis } from './types';

export async function analyzeDrive(
  file: File,
  brc?: File | null,
  pricePerL?: string,
  vehicle?: { vin?: string; label?: string; engine?: string },
  annualKm?: number | null,
): Promise<DriveAnalysis> {
  const form = new FormData();
  form.append('file', file);
  form.append('format', 'vertical_layout');
  if (brc) {
    form.append('brc', brc);
  }
  const price = Number(pricePerL);
  if (pricePerL && Number.isFinite(price) && price > 0) {
    form.append('pricePerL', pricePerL);
  }
  if (annualKm != null && annualKm > 0) {
    form.append('annualKm', String(Math.round(annualKm)));
  }
  if (!brc && vehicle) {
    if (vehicle.vin) form.append('vin', vehicle.vin);
    if (vehicle.label) form.append('label', vehicle.label);
    if (vehicle.engine) form.append('engine', vehicle.engine);
  }
  const res = await fetch('/api/v1/drives:analyze', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DriveAnalysis;
}
