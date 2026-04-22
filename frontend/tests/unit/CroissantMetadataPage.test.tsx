import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { CroissantMetadataPage } from '../../src/pages/CroissantMetadataPage';
import { renderWithRouter } from '../utils';
// motion/react uses browser APIs not available in jsdom so we gotta do a little working around
vi.mock('motion/react', () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({
          children,
          ...props
        }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
          React.createElement(tag, props, children),
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// Radix TabsContent uses an animation presence system that doesn't run in jsdom.....
// so we replace it with a simple always-rendered wrapper so content is always in the DOM.
vi.mock('../../src/components/ui/tabs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/ui/tabs')>();
  return {
    ...actual,
    TabsContent: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      value?: string;
      forceMount?: boolean;
      children?: React.ReactNode;
    }) => (
      <div role="tabpanel" {...props}>
        {children}
      </div>
    ),
  };
});

// Mock Navigation to test form submission and validation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import React from 'react';

const renderPage = () =>
  render(
    <MemoryRouter>
      <CroissantMetadataPage />
    </MemoryRouter>,
  );

describe('CroissantMetadataPage', () => {
  it('renders the page heading and description', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /dataset metadata/i })).toBeInTheDocument();
    expect(screen.getByText(/configure the croissant metadata/i)).toBeInTheDocument();
  });

  it('renders Dataset and Distribution tab triggers', () => {
    renderPage();

    expect(screen.getByRole('tab', { name: /dataset/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /distribution/i })).toBeInTheDocument();
  });

  it('shows required dataset fields by default', () => {
    renderPage();

    expect(screen.getByLabelText(/dataset name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^license/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dataset url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/creator/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date published/i)).toBeInTheDocument();
  });

  it('shows the Distribution tab with empty state when no items are added', () => {
    renderPage();

    expect(screen.getByText(/no distribution items added yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add distribution/i })).toBeInTheDocument();
  });

  it('adds a distribution item when "Add Distribution" is clicked', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

    await waitFor(() => {
      expect(screen.queryByText(/no distribution items added yet/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument();
    });
  });

  it('labels the second distribution item "File 2"', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 2/i })).toBeInTheDocument(),
    );
  });

  it('uses the distribution file name as the selector button label', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );

    // distribution.name field label is "File Name"
    fireEvent.change(screen.getByLabelText(/^file name/i), { target: { value: 'my-archive' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /my-archive/i })).toBeInTheDocument();
    });
  });

  it('removes a distribution item and returns to empty state', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );

    const removeButton = document.querySelector('.rounded-l-none') as HTMLElement;
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.getByText(/no distribution items added yet/i)).toBeInTheDocument();
    });
  });

  it('shows a hash error banner when submitting with a distribution that has no hash', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/at least one of md5 hash or sha-256 hash is required/i),
      ).toBeInTheDocument();
    });
  });

  it('shows an AlertCircle on the selector button when hash is missing after submit', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    await waitFor(() => {
      const fileButton = screen.getByRole('button', { name: /file 1/i });
      expect(fileButton.querySelector('svg')).toBeInTheDocument();
    });
  });

  it('does not show a hash error when the distribution has an md5 hash', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/md5 hash/i), {
      target: { value: 'abc123def456abc123def456abc123de' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    await waitFor(() => {
      expect(
        screen.queryByText(/at least one of md5 hash or sha-256 hash is required/i),
      ).not.toBeInTheDocument();
    });
  });

  describe('Form Validation - Distribution Empties', () => {
    beforeEach(async () => {
      renderWithRouter(<CroissantMetadataPage />);
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
      );
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
    });

    it('requires file name to be filled out', () => {
      const input = screen.getByLabelText(/file name/i) as HTMLInputElement;
      expect(input.validity.valueMissing).toBe(true);
    });

    it('requires file url to be filled out', () => {
      const input = screen.getByLabelText(/file url/i) as HTMLInputElement;
      expect(input.validity.valueMissing).toBe(true);
    });

    it('requires file format to be filled out', () => {
      const input = screen.getByLabelText(/file format/i) as HTMLInputElement;
      expect(input.validity.valueMissing).toBe(true);
    });
  });

  describe('Form Validation - Invalid Formats', () => {
    beforeEach(() => {
      renderWithRouter(<CroissantMetadataPage />);
    });

    it('requires dataset license to be a url', () => {
      const licenseInput = screen.getByLabelText(/^license/i) as HTMLInputElement;
      fireEvent.change(licenseInput, { target: { value: 'not a url' } });
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      expect(licenseInput.validity.typeMismatch).toBe(true);
    });

    it('requires dataset url to be a url', () => {
      const datasetUrlInput = screen.getByLabelText(/dataset url/i) as HTMLInputElement;
      fireEvent.change(datasetUrlInput, { target: { value: 'not a url' } });
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      expect(datasetUrlInput.validity.typeMismatch).toBe(true);
    });

    it('requires creators to be comma separated', () => {
      const creatorsInput = screen.getByLabelText(/creator\(s\)/i) as HTMLInputElement;
      fireEvent.change(creatorsInput, { target: { value: 'test.name' } });
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      expect(creatorsInput.validity.patternMismatch).toBe(true);
    });

    it('requires date published to be a valid date', () => {
      const datePublishedInput = screen.getByLabelText(/date published/i) as HTMLInputElement;
      fireEvent.change(datePublishedInput, { target: { value: 'not a date' } });
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      expect(datePublishedInput.validity.valueMissing).toBe(true);
    });

    describe('Distribution Formats', () => {
      beforeEach(async () => {
        fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
        await waitFor(() =>
          expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
        );
      });

      it('requires file url to be a url', () => {
        const fileUrlInput = screen.getByLabelText(/file url/i) as HTMLInputElement;
        fireEvent.change(fileUrlInput, { target: { value: 'not a url' } });
        fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
        expect(fileUrlInput.validity.typeMismatch).toBe(true);
      });

      it('requires file format to be a valid mime type', () => {
        const fileFormatInput = screen.getByLabelText(/file format/i) as HTMLInputElement;
        fireEvent.change(fileFormatInput, { target: { value: 'not a mime type' } });
        fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
        expect(fileFormatInput.validity.patternMismatch).toBe(true);
      });

      it('requires md5 hash to be a valid md5 hash', () => {
        const md5Input = screen.getByLabelText(/md5 hash/i) as HTMLInputElement;
        fireEvent.change(md5Input, { target: { value: 'not a md5 hash' } });
        fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
        expect(md5Input.validity.patternMismatch).toBe(true);
      });

      it('requires sha256 hash to be a valid sha256 hash', () => {
        const sha256Input = screen.getByLabelText(/sha-256 hash/i) as HTMLInputElement;
        fireEvent.change(sha256Input, { target: { value: 'not a sha256 hash' } });
        fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
        expect(sha256Input.validity.patternMismatch).toBe(true);
      });
    });
  });

  describe('Successful Form Submission', () => {
    const fillDatasetFields = () => {
      fireEvent.change(screen.getByLabelText(/dataset name/i), {
        target: { value: 'Test Air-on Test' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Test Air-on Test' },
      });
      fireEvent.change(screen.getByLabelText(/^license/i), {
        target: { value: 'https://test-air-on-test.com/license' },
      });
      fireEvent.change(screen.getByLabelText(/dataset url/i), {
        target: { value: 'https://test-air-on-test.com' },
      });
      fireEvent.change(screen.getByLabelText(/creator\(s\)/i), {
        target: { value: 'test, air, on, test' },
      });
      fireEvent.change(screen.getByLabelText(/date published/i), {
        target: { value: '2025-12-01' },
      });
    };

    const fillDistributionFields = () => {
      fireEvent.change(screen.getByLabelText(/file name/i), {
        target: { value: 'test-air-on-test.csv' },
      });
      fireEvent.change(screen.getByLabelText(/file url/i), {
        target: { value: 'https://test-air-on-test.com' },
      });
      fireEvent.change(screen.getByLabelText(/file format/i), { target: { value: 'text/csv' } });
      fireEvent.change(screen.getByLabelText(/md5 hash/i), {
        target: { value: 'abc123def456abc123def456abc123de' },
      });
    };

    beforeEach(() => {
      renderWithRouter(<CroissantMetadataPage />);
    });

    it('navigates to /datasets when only dataset fields are required and valid', async () => {
      fillDatasetFields();
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/datasets');
      });
    });

    it('navigates to /datasets when both dataset and distribution fields are completely valid', async () => {
      fillDatasetFields();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
      );
      fillDistributionFields();

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/datasets');
      });
    });
  });
});
