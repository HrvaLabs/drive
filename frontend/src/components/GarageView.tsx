import type { Car, NamedPlace, StoredDrive } from '../history/types';
import { carEmoji, decodedName } from '../history/car';
import { carStats } from '../history/carStats';
import PlacesMap from './PlacesMap';

interface Props {
  cars: Car[];
  drives: StoredDrive[];
  onRenameCar: (vin: string) => void;
  onRemoveCar: (vin: string) => void;
  onDecodeCar: (vin: string) => void;
  decodingVin: string;
  places?: NamedPlace[];
  onDeletePlace?: (id: string) => void;
  onRenamePlace?: (id: string) => void;
  onResizePlace?: (id: string) => void;
}

// "Home", "Work" geo circles the user saved — local only, drive auto-tagging.
// Moving a place = click its new spot on any route map and reuse the name.
function PlacesCard({ places, onDelete, onRename, onResize }: {
  places: NamedPlace[];
  onDelete?: (id: string) => void;
  onRename?: (id: string) => void;
  onResize?: (id: string) => void;
}) {
  if (places.length === 0) return null;
  return (
    <section className="card">
      <h3 className="section-title">Saved places <small>· local only, never leave this browser</small></h3>
      <div className="drive-list">
        {places.map((p) => (
          <div className="drive-row" key={p.id}>
            <div className="drive-row__main">
              <span className="drive-row__date">{p.name}</span>
              <span className="drive-row__label">±{Math.round(p.radiusKm * 1000)} m circle</span>
            </div>
            <div className="drive-row__actions no-print">
              {onRename && <button className="pill" onClick={() => onRename(p.id)}>Rename</button>}
              {onResize && <button className="pill" onClick={() => onResize(p.id)}>Radius</button>}
              {onDelete && <button className="pill" onClick={() => onDelete(p.id)}>Delete</button>}
            </div>
          </div>
        ))}
      </div>
      <PlacesMap places={places} />
      <p className="placeholder">To move a place, click its new spot on any drive's map and give it the same name.
      Radius changes show here immediately.</p>
    </section>
  );
}

const km = (n: number) => `${Math.round(n).toLocaleString()} km`;
const when = (t: number | null) => (t ? new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—');

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{value}</div>
    </div>
  );
}

export default function GarageView({ cars, drives, onRenameCar, onRemoveCar, onDecodeCar, decodingVin, places = [], onDeletePlace, onRenamePlace, onResizePlace }: Props) {
  if (cars.length === 0) {
    return (
      <div className="dash">
        <section className="card">
          <p className="placeholder">No cars yet — add a car from its <code>.brc</code> on the Analyze tab.</p>
        </section>
        <PlacesCard places={places} onDelete={onDeletePlace} onRename={onRenamePlace} onResize={onResizePlace} />
      </div>
    );
  }
  return (
    <div className="dash">
      {cars.map((c) => {
        const s = carStats(c.vin, drives);
        const identity = [decodedName(c), c.country, c.engine, c.fuelType].filter(Boolean).join(' · ');
        const tiles: Array<[string, string]> = [
          ['Drives', String(s.drives)],
          ['Total distance', km(s.totalKm)],
          ['Total fuel', `${s.totalFuelL.toFixed(1)} L`],
          ['Total cost', `€${s.totalCostEur.toFixed(0)}`],
          ['Total CO₂', `${s.totalCo2Kg.toFixed(0)} kg`],
          ['Avg consumption', `${s.avgL100.toFixed(1)} L/100`],
          ['Avg eco', String(s.avgEco)],
          ['Avg idle', `${s.avgIdlePct.toFixed(0)}%`],
          ['Harsh events', String(s.totalHarshEvents)],
          ['Longest drive', km(s.longestDriveKm)],
          ['Peak power', s.maxHp ? `${s.maxHp.toFixed(0)} hp` : ''],
          ['Top speed', s.topSpeedKmh ? `${s.topSpeedKmh.toFixed(0)} km/h` : ''],
          ['Peak boost', s.peakBoostBar ? `${s.peakBoostBar.toFixed(2)} bar` : ''],
          ['Max RPM', s.maxRpm ? String(Math.round(s.maxRpm)) : ''],
        ];
        return (
          <section className="card garage-car" key={c.vin}>
            <div className="garage-car__head">
              <div>
                <div className="vehicle__name">{c.make ? <span>{carEmoji(c.bodyClass)} </span> : null}{c.label || c.vin}</div>
                {identity && <div className="vehicle__ident">{identity}</div>}
                {!c.make && !identity && <div className="vehicle__ident">VIN not recognised offline — rename to set a name.</div>}
              </div>
              <div className="garage-car__actions no-print">
                <button className="pill" onClick={() => onRenameCar(c.vin)}>Rename</button>
                {!c.model && (
                  <button className="pill" disabled={decodingVin === c.vin} onClick={() => onDecodeCar(c.vin)}>
                    {decodingVin === c.vin ? 'Decoding…' : 'Decode'}
                  </button>
                )}
                <button className="pill" onClick={() => onRemoveCar(c.vin)}>Remove</button>
              </div>
            </div>
            {s.drives > 0 ? (
              <>
                <div className="kpi-grid">{tiles.filter(([, v]) => v !== '').map(([l, v]) => <Tile key={l} label={l} value={v} />)}</div>
                <div className="vehicle__meta">Driving since {when(s.firstAt)} · last driven {when(s.lastAt)}</div>
              </>
            ) : (
              <div className="vehicle__meta">No drives logged for this car yet.</div>
            )}
          </section>
        );
      })}
      <PlacesCard places={places} onDelete={onDeletePlace} onRename={onRenamePlace} onResize={onResizePlace} />
    </div>
  );
}
