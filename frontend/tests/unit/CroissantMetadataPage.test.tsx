import { cleanup, render, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { CroissantMetadataPage } from '../../src/pages/CroissantMetadataPage';
import { renderWithRouter } from '../utils';
import { mockDatasetService } from '../mocks/datasetService';
import { UserContext } from '@/contexts/UserContext';
import type { User } from '@/types/auth';
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

const baseUser: User = {
  id: 'test-user',
  first_name: 'Test',
  last_name: 'User',
  role: 'user',
  email: 'test@example.com',
  username: 'testuser',
  datasets: [],
  created_at: '2026-01-01T00:00:00Z',
};

const userContextForRole = (role: User['role']) => ({
  user: { ...baseUser, role },
  isLoading: false,
  isError: false,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <UserContext.Provider value={userContextForRole('user')}>
        <CroissantMetadataPage />
      </UserContext.Provider>
    </MemoryRouter>,
  );

const renderPageAs = (role: User['role']) =>
  render(
    <MemoryRouter>
      <UserContext.Provider value={userContextForRole(role)}>
        <CroissantMetadataPage />
      </UserContext.Provider>
    </MemoryRouter>,
  );

const renderPageWithDataset = (
  datasetId: string,
  state: Record<string, string> = {},
  role: User['role'] = 'user',
) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/metadata', state: { datasetId, ...state } }]}>
      <UserContext.Provider value={userContextForRole(role)}>
        <CroissantMetadataPage />
      </UserContext.Provider>
    </MemoryRouter>,
  );

async function selectLicenseOption(label = 'CC BY 4.0') {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(/^license/i));
  const options = await screen.findAllByRole('option', { name: label });
  await user.click(options[0]);
}

