// Display helpers for a decoded vehicle. carEmoji picks a body-type glyph (crisp on every
// OS); decodedName builds "year make model" once a VIN has been decoded.
export function decodedName(v: { make?: string; model?: string; year?: string }): string {
  if (!v.make) return '';
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

export function carEmoji(bodyClass?: string): string {
  const b = (bodyClass ?? '').toLowerCase();
  if (b.includes('pickup') || b.includes('truck')) return '🛻';
  if (b.includes('van') || b.includes('minivan')) return '🚐';
  if (b.includes('suv') || b.includes('sport utility') || b.includes('crossover') || b.includes('wagon')) return '🚙';
  if (b.includes('convertible') || b.includes('cabriolet') || b.includes('roadster') || b.includes('coupe')) return '🏎️';
  return '🚗';
}
