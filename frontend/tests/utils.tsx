import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../src/routes';

export const navigateTo = (path: string) => {
  const rotuer = createMemoryRouter(routes, {
    initialEntries: [path],
  });

  render(<RouterProvider router={rotuer} />);
};
