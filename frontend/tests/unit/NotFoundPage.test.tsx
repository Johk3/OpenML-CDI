import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { navigateTo } from '../utils';

describe('NotFoundPage', () => {
  it('renders the 404 message and heading', () => {
    navigateTo('/404');
    expect(screen.getByRole('heading', { name: /Page Not Found/i })).toBeInTheDocument();
  });

  it('renders the subtext explaining the missing page', () => {
    navigateTo('/404');
    expect(
      screen.getByText(/The page you are looking for doesn't exist or has been moved/i),
    ).toBeInTheDocument();
  });

  it('renders a link to return home', () => {
    navigateTo('/404');
    expect(screen.getByRole('link', { name: /Return Home/i })).toBeInTheDocument();
  });

  it('points the return home link to the root path', () => {
    navigateTo('/404');
    const homeLink = screen.getByRole('link', { name: /Return Home/i });
    expect(homeLink).toHaveAttribute('href', '/');
  });
});