describe('CroissantMetadataPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockDatasetService.getDataset.mockClear();
    mockDatasetService.updateMetadata.mockClear();
  });

  it('renders all OpenML-focused Croissant tab triggers', () => {
    renderPage();

    expect(screen.getByRole('tab', { name: /dataset/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /distribution/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /file sets/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /attributes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /responsible ai/i })).toBeInTheDocument();
  });

  it('shows required dataset fields by default', () => {
    renderPage();

    expect(screen.getByLabelText(/dataset name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^description/i)).toBeInTheDocument();
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

  it('prefills generated file object and file set metadata from an uploaded dataset', async () => {
    mockDatasetService.getDataset.mockResolvedValueOnce({
      id: 'dataset-generated',
      title: 'Generated Dataset',
      status: 'uploaded',
      owner_id: 'test-user',
      issue_url: '',
      created_at: '2026-05-01T12:30:00Z',
      dataset_metadata: {
        description: {
          text: 'Generated upload description',
          contact: {
            first_name: 'Grace',
            last_name: 'Hopper',
            email: 'grace@example.com',
          },
        },
        objects: [
          {
            original_path: 'Generated_Dataset_files.zip',
            object_key: 'ready/dataset-generated/Generated_Dataset_files.zip',
            content_type: 'application/zip',
            byte_size: 512,
            checksum: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
        ],
        directory_structure: {
          compressed: true,
          representation: 'zip',
          root: 'data',
          paths: ['data/train.csv', 'data/test.csv'],
          archive_path: 'Generated_Dataset_files.zip',
          manifest: {
            version: 1,
            path_count: 2,
            source: 'browser-selection',
          },
        },
      },
    });

    renderPageWithDataset('dataset-generated');

    expect(await screen.findByDisplayValue('Generated Dataset')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Generated upload description')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Grace Hopper')).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Generated_Dataset_files.zip').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('512 B')).toBeInTheDocument();
    expect(screen.getByDisplayValue('data/**/*')).toBeInTheDocument();
  });

  it('keeps storage-derived metadata read-only for uploaders', async () => {
    renderPageWithDataset('ds-edit');

    expect(await screen.findByDisplayValue('Demo Dataset')).toBeInTheDocument();

    expect(screen.getByLabelText(/dataset url/i)).toBeDisabled();
    expect(screen.getByLabelText(/file object id/i)).toBeDisabled();
    expect(screen.getByLabelText(/file url/i)).toBeDisabled();
    expect(screen.getByLabelText(/file size/i)).toBeDisabled();
    expect(screen.getByLabelText(/sha-256 hash/i)).toBeDisabled();
    expect(screen.getByLabelText(/md5 hash/i)).toBeDisabled();
    expect(screen.getByLabelText(/^description/i)).not.toBeDisabled();
    expect(
      screen.getAllByText(/experts can edit this system-generated value/i).length,
    ).toBeGreaterThan(0);
  });

  it('lets experts edit storage-derived metadata during review', async () => {
    renderPageWithDataset('ds-edit', {}, 'expert');

    expect(await screen.findByDisplayValue('Demo Dataset')).toBeInTheDocument();

    expect(screen.getByLabelText(/dataset url/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/file object id/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/file url/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/file size/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/sha-256 hash/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/md5 hash/i)).not.toBeDisabled();
  });

  it('lets users add a record set and an attribute field', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /add record set/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /record set 1/i })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText(/record set name/i), {
      target: { value: 'rows' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add attribute/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /attribute 1/i })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText(/column name/i), {
      target: { value: 'class' },
    });

    expect(screen.getByRole('button', { name: /class/i })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument();

    // distribution.name field label is "File Name"
    fireEvent.change(screen.getByLabelText(/^file name/i), { target: { value: 'my-archive' } });

    expect(screen.getByRole('button', { name: /my-archive/i })).toBeInTheDocument();
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
    renderPageAs('expert');

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
    renderPageAs('expert');

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    const fileButton = screen.getByRole('button', { name: /file 1/i });
    expect(fileButton.querySelector('svg')).toBeInTheDocument();
  });

  it('does not show a hash error when the distribution has an md5 hash', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderPageAs('expert');

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
      renderWithRouter(<CroissantMetadataPage />, {
        userContext: userContextForRole('expert'),
      });
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
    const fillDatasetFields = async () => {
      fireEvent.change(screen.getByLabelText(/dataset name/i), {
        target: { value: 'test-air-on-test' },
      });
      fireEvent.change(screen.getByLabelText(/^description/i), {
        target: { value: 'Test Air-on Test' },
      });
      await selectLicenseOption();
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

    const fillActiveDistributionFields = (
      name: string,
      url = 'https://test-air-on-test.com/data.csv',
    ) => {
      fireEvent.change(screen.getByLabelText(/^file name/i), {
        target: { value: name },
      });
      fireEvent.change(screen.getByLabelText(/file url/i), {
        target: { value: url },
      });
      fireEvent.change(screen.getByLabelText(/file format/i), { target: { value: 'text/csv' } });
      fireEvent.change(screen.getByLabelText(/md5 hash/i), {
        target: { value: 'abc123def456abc123def456abc123de' },
      });
    };

    beforeEach(() => {
      renderWithRouter(<CroissantMetadataPage />, {
        userContext: userContextForRole('expert'),
      });
    });

    it('requires a custom dataset license to be a url', async () => {
      await selectLicenseOption('Custom license URL');

      const licenseInput = screen.getByRole('textbox', {
        name: /license url/i,
      }) as HTMLInputElement;
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

      it('switches to an inactive distribution item with an invalid file url', async () => {
        await fillDatasetFields();
        fillActiveDistributionFields('valid.csv');

        fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
        await waitFor(() =>
          expect(screen.getByRole('button', { name: /file 2/i })).toBeInTheDocument(),
        );
        fillActiveDistributionFields('invalid.csv', 'not a url');

        fireEvent.click(screen.getAllByRole('button', { name: /valid.csv/i })[0]);
        fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

        await waitFor(() => {
          expect((screen.getByLabelText(/file url/i) as HTMLInputElement).value).toBe('not a url');
        });
        expect((screen.getByLabelText(/file url/i) as HTMLInputElement).validity.typeMismatch).toBe(
          true,
        );
        expect(mockNavigate).not.toHaveBeenCalledWith('/datasets');
      }, 30000);
    });

    it('blocks save when JSON annotation fields contain malformed JSON', async () => {
      await fillDatasetFields();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
      );
      fillActiveDistributionFields('valid.csv');

      fireEvent.click(screen.getByRole('button', { name: /add record set/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /record set 1/i })).toBeInTheDocument(),
      );
      fireEvent.change(screen.getByLabelText(/record set name/i), {
        target: { value: 'rows' },
      });
      fireEvent.change(screen.getByLabelText(/^annotation$/i), {
        target: { value: '{bad json' },
      });

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(
        await screen.findByText(/annotation fields must contain valid json/i),
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalledWith('/datasets');
    }, 30000);
  });

  describe('Successful Form Submission', () => {
    const fillDatasetFieldsExceptLicense = () => {
      fireEvent.change(screen.getByLabelText(/dataset name/i), {
        target: { value: 'test-air-on-test' },
      });
      fireEvent.change(screen.getByLabelText(/^description/i), {
        target: { value: 'Test Air-on Test' },
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

    const fillDatasetFields = async () => {
      fillDatasetFieldsExceptLicense();
      await selectLicenseOption();
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

    it('requires at least one distribution resource before saving', async () => {
      await fillDatasetFields();
      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      await waitFor(() => {
        expect(
          screen.getAllByText(/add at least one fileobject or fileset before saving/i).length,
        ).toBeGreaterThan(0);
      });
      expect(mockNavigate).not.toHaveBeenCalledWith('/datasets');
    });

    it('shows a visible validation message when license is not selected', async () => {
      fillDatasetFieldsExceptLicense();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
      );
      fillDistributionFields();

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      expect(await screen.findByText(/license is required/i)).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalledWith('/datasets');
    });

    it('navigates to /datasets when both dataset and distribution fields are completely valid', async () => {
      await fillDatasetFields();
      fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
      );
      fillDistributionFields();

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/datasets');
      });
    }, 30000);

    it('returns to the originating dataset detail page after saving existing metadata', async () => {
      cleanup();
      renderPageWithDataset('ds-edit', { returnTo: '/datasets/ds-edit' });
      expect(await screen.findByDisplayValue('Demo Dataset')).toBeInTheDocument();

      await fillDatasetFields();
      fillDistributionFields();

      fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

      await waitFor(() => {
        expect(mockDatasetService.updateMetadata).toHaveBeenCalledWith(
          'ds-edit',
          expect.any(Object),
        );
        expect(mockNavigate).toHaveBeenCalledWith('/datasets/ds-edit');
      });
    });
  });
});
