import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ScoresCard from './ScoresCard';
import type { Scores } from '../types';

const scores: Scores = { eco: 78, style: 'eco', rpmBandPct: 54, idlePct: 13, speedSteadiness: 80, harshEvents: 0 };

describe('ScoresCard', () => {
  it('shows the eco score, style, and rpm-band %', () => {
    render(<ScoresCard scores={scores} eventCount={5} />);
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText(/eco/i)).toBeInTheDocument();
    expect(screen.getByText('54%')).toBeInTheDocument();
    expect(screen.getByText(/5 events/i)).toBeInTheDocument();
  });
});
