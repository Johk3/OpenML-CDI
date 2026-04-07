import { screen } from '@testing-library/react';
import { navigateTo } from '../utils';

describe('AboutPage', () => {
  it('should render the main heading and subtitle', () => {
    navigateTo('/about');

    expect(screen.getByRole('heading', { name: /about openml cdi/i })).toBeInTheDocument();
    expect(screen.getByText(/community data interface · openml/i)).toBeInTheDocument();
  });

  it('should render the description section', () => {
    navigateTo('/about');

    expect(
      screen.getByText(/dedicated portal for contributing machine learning datasets/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/intuitive pipeline to upload, validate, and publish datasets/i),
    ).toBeInTheDocument();
  });

  it('should render the features section with all features', () => {
    navigateTo('/about');

    expect(screen.getByRole('heading', { name: /why contribute\?/i })).toBeInTheDocument();

    const features = [
      { title: 'Open Science', desc: /all datasets are publicly available/i },
      { title: 'Quality Assured', desc: /every submission is reviewed/i },
      { title: 'ML-Ready', desc: /datasets are standardised and enriched/i },
    ];

    features.forEach((feature) => {
      expect(screen.getByRole('heading', { name: feature.title })).toBeInTheDocument();
      expect(screen.getByText(feature.desc)).toBeInTheDocument();
    });
  });

  it('should have the correct visual elements', () => {
    navigateTo('/about');

    const iconContainer = screen
      .getByRole('heading', { name: /about openml cdi/i })
      .parentElement?.parentElement?.querySelector('div');
    expect(iconContainer).toBeInTheDocument();
  });
});
