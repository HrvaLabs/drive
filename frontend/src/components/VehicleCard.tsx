import type { DriveAnalysis } from '../types';
import { carEmoji, decodedName } from '../history/car';

interface Props {
  drive: DriveAnalysis['drive'];
  dataQuality: DriveAnalysis['dataQuality'];
  decoded?: { label?: string; make?: string; model?: string; year?: string; country?: string; bodyClass?: string; fuelType?: string };
  routeFrom?: string | null; // named-place override ("Home") over the town
  routeTo?: string | null;
  onNameStart?: () => void; // save this drive's start/end as a named place
  onNameEnd?: () => void;
}

export default function VehicleCard({ drive, dataQuality, decoded, routeFrom, routeTo, onNameStart, onNameEnd }: Props) {
  const from = routeFrom ?? drive.fromPlace;
  const to = routeTo ?? drive.toPlace;
  const identity = decoded?.make
    ? [decodedName(decoded), decoded.country, drive.vehicle.engine, decoded.fuelType].filter(Boolean).join(' · ')
    : drive.vehicle.engine || '';
  return (
    <section className="card vehicle">
      <div className="vehicle__name">
        {decoded?.make ? <span>{carEmoji(decoded.bodyClass)} </span> : null}
        {drive.vehicle.label ?? 'Vehicle'}
      </div>
      {identity && <div className="vehicle__ident">{identity}</div>}
      {from && (
        <div className="vehicle__route">
          {to && to !== from ? `${from} → ${to}` : from}
          {(onNameStart || onNameEnd) && (
            <span className="vehicle__route-actions no-print">
              {onNameStart && <button className="pill" onClick={onNameStart} title="Save this drive's start point as a named place (Home, Work…)">name start</button>}
              {onNameEnd && <button className="pill" onClick={onNameEnd} title="Save this drive's end point as a named place (Home, Work…)">name end</button>}
            </span>
          )}
        </div>
      )}
      {drive.vehicle.vin && <div className="vehicle__vin">VIN {drive.vehicle.vin}</div>}
      <div className="vehicle__meta">
        {dataQuality.pidsPresent.length} signals · distance from {dataQuality.distanceSource}
        {drive.startedAtClock ? ` · started ${drive.startedAtClock.slice(0, 8)}` : ''}
      </div>
    </section>
  );
}
