import 'leaflet/dist/leaflet.css';
import { Circle, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { NamedPlace } from '../history/types';

// Overview map of the saved places so a radius can be eyeballed while editing.
// Circles are visual-only, same styling as on the route map.
export default function PlacesMap({ places }: { places: NamedPlace[] }) {
  if (places.length === 0) return null;
  const single = places.length === 1;
  const bounds = places.map((p) => [p.lat, p.lon]) as LatLngBoundsExpression;
  return (
    <div style={{ height: 300, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', marginTop: 10 }}>
      <MapContainer style={{ height: '100%', width: '100%' }} scrollWheelZoom
                    {...(single ? { center: [places[0].lat, places[0].lon] as [number, number], zoom: 14 }
                                : { bounds, boundsOptions: { padding: [40, 40] } })}>
        <TileLayer attribution="&copy; OpenStreetMap contributors"
                   url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {places.map((p) => (
          <Circle key={p.id} center={[p.lat, p.lon]} radius={p.radiusKm * 1000} interactive={false}
                  pathOptions={{ color: '#ff9f1c', weight: 1, fillOpacity: 0.1 }}>
            <Tooltip permanent direction="center" className="place-label">{p.name}</Tooltip>
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
}
