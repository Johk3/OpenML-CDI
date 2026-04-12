import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input } from '@/components/ui/input';

describe('Input component', () => {
  it('renders correctly', () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('handles user input correctly', async () => {
    const user = userEvent.setup();
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');

    await user.type(input, 'Hello World');
    expect(input).toHaveValue('Hello World');
  });

  it('is disabled when disabled prop is passed', () => {
    render(<Input title="disabled-input" disabled />);
    const input = screen.getByTitle('disabled-input');
    expect(input).toBeDisabled();
  });

  it('applies custom classes correctly', () => {
    render(<Input placeholder="Enter text" className="custom-input" />);
    expect(screen.getByPlaceholderText('Enter text')).toHaveClass('custom-input');
  });
});
