import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BestsCard from './BestsCard';
import type { Bests } from '../types';

const bests: Bests = { maxHp: 79.6, peakBoostBar: 0.71, maxAccelG: 0.27, topSpeedKmh: 146, maxRpm: 3355 };

describe('BestsCard', () => {
  it('shows the headline peaks and skips absent ones', () => {
    render(<BestsCard bests={bests} />);
    expect(screen.getByText('146 km/h')).toBeInTheDocument();
    expect(screen.getByText('3355 rpm')).toBeInTheDocument();
    expect(screen.getByText('79.6 hp')).toBeInTheDocument();
    expect(screen.getByText('0.71 bar')).toBeInTheDocument();
  });

  it('renders nothing useful when all peaks are absent', () => {
    const empty: Bests = { maxHp: null, peakBoostBar: null, maxAccelG: null, topSpeedKmh: null, maxRpm: null };
    render(<BestsCard bests={empty} />);
    expect(screen.queryByText(/hp|rpm|km\/h|bar/i)).toBeNull();
  });
});
