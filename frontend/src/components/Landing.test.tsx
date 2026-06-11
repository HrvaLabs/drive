import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Landing from './Landing';

const props = {
  files: [] as File[],
  setFiles: vi.fn(), pricePerL: '', setPricePerL: vi.fn(),
  cars: [], selectedCarVin: '', setSelectedCarVin: vi.fn(),
  onAddCar: vi.fn(), onRemoveCar: vi.fn(), onRenameCar: vi.fn(), onDecodeCar: vi.fn(),
  decodingVin: '',
  onAnalyze: vi.fn(), loading: false,
};

describe('Landing', () => {
  it('shows the optional-sensors guide mapping PIDs to existing insights', () => {
    render(<Landing {...props} />);
    expect(screen.getByText(/optional sensors to log/i)).toBeInTheDocument();
    expect(screen.getByText(/coolant temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/battery health/i)).toBeInTheDocument();
    expect(screen.getByText(/fuel trim/i)).toBeInTheDocument();
    expect(screen.getByText(/peak boost/i)).toBeInTheDocument();
  });
});
