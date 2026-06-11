import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Footer from './Footer';

describe('Footer', () => {
  it('shows the copyright line and opens privacy on click', () => {
    const onPrivacy = vi.fn();
    render(<Footer onPrivacy={onPrivacy} />);
    expect(screen.getByText(/HrvaLabs\.net project/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /privacy/i }));
    expect(onPrivacy).toHaveBeenCalledTimes(1);
  });
});
