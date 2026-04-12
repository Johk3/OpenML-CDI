import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Textarea } from '@/components/ui/textarea';

describe('Textarea component', () => {
  it('renders correctly', () => {
    render(<Textarea placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('handles user input correctly', async () => {
    const user = userEvent.setup();
    render(<Textarea placeholder="Enter text" />);
    const textarea = screen.getByPlaceholderText('Enter text');

    await user.type(textarea, 'Hello World');
    expect(textarea).toHaveValue('Hello World');
  });

  it('is disabled when disabled prop is passed', () => {
    render(<Textarea title="disabled-textarea" disabled />);
    const textarea = screen.getByTitle('disabled-textarea');
    expect(textarea).toBeDisabled();
  });

  it('applies custom classes correctly', () => {
    render(<Textarea placeholder="Enter text" className="custom-textarea" />);
    expect(screen.getByPlaceholderText('Enter text')).toHaveClass('custom-textarea');
  });
});
