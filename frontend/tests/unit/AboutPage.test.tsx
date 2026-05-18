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

    expect(screen.getByText(/connects dataset contributors who need help/i)).toBeInTheDocument();
    expect(screen.getByText(/review communication happens in a GitHub issue/i)).toBeInTheDocument();
  });

  it('should render the workflow section with all steps', () => {
    navigateTo('/about');

    expect(screen.getByRole('heading', { name: /how the workflow works/i })).toBeInTheDocument();

    const steps = [
      { title: 'Upload files and metadata', desc: /submit dataset files and croissant metadata/i },
      { title: 'Safety checks run', desc: /before review starts/i },
      { title: 'GitHub review issue opens', desc: /available experts and the uploader/i },
      { title: 'Experts help refine it', desc: /coordinate in github/i },
      { title: 'Approved data moves forward', desc: /accepted submissions can move/i },
    ];

    steps.forEach((step) => {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
      expect(screen.getByText(step.desc)).toBeInTheDocument();
    });
  });

  it('should render the role section for uploaders and experts', () => {
    navigateTo('/about');

    expect(screen.getByRole('heading', { name: /who uses cdi\?/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /for uploaders/i })).toBeInTheDocument();
    expect(screen.getByText(/get help preparing dataset formatting/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /for experts/i })).toBeInTheDocument();
    expect(
      screen.getByText(/find clean submissions through github review issues/i),
    ).toBeInTheDocument();
  });

  it('should render the contribution section with all features', () => {
    navigateTo('/about');

    expect(screen.getByRole('heading', { name: /why contribute\?/i })).toBeInTheDocument();

    const features = [
      { title: 'A meeting point', desc: /connects contributors with experts/i },
      { title: 'GitHub-based review', desc: /review discussion happens in github/i },
      { title: 'Better OpenML datasets', desc: /proper formatting and metadata/i },
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
