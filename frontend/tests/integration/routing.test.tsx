import { screen } from '@testing-library/react';
import { Navigate } from 'react-router-dom';
import { routes } from '../../src/routes';
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

  it('redirects the retired profile route to account', () => {
    const profileRoute = routes[0].children?.find((route) => route.path === 'profile');

    expect(profileRoute?.element).toEqual(<Navigate to="/account" replace />);
  });
});
