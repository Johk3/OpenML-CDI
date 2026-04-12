import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Label } from '@/components/ui/label';

describe('Label component', () => {
  it('renders correctly', () => {
    render(<Label htmlFor="test-input">Test Label</Label>);
    const label = screen.getByText('Test Label');
    expect(label).toBeInTheDocument();
    expect(label).toHaveAttribute('for', 'test-input');
  });

  it('applies custom classes correctly', () => {
    render(<Label className="custom-label">Test Label</Label>);
    expect(screen.getByText('Test Label')).toHaveClass('custom-label');
  });
});
