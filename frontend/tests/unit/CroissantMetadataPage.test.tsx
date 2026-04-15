import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { CroissantMetadataPage } from '../../src/pages/CroissantMetadataPage';

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

    vi.restoreAllMocks();
  });

  it('does not show a hash error when no distributions are present', () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    expect(
      screen.queryByText(/at least one of md5 hash or sha-256 hash is required/i),
    ).not.toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('renders the Back and Cancel navigation buttons', () => {
    renderPage();

    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  /*     it('requires dataset name to be filled out to submit', async () => {
              renderPage();
              const nameInput = screen.getByLabelText(/dataset name/i) as HTMLInputElement;
      
      
              fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      
              expect(nameInput.validity.valid).toBe(false);
              expect(nameInput.validity.valueMissing).toBe(true);
      
          })
      
          it('requires description to be filled out to submit', async () => {
              renderPage();
              const descriptionInput = screen.getByLabelText(/description/i) as HTMLInputElement;
      
      
              fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      
              expect(descriptionInput.validity.valid).toBe(false);
              expect(descriptionInput.validity.valueMissing).toBe(true);
      
          })
      
          it('requires license to be filled out to submit', async () => {
              renderPage();
              const licenseInput = screen.getByLabelText(/license/i) as HTMLInputElement;
      
      
              fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      
              expect(licenseInput.validity.valid).toBe(false);
              expect(licenseInput.validity.valueMissing).toBe(true);
      
          })
      
          it('requires dataset url to be filled out to submit', async () => {
              renderPage();
              const datasetUrlInput = screen.getByLabelText(/dataset url/i) as HTMLInputElement;
      
      
              fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      
              expect(datasetUrlInput.validity.valid).toBe(false);
              expect(datasetUrlInput.validity.valueMissing).toBe(true);
      
          })
      
          it('requires creators to be filled out to submit', async () => {
              renderPage();
              const creatorsInput = screen.getByLabelText(/creators/i) as HTMLInputElement;
      
      
              fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      
              expect(creatorsInput.validity.valid).toBe(false);
              expect(creatorsInput.validity.valueMissing).toBe(true);
      
          }) */
});

describe('Required Fields, Input Validation, and Form Submission', () => {
  it('requires dataset name to be filled out to submit', async () => {
    renderPage();
    const nameInput = screen.getByLabelText(/dataset name/i) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    expect(nameInput.validity.valid).toBe(false);
    expect(nameInput.validity.valueMissing).toBe(true);
  });

  it('requires description to be filled out to submit', async () => {
    renderPage();
    const descriptionInput = screen.getByLabelText(/description/i) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    expect(descriptionInput.validity.valid).toBe(false);
    expect(descriptionInput.validity.valueMissing).toBe(true);
  });

  it('requires license to be filled out to submit', async () => {
    renderPage();
    const licenseInput = screen.getByLabelText(/^license/i) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    expect(licenseInput.validity.valid).toBe(false);
    expect(licenseInput.validity.valueMissing).toBe(true);
  });

  it('requires dataset url to be filled out to submit', async () => {
    renderPage();
    const datasetUrlInput = screen.getByLabelText(/dataset url/i) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    expect(datasetUrlInput.validity.valid).toBe(false);
    expect(datasetUrlInput.validity.valueMissing).toBe(true);
  });

  it('requires creators to be filled out to submit', async () => {
    renderPage();
    const creatorsInput = screen.getByLabelText(/creator\(s\)/i) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    expect(creatorsInput.validity.valid).toBe(false);
    expect(creatorsInput.validity.valueMissing).toBe(true);
  });

  it('requires date to be filled out to submit', async () => {
    renderPage();
    const dateInput = screen.getByLabelText(/date published/i) as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    expect(dateInput.validity.valid).toBe(false);
    expect(dateInput.validity.valueMissing).toBe(true);
  });

  it('requires form to be able to be submitted once all valid fields are filled out in dataset page', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/dataset name/i), {
      target: { value: 'Software Development Group Project 2025' },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Madoff Airlines Airlines Website' },
    });
    fireEvent.change(screen.getByLabelText(/^license/i), {
      target: {
        value:
          'https://madoff-airlines-airjoectf-airdawg-palantir-apple-intelligence-finance-minor.com',
      },
    });
    fireEvent.change(screen.getByLabelText(/dataset url/i), {
      target: { value: 'https://axios-backdoor.com' },
    });
    fireEvent.change(screen.getByLabelText(/creator\(s\)/i), {
      target: { value: 'airdawg, metro' },
    });
    fireEvent.change(screen.getByLabelText(/date published/i), { target: { value: '2025-12-01' } });

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/datasets');
    });
  });

  describe('Distribution Page', () => {
    it('requires file name to be filled out to submit', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      const fileNameInput = screen.getByLabelText(/file name/i) as HTMLInputElement;
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      expect(fileNameInput.validity.valid).toBe(false);
      expect(fileNameInput.validity.valueMissing).toBe(true);
    });

    it('requires file url to be filled out to submit', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      const fileUrlInput = screen.getByLabelText(/file url/i) as HTMLInputElement;
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      expect(fileUrlInput.validity.valid).toBe(false);
      expect(fileUrlInput.validity.valueMissing).toBe(true);
    });

    it('requires file format to be filled out to submit', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      const fileFormatInput = screen.getByLabelText(/file format/i) as HTMLInputElement;
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      expect(fileFormatInput.validity.valid).toBe(false);
      expect(fileFormatInput.validity.valueMissing).toBe(true);
    });

    it('requires md5 to be filled out to submit even though all other mandatory fields are filled in', async () => {
      renderPage();
      // Dataset Fields
      fireEvent.change(screen.getByLabelText(/dataset name/i), {
        target: { value: 'Software Development Group Project 2025' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Madoff Airlines Airlines Website' },
      });
      fireEvent.change(screen.getByLabelText(/^license/i), {
        target: {
          value:
            'https://madoff-airlines-airjoectf-airdawg-palantir-apple-intelligence-finance-minor.com',
        },
      });
      fireEvent.change(screen.getByLabelText(/dataset url/i), {
        target: { value: 'https://axios-backdoor.com' },
      });
      fireEvent.change(screen.getByLabelText(/creator\(s\)/i), {
        target: { value: 'airdawg, metro' },
      });
      fireEvent.change(screen.getByLabelText(/date published/i), {
        target: { value: '2025-12-01' },
      });

      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      // Distribution fields
      fireEvent.change(screen.getByLabelText(/file name/i), {
        target: { value: 'madoff-files.csv' },
      });
      fireEvent.change(screen.getByLabelText(/file url/i), {
        target: { value: 'https://8am-jim.com' },
      });
      fireEvent.change(screen.getByLabelText(/file format/i), { target: { value: 'text/csv' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      // Hash validation error pops up
      await waitFor(() => {
        expect(
          screen.queryByText(/at least one of md5 hash or sha-256 hash is required/i),
        ).toBeInTheDocument();
      });
    });

    it('requires form to be able to be submitted once all valid fields are filled out both in dataset page and in distribution page', async () => {
      renderPage();
      // Dataset Fields
      fireEvent.change(screen.getByLabelText(/dataset name/i), {
        target: { value: 'Software Development Group Project 2025' },
      });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Madoff Airlines Airlines Website' },
      });
      fireEvent.change(screen.getByLabelText(/^license/i), {
        target: {
          value:
            'https://madoff-airlines-airjoectf-airdawg-palantir-apple-intelligence-finance-minor.com',
        },
      });
      fireEvent.change(screen.getByLabelText(/dataset url/i), {
        target: { value: 'https://axios-backdoor.com' },
      });
      fireEvent.change(screen.getByLabelText(/creator\(s\)/i), {
        target: { value: 'airdawg, metro' },
      });
      fireEvent.change(screen.getByLabelText(/date published/i), {
        target: { value: '2025-12-01' },
      });

      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      // Distribution fields
      fireEvent.change(screen.getByLabelText(/file name/i), {
        target: { value: 'madoff-files.csv' },
      });
      fireEvent.change(screen.getByLabelText(/file url/i), {
        target: { value: 'https://8am-jim.com' },
      });
      fireEvent.change(screen.getByLabelText(/file format/i), { target: { value: 'text/csv' } });
      fireEvent.change(screen.getByLabelText(/md5 hash/i), { target: { value: 'md5' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      // Check that it gets routed to datasets
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/datasets');
      });
    });
  });

  describe('Input validation', () => {
    it('requires dataset license to be a url', async () => {
      renderPage();
      const licenseInput = screen.getByLabelText(/^license/i) as HTMLInputElement;
      fireEvent.change(licenseInput, { target: { value: 'not a url' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(licenseInput.validity.valid).toBe(false);
      expect(licenseInput.validity.typeMismatch).toBe(true);
    });

    it('requires dataset url to be a url', async () => {
      renderPage();
      const datasetUrlInput = screen.getByLabelText(/dataset url/i) as HTMLInputElement;
      fireEvent.change(datasetUrlInput, { target: { value: 'not a url' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(datasetUrlInput.validity.valid).toBe(false);
      expect(datasetUrlInput.validity.typeMismatch).toBe(true);
    });

    it('requires creators to be comma separated', async () => {
      renderPage();
      const creatorsInput = screen.getByLabelText(/creator\(s\)/i) as HTMLInputElement;
      fireEvent.change(creatorsInput, { target: { value: 'test.name' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(creatorsInput.validity.valid).toBe(false);
      expect(creatorsInput.validity.patternMismatch).toBe(true);
    });

    it('requires date published to be a valid date', async () => {
      renderPage();
      const datePublishedInput = screen.getByLabelText(/date published/i) as HTMLInputElement;
      fireEvent.change(datePublishedInput, { target: { value: 'not a date' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(datePublishedInput.validity.valid).toBe(false);
      expect(datePublishedInput.validity.valueMissing).toBe(true);
    });

    it('requires file url to be a url', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      const fileUrlInput = screen.getByLabelText(/file url/i) as HTMLInputElement;
      fireEvent.change(fileUrlInput, { target: { value: 'not a url' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(fileUrlInput.validity.valid).toBe(false);
      expect(fileUrlInput.validity.typeMismatch).toBe(true);
    });

    it('requires file format to be a valid mime type', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      const fileFormatInput = screen.getByLabelText(/file format/i) as HTMLInputElement;
      fireEvent.change(fileFormatInput, { target: { value: 'not a mime type' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(fileFormatInput.validity.valid).toBe(false);
      expect(fileFormatInput.validity.patternMismatch).toBe(true);
    });

    it('requires md5 hash to be a valid md5 hash', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      const md5Input = screen.getByLabelText(/md5 hash/i) as HTMLInputElement;
      fireEvent.change(md5Input, { target: { value: 'not a md5 hash' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(md5Input.validity.valid).toBe(false);
      expect(md5Input.validity.patternMismatch).toBe(true);
    });

    it('requires sha256 hash to be a valid sha256 hash', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

      const sha256Input = screen.getByLabelText(/sha-256 hash/i) as HTMLInputElement;
      fireEvent.change(sha256Input, { target: { value: 'not a sha256 hash' } });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(sha256Input.validity.valid).toBe(false);
      expect(sha256Input.validity.patternMismatch).toBe(true);
    });
  });
});
