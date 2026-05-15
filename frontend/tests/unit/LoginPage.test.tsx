import { screen } from '@testing-library/react';
import { LoginPage } from '@/pages/LoginPage';
import { renderWithRouter } from '../utils';

describe('LoginPage', () => {
  it('uses a same-origin GitHub login URL when no API base URL is configured', () => {
    renderWithRouter(<LoginPage />);

    expect(screen.getByRole('link', { name: /continue with github/i })).toHaveAttribute(
      'href',
      '/api/auth/github/login',
    );
  });
});
