import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Car } from '../history/types';
import Uploader from './Uploader';

const car = (vin: string, label: string): Car => ({ vin, label, engine: '2.0 TDI', createdAt: 1, lastUsedAt: 1 });

const base = {
  files: [] as File[], setFiles: vi.fn(),
  pricePerL: '', setPricePerL: vi.fn(),
  cars: [] as Car[], selectedCarVin: '', setSelectedCarVin: vi.fn(),
  onAddCar: vi.fn(), onRemoveCar: vi.fn(), onRenameCar: vi.fn(),
  onAnalyze: vi.fn(), loading: false,
  onDecodeCar: vi.fn(), decodingVin: '',
};

describe('Uploader car picker', () => {
  it('lists garage cars and reports selection', () => {
    const setSelectedCarVin = vi.fn();
    render(<Uploader {...base} cars={[car('V1', 'My Car')]} setSelectedCarVin={setSelectedCarVin} />);
    const select = screen.getByLabelText(/^car$/i);
    expect(screen.getByRole('option', { name: 'My Car' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'V1' } });
    expect(setSelectedCarVin).toHaveBeenCalledWith('V1');
  });

  it('adds a car from a .brc file', () => {
    const onAddCar = vi.fn();
    render(<Uploader {...base} onAddCar={onAddCar} />);
    const input = screen.getByLabelText(/add car file/i);
    fireEvent.change(input, { target: { files: [new File(['x'], 'car.brc')] } });
    expect(onAddCar).toHaveBeenCalled();
  });

  it('removes the selected car', () => {
    const onRemoveCar = vi.fn();
    render(<Uploader {...base} cars={[car('V1', 'My Car')]} selectedCarVin="V1" onRemoveCar={onRemoveCar} />);
    fireEvent.click(screen.getByRole('button', { name: /remove car/i }));
    expect(onRemoveCar).toHaveBeenCalledWith('V1');
  });

  it('renders the fuel-price input and reports changes', () => {
    const setPricePerL = vi.fn();
    render(<Uploader {...base} setPricePerL={setPricePerL} />);
    fireEvent.change(screen.getByLabelText(/fuel price per litre/i), { target: { value: '1.70' } });
    expect(setPricePerL).toHaveBeenCalledWith('1.70');
  });

  it('shows the current pricePerL value', () => {
    render(<Uploader {...base} pricePerL="1.65" />);
    expect(screen.getByLabelText(/fuel price per litre/i)).toHaveValue(1.65);
  });

  it('shows a Decode button for an undecoded car and calls onDecodeCar', () => {
    const onDecodeCar = vi.fn();
    render(<Uploader {...base} cars={[car('V1', 'My Car')]} selectedCarVin="V1" onDecodeCar={onDecodeCar} />);
    fireEvent.click(screen.getByRole('button', { name: /decode vin/i }));
    expect(onDecodeCar).toHaveBeenCalledWith('V1');
  });

  it('shows the decoded name in the option and hides Decode once decoded', () => {
    // decode sets the car's label to the decoded name; the option renders the label
    const decoded: Car = { ...car('V1', '2018 Volkswagen Golf'), make: 'Volkswagen', bodyClass: 'Hatchback' };
    render(<Uploader {...base} cars={[decoded]} selectedCarVin="V1" />);
    expect(screen.getByRole('option', { name: /2018 Volkswagen Golf/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /decode vin/i })).toBeNull();
  });

  it('renames the selected car', () => {
    const onRenameCar = vi.fn();
    render(<Uploader {...base} cars={[car('V1', 'My Car')]} selectedCarVin="V1" onRenameCar={onRenameCar} />);
    fireEvent.click(screen.getByRole('button', { name: /rename car/i }));
    expect(onRenameCar).toHaveBeenCalledWith('V1');
  });
});

describe('Uploader drag-and-drop', () => {
  it('dropping CSV files sets them as the selection', async () => {
    const setFiles = vi.fn();
    render(<Uploader {...base} setFiles={setFiles} />);
    const zone = document.querySelector('.upload') as HTMLElement;
    const file = new File(['x'], 'drop.csv', { type: 'text/csv' });
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('upload--drag');
    fireEvent.drop(zone, { dataTransfer: { items: [], files: [file] } });
    await vi.waitFor(() => expect(setFiles).toHaveBeenCalledWith([file]));
    expect(zone.className).not.toContain('upload--drag');
  });

  it('a drop with no CSVs leaves the selection alone', async () => {
    const setFiles = vi.fn();
    render(<Uploader {...base} setFiles={setFiles} />);
    const zone = document.querySelector('.upload') as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { items: [], files: [new File(['x'], 'a.txt')] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(setFiles).not.toHaveBeenCalled();
  });
});
