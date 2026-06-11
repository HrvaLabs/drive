// Opt-in VIN decode via NHTSA vPIC (free, no key, CORS-open). Called only when the
// user presses "Decode" — the only time a VIN leaves the device. Our server is not involved.
export interface DecodedVehicle {
  make: string;
  model: string;
  year: string;
  bodyClass: string;
  fuelType: string;
}

// NHTSA returns makes in ALL CAPS; title-case them, but keep genuine acronym brands upper.
const ACRONYM_MAKES = new Set(['BMW', 'GMC', 'RAM', 'MG', 'MINI', 'BYD']);
const titleCase = (s: string): string =>
  ACRONYM_MAKES.has(s.toUpperCase())
    ? s.toUpperCase()
    : s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

export async function decodeVin(vin: string): Promise<DecodedVehicle | null> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const r = (await res.json())?.Results?.[0];
    if (!r || !r.Make || !r.Model) return null;
    return {
      make: titleCase(r.Make),
      model: r.Model,
      year: r.ModelYear ?? '',
      bodyClass: r.BodyClass ?? '',
      fuelType: r.FuelTypePrimary ?? '',
    };
  } catch {
    return null;
  }
}
