import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ChartTable from './ChartTable';

describe('ChartTable', () => {
  it('renders a captioned table with headers and rows', () => {
    render(<ChartTable caption="Speed data" columns={['Elapsed', 'Speed']} rows={[['0:00', 10], ['0:01', 20]]} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Speed data')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Elapsed' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 data rows
  });

  it('downsamples long series to the row cap', () => {
    const rows = Array.from({ length: 100 }, (_, i) => [String(i), i] as Array<string | number>);
    render(<ChartTable caption="Big" columns={['i', 'v']} rows={rows} cap={10} />);
    expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(11); // header + ≤cap
  });
});
