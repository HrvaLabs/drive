// Offline VIN decoder — make + country from the WMI (first 3 chars) and model year from
// char 10. Pure, no network: the VIN never leaves the device. Tables seeded from the public
// WMI registry / opencars (github.com/opencars, MIT). Unknown WMI → null (never guess a make).

const WMI_MAKES: Record<string, string> = {
  // France
  VF1: 'Renault', VF2: 'Renault', VNV: 'Renault', VF6: 'Renault Trucks',
  VF3: 'Peugeot', VR3: 'Peugeot', VF7: 'Citroën', VR7: 'Citroën', VR1: 'DS',
  UU1: 'Dacia', UU2: 'Dacia',
  // Germany
  WVW: 'Volkswagen', WV1: 'Volkswagen', WV2: 'Volkswagen', WVG: 'Volkswagen', '1VW': 'Volkswagen', '3VW': 'Volkswagen',
  WAU: 'Audi', WA1: 'Audi', WUA: 'Audi', TRU: 'Audi',
  WBA: 'BMW', WBS: 'BMW', WBY: 'BMW', WBX: 'BMW', '5UX': 'BMW', '4US': 'BMW',
  WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WDC: 'Mercedes-Benz', WDF: 'Mercedes-Benz', W1K: 'Mercedes-Benz', W1N: 'Mercedes-Benz',
  WME: 'Smart', WMW: 'Mini', WP0: 'Porsche', WP1: 'Porsche',
  W0L: 'Opel', W0V: 'Opel', WF0: 'Ford', WMA: 'MAN',
  // Italy
  ZFA: 'Fiat', ZFC: 'Fiat', ZFF: 'Ferrari', ZAR: 'Alfa Romeo', ZAM: 'Maserati', ZLA: 'Lancia', ZHW: 'Lamborghini',
  // Spain / Czech / Slovakia
  VSS: 'SEAT', VSE: 'SEAT', TMB: 'Škoda', U5Y: 'Kia', U6Y: 'Kia', TMA: 'Hyundai',
  // UK
  SAL: 'Land Rover', SAJ: 'Jaguar', SAR: 'Rover', SCC: 'Lotus', SCF: 'Aston Martin', SCB: 'Bentley', SCA: 'Rolls-Royce', SBM: 'McLaren',
  SHS: 'Honda', SJN: 'Nissan',
  // Sweden
  YV1: 'Volvo', YV4: 'Volvo', YS3: 'Saab',
  // Japan
  JHM: 'Honda', JHL: 'Honda', JH4: 'Acura', JN1: 'Nissan', JN8: 'Nissan',
  JTD: 'Toyota', JTM: 'Toyota', JTN: 'Toyota', JTH: 'Lexus', JF1: 'Subaru', JF2: 'Subaru',
  JM1: 'Mazda', JM3: 'Mazda', JMZ: 'Mazda', JMB: 'Mitsubishi', JA3: 'Mitsubishi', JS3: 'Suzuki', JYA: 'Yamaha',
  // Korea
  KMH: 'Hyundai', KMF: 'Hyundai', KNA: 'Kia', KND: 'Kia', KNE: 'Kia', KLA: 'Daewoo',
  // USA
  '1FA': 'Ford', '1FT': 'Ford', '1FM': 'Ford', '1FD': 'Ford', '1G1': 'Chevrolet', '1GC': 'Chevrolet',
  '1GT': 'GMC', '1GY': 'Cadillac', '1HG': 'Honda', '19U': 'Acura', '1C4': 'Jeep', '1J4': 'Jeep', '1N4': 'Nissan',
  '5YJ': 'Tesla', '7SA': 'Tesla', '4T1': 'Toyota', '5TD': 'Toyota', '5FN': 'Honda', '2HG': 'Honda', '3FA': 'Ford',
  // China / India
  LFV: 'Volkswagen', LSV: 'Volkswagen', LRW: 'Tesla', LGX: 'BYD', MAT: 'Tata', MA1: 'Mahindra', MAL: 'Hyundai', MBH: 'Maruti Suzuki',
};

const COUNTRY_2: Record<string, string> = {
  VF: '🇫🇷 France', VR: '🇫🇷 France', VS: '🇪🇸 Spain', VV: '🇪🇸 Spain', VN: '🇫🇷 France',
  UU: '🇷🇴 Romania', U5: '🇸🇰 Slovakia', U6: '🇸🇰 Slovakia',
  TM: '🇨🇿 Czechia', TR: '🇭🇺 Hungary', TC: '🇨🇭 Switzerland',
  YV: '🇸🇪 Sweden', YS: '🇸🇪 Sweden', YK: '🇫🇮 Finland',
  ZA: '🇮🇹 Italy', ZB: '🇮🇹 Italy', ZC: '🇮🇹 Italy', ZD: '🇮🇹 Italy', ZF: '🇮🇹 Italy', ZH: '🇮🇹 Italy', ZL: '🇮🇹 Italy', ZM: '🇮🇹 Italy',
  SA: '🇬🇧 UK', SB: '🇬🇧 UK', SC: '🇬🇧 UK', SD: '🇬🇧 UK', SH: '🇬🇧 UK', SJ: '🇬🇧 UK', SK: '🇬🇧 UK', SL: '🇬🇧 UK', SM: '🇬🇧 UK',
};
const COUNTRY_1: Record<string, string> = {
  W: '🇩🇪 Germany', J: '🇯🇵 Japan', K: '🇰🇷 South Korea', L: '🇨🇳 China', M: '🇮🇳 India',
  S: '🇬🇧 UK', T: '🇪🇺 Europe', V: '🇪🇺 Europe', Z: '🇮🇹 Italy', Y: '🇸🇪 Sweden',
  '1': '🇺🇸 USA', '4': '🇺🇸 USA', '5': '🇺🇸 USA', '2': '🇨🇦 Canada', '3': '🇲🇽 Mexico', '6': '🇦🇺 Australia', '9': '🇧🇷 Brazil',
};

// 30 model-year codes in order (skips I,O,Q,U,Z); cycles every 30 years.
const YEAR_CODES = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','R','S','T','V','W','X','Y','1','2','3','4','5','6','7','8','9'];

function vinYear(code: string): string {
  const i = YEAR_CODES.indexOf(code.toUpperCase());
  if (i < 0) return '';
  const recent = 2010 + i;                       // 2010–2039 window
  const now = new Date().getFullYear() + 1;      // allow next-model-year
  return String(recent <= now ? recent : 1980 + i); // else the 1980–2009 window
}

function vinCountry(vin: string): string {
  return COUNTRY_2[vin.slice(0, 2).toUpperCase()] ?? COUNTRY_1[vin[0].toUpperCase()] ?? '';
}

export interface VinInfo { make: string; year: string; country: string }

export function decodeVinOffline(vin: string): VinInfo | null {
  if (!vin || vin.length < 11) return null;
  const make = WMI_MAKES[vin.slice(0, 3).toUpperCase()];
  if (!make) return null;
  return { make, year: vinYear(vin[9]), country: vinCountry(vin) };
}
