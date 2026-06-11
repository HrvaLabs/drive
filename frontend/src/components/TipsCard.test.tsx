import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TipsCard from './TipsCard';
import type { Tip } from '../types';

const tips: Tip[] = [
  { id: 'reduce_idle', severity: 'warn', title: 'Cut idling', detail: 'You idled 20% of the drive.', eurImpact: null },
  { id: 'coasting_good', severity: 'good', title: 'Great coasting', detail: 'You coasted 5 times.', eurImpact: null },
];

describe('TipsCard', () => {
  it('lists every tip with its title and detail', () => {
    render(<TipsCard tips={tips} />);
    expect(screen.getByText(/Cut idling/)).toBeInTheDocument();
    expect(screen.getByText(/idled 20%/)).toBeInTheDocument();
    expect(screen.getByText(/Great coasting/)).toBeInTheDocument();
  });

  it('renders nothing when there are no tips', () => {
    const { container } = render(<TipsCard tips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the € impact when a tip has one', () => {
    render(<TipsCard tips={[{ id: 'reduce_idle', severity: 'warn', title: 'Cut idling', detail: 'You idled.', eurImpact: 0.45 }]} />);
    expect(screen.getByText(/€0\.45/)).toBeInTheDocument();
  });
});
