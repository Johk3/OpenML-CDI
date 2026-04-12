import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Switch } from '@/components/ui/switch';

describe('Switch component', () => {
  it('renders the switch element', () => {
    render(<Switch data-testid="switch" />);
    expect(screen.getByTestId('switch')).toBeInTheDocument();
  });

  it('starts in the unchecked state by default', () => {
    render(<Switch data-testid="switch" />);
    expect(screen.getByTestId('switch')).toHaveAttribute('data-state', 'unchecked');
  });

  it('calls onCheckedChange with true when clicked', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch data-testid="switch" onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByTestId('switch'));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('is disabled when the disabled prop is passed', () => {
    render(<Switch data-testid="switch" disabled />);
    expect(screen.getByTestId('switch')).toBeDisabled();
  });
});
