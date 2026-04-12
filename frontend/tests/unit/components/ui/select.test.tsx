import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

describe('Select component', () => {
  describe('renders correctly', () => {
    beforeEach(() => {
      render(
        <Select>
          <SelectTrigger aria-label="Select an option">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>,
      );
    });

    it('renders the trigger element', () => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows options after clicking the trigger', async () => {
      const user = userEvent.setup();

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();
    });

    it('displays the selected value after choosing an option', async () => {
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: 'Option 1' }));

      expect(screen.getByText('Option 1')).toBeInTheDocument();
    });
  });
});
