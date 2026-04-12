import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button component', () => {
  it('renders correctly with default props', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('bg-primary');
  });

  it('applies variant classes correctly', () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole('button', { name: /delete/i });
    expect(button).toHaveClass('bg-destructive');
  });

  it('applies size classes correctly', () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole('button', { name: /small/i });
    expect(button).toHaveClass('h-8');
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={handleClick}>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    await user.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is passed', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={handleClick}>
        Click me
      </Button>,
    );
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders as child component when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: /link button/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test');
  });
});
