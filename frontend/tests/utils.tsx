import React from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/routes';
import { AuthProvider } from '../src/context/AuthContext';
export { mockNavigate } from './mocks/navigation';

export const navigateTo = (path: string) => {
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
  });

  render(<RouterProvider router={router} />);
};

export const renderWithRouter = (ui: React.ReactElement, { initialPath = '/' } = {}) => {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );
};
