import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MainLayout } from '@/components/MainLayout';
import { renderWithRouter } from '../../utils';

describe('MainLayout component', () => {
  beforeEach(() => {
    renderWithRouter(
      <MainLayout>
        <div data-testid="test-child">Child Content</div>
      </MainLayout>,
    );
  });

  it('renders the Header', () => {
    expect(screen.getByText('OpenML CDI')).toBeInTheDocument();
  });

  it('renders the Footer', () => {
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders children inside the layout', () => {
    expect(screen.getByTestId('test-child')).toBeInTheDocument();
  });
});
