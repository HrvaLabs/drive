import { useState } from 'react';
import type { Car } from '../history/types';
import { carEmoji } from '../history/car';
import { filesFromDrop } from '../dnd';

interface Props {
  files: File[];
  setFiles: (f: File[]) => void;
  pricePerL: string;
  setPricePerL: (v: string) => void;
  cars: Car[];
  selectedCarVin: string;
  setSelectedCarVin: (vin: string) => void;
  onAddCar: (file: File) => void;
  onRemoveCar: (vin: string) => void;
  onRenameCar: (vin: string) => void;
  onDecodeCar: (vin: string) => void;
  decodingVin: string;
  onAnalyze: () => void;
  loading: boolean;
}

// Shared upload controls — used in the landing hero and in the compact bar above
// the dashboard. The chosen car is reused on every drive (no .brc re-upload).
export default function Uploader({
  files, setFiles, pricePerL, setPricePerL,
  cars, selectedCarVin, setSelectedCarVin, onAddCar, onRemoveCar, onRenameCar,
  onDecodeCar, decodingVin,
  onAnalyze, loading,
}: Props) {
  const selectedCar = cars.find((c) => c.vin === selectedCarVin);
  const [drag, setDrag] = useState(false);
  return (
    <div className={`upload no-print${drag ? ' upload--drag' : ''}`}
         onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
         onDragLeave={() => setDrag(false)}
         onDrop={(e) => {
           e.preventDefault();
           setDrag(false);
           filesFromDrop(e.dataTransfer).then((fs) => { if (fs.length > 0) setFiles(fs); });
         }}>
      <label className="upload__field">
        <span className="upload__caption">Drive log(s) · CSV</span>
        <input type="file" aria-label="drive file" accept=".csv" multiple
               onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      </label>
      <label className="upload__field">
        <span className="upload__caption">Car · .brc (optional)</span>
        <span className="car-control">
          <select aria-label="car" value={selectedCarVin} onChange={(e) => setSelectedCarVin(e.target.value)}>
            <option value="">No car</option>
            {cars.map((c) => (
              <option key={c.vin} value={c.vin}>
                {c.make ? `${carEmoji(c.bodyClass)} ${c.label || c.vin}` : c.label || c.vin}
              </option>
            ))}
          </select>
          <label className="car-control__add" title="Add a car from its Car Scanner .brc file">
            + Add (.brc)
            <input type="file" aria-label="add car file" accept=".brc" style={{ display: 'none' }}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddCar(f); e.currentTarget.value = ''; }} />
          </label>
          {selectedCar && (
            <button type="button" className="car-control__x" aria-label="rename car"
                    title="Rename this car" onClick={() => onRenameCar(selectedCar.vin)}>✎</button>
          )}
          {selectedCarVin && (
            <button type="button" className="car-control__x" aria-label="remove car"
                    title="Remove this car" onClick={() => onRemoveCar(selectedCarVin)}>✕</button>
          )}
          {selectedCar && selectedCar.vin && !selectedCar.make && (
            <button type="button" className="car-control__add" aria-label="decode vin"
                    title="Look up make/model from NHTSA — sends your VIN"
                    disabled={decodingVin === selectedCar.vin}
                    onClick={() => onDecodeCar(selectedCar.vin)}>
              {decodingVin === selectedCar.vin ? 'Decoding…' : 'Decode'}
            </button>
          )}
        </span>
      </label>
      <label className="upload__field">
        <span className="upload__caption">Fuel price · €/L (optional)</span>
        <input type="number" aria-label="fuel price per litre" step="0.01" min="0"
               inputMode="decimal" placeholder="e.g. 1.65" value={pricePerL}
               onChange={(e) => setPricePerL(e.target.value)} />
      </label>
      <button className="btn btn--primary upload__go" aria-label="analyze drive"
              onClick={onAnalyze} disabled={!files.length || loading}>
        {loading ? 'Analyzing…' : files.length > 1 ? `Analyze ${files.length}` : 'Analyze'}
      </button>
    </div>
  );
}
