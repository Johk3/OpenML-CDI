import { screen } from '@testing-library/react';
import { navigateTo } from '../utils';

describe('Router', () => {
  it('should render the upload page for /', () => {
    navigateTo('/');
    expect(screen.getByRole('heading', { name: /share your dataset/i })).toBeInTheDocument();
  });

  it('should render the not found page for an invalid route', () => {
    navigateTo('/invalid-route');

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});
