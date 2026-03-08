import { render, screen } from '@testing-library/react';
import { Footer } from '../../../src/components/Footer';

describe('Footer', () => {
  it('should render a footer with copyright symbol', () => {
    render(<Footer></Footer>);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveTextContent(/©/i);
  });
});
