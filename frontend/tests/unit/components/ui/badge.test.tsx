import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '@/components/ui/badge';

describe('Badge component', () => {
  it('renders correctly with default props', () => {
    render(<Badge>Test Badge</Badge>);
    const badge = screen.getByText('Test Badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-primary');
  });

  it('applies variant classes correctly', () => {
    render(<Badge variant="destructive">Error</Badge>);
    const badge = screen.getByText('Error');
    expect(badge).toHaveClass('bg-destructive');
  });

  it('renders as child component when asChild is true', () => {
    render(
      <Badge asChild>
        <a href="/test">Link Badge</a>
      </Badge>,
    );
    const link = screen.getByRole('link', { name: /link badge/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test');
  });
});
