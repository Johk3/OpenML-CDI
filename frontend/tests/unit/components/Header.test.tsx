import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect } from 'vitest';
import { Header } from '@/components/Header';
import { renderWithRouter, mockNavigate } from '../../utils';

describe('Header component', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });
  describe('renders navigation elements', () => {
    it('renders the logo text', () => {
      renderWithRouter(<Header />);
      expect(screen.getByText('OpenML CDI')).toBeInTheDocument();
    });

    it('renders the Upload nav link', () => {
      renderWithRouter(<Header />);
      expect(screen.getByText('Upload')).toBeInTheDocument();
    });

    it('renders the About nav link', () => {
      renderWithRouter(<Header />);
      expect(screen.getByText('About')).toBeInTheDocument();
    });

    it('renders the Login button when no user is logged in', () => {
      renderWithRouter(<Header />, {
        userContext: { user: null, isLoading: false, isError: false },
      });
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });
  });

  describe('logo navigation', () => {
    it('navigates to home when the logo section is clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter(<Header />);

      const logoSection = screen.getByText('OpenML CDI').closest('.logo-section');
      await user.click(logoSection!);

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('dark mode toggle', () => {
    beforeEach(() => {
      localStorage.clear();
      document.documentElement.classList.remove('dark');
    });

    it('saves "dark" to localStorage after the first toggle click', async () => {
      const user = userEvent.setup();
      renderWithRouter(<Header />);

      const toggleBtn = screen.getByTitle('Toggle theme');
      await user.click(toggleBtn);

      expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('adds the "dark" class to <html> after the first toggle click', async () => {
      const user = userEvent.setup();
      renderWithRouter(<Header />);

      const toggleBtn = screen.getByTitle('Toggle theme');
      await user.click(toggleBtn);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('saves "light" to localStorage after the second toggle click', async () => {
      const user = userEvent.setup();
      renderWithRouter(<Header />);

      const toggleBtn = screen.getByTitle('Toggle theme');
      await user.click(toggleBtn);
      await user.click(toggleBtn);

      expect(localStorage.getItem('theme')).toBe('light');
    });

    it('removes the "dark" class from <html> after the second toggle click', async () => {
      const user = userEvent.setup();
      renderWithRouter(<Header />);

      const toggleBtn = screen.getByTitle('Toggle theme');
      await user.click(toggleBtn);
      await user.click(toggleBtn);

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});
