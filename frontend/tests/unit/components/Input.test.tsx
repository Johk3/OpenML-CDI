import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input } from '@/components/Input';

describe('Custom Input component', () => {
  it('renders correctly with required props', () => {
    render(<Input label="Username" placeholder="Enter username" />);
    // Input component renders a Label that is linked to the input
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('displays the required asterisk when required is true', () => {
    render(<Input label="Password" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('displays the error message when provided', () => {
    render(<Input label="Email" error="Invalid email address" />);
    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('handles user input correctly', async () => {
    const user = userEvent.setup();
    render(<Input label="Nickname" />);
    const input = screen.getByLabelText('Nickname');

    await user.type(input, 'SuperUser');
    expect(input).toHaveValue('SuperUser');
  });
});
