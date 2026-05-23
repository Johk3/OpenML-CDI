import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { CroissantMetadataPage } from '../../src/pages/CroissantMetadataPage';
import { mockNavigate, renderWithRouter } from '../utils';
import { mockDatasetService } from '../mocks/datasetService';
import { makeUserContext } from '../mocks/builders';
import type { UserRole } from '@/types/auth';

const userContextForRole = (role: UserRole) => makeUserContext({ user: { role } });

const renderPage = () =>
  renderWithRouter(<CroissantMetadataPage />, {
    userContext: userContextForRole('user'),
  });

const renderPageAs = (role: UserRole) =>
  renderWithRouter(<CroissantMetadataPage />, {
    userContext: userContextForRole(role),
  });

const renderPageWithDataset = (
  datasetId: string,
  state: Record<string, string> = {},
  role: UserRole = 'user',
) =>
  renderWithRouter(<CroissantMetadataPage />, {
    initialRoute: '/metadata',
    routeState: { datasetId, ...state },
    userContext: userContextForRole(role),
  });

async function selectLicenseOption(label = 'CC BY 4.0') {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(/^license/i));
  const options = await screen.findAllByRole('option', { name: label });
  await user.click(options[0]);
}

async function openTab(name: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name }));
}

async function fillRequiredDatasetFields({ withLicense = true } = {}) {
  await openTab(/dataset/i);
  fireEvent.change(screen.getByLabelText(/dataset name/i), {
    target: { value: 'test-air-on-test' },
  });
  fireEvent.change(screen.getByLabelText(/^description/i), {
    target: { value: 'Test Air-on Test' },
  });
  if (withLicense) {
    await selectLicenseOption();
  }
  fireEvent.change(screen.getByLabelText(/dataset url/i), {
    target: { value: 'https://test-air-on-test.com' },
  });
  fireEvent.change(screen.getByLabelText(/creator\(s\)/i), {
    target: { value: 'test, air, on, test' },
  });
  fireEvent.change(screen.getByLabelText(/date published/i), {
    target: { value: '2025-12-01' },
  });
}

function fillRequiredDistributionFields({ md5 }: { md5?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/^file name/i), {
    target: { value: 'test-air-on-test.csv' },
  });
  fireEvent.change(screen.getByLabelText(/file url/i), {
    target: { value: 'https://test-air-on-test.com/data.csv' },
  });
  fireEvent.change(screen.getByLabelText(/file format/i), { target: { value: 'text/csv' } });
  if (md5) {
    fireEvent.change(screen.getByLabelText(/md5 hash/i), {
      target: { value: md5 },
    });
  }
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

  it('shows the Distribution tab with empty state when no items are added', async () => {
    renderPage();
    await openTab(/distribution/i);

    expect(screen.getByText(/no distribution items added yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add distribution/i })).toBeInTheDocument();
  });

  it('shows a visible backend error when existing dataset metadata cannot load', async () => {
    mockDatasetService.getDataset.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: 'Invalid request body',
            fields: {
              dataset_id: ['Input should be a valid UUID'],
            },
          },
        },
      },
    });

    renderPageWithDataset('not-a-uuid');

    expect(
      await screen.findByText('Invalid request body: dataset_id: Input should be a valid UUID'),
    ).toBeInTheDocument();
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
    await openTab(/distribution/i);
    expect(screen.getAllByDisplayValue('Generated_Dataset_files.zip').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('512 B')).toBeInTheDocument();
    await openTab(/file sets/i);
    expect(screen.getByDisplayValue('data/**/*')).toBeInTheDocument();
  });

  it('keeps storage-derived metadata read-only for uploaders', async () => {
    renderPageWithDataset('ds-edit');

    expect(await screen.findByDisplayValue('Demo Dataset')).toBeInTheDocument();

    expect(screen.getByLabelText(/dataset url/i)).toBeDisabled();
    expect(screen.getByLabelText(/^description/i)).not.toBeDisabled();
    await openTab(/distribution/i);
    expect(screen.getByLabelText(/file object id/i)).toBeDisabled();
    expect(screen.getByLabelText(/^file name/i)).toBeDisabled();
    expect(screen.getByLabelText(/file url/i)).toBeDisabled();
    expect(screen.getByLabelText(/file format/i)).toBeDisabled();
    expect(screen.getByLabelText(/contained in archive/i)).toBeDisabled();
    expect(screen.getByLabelText(/file size/i)).toBeDisabled();
    expect(screen.getByLabelText(/sha-256 hash/i)).toBeDisabled();
    expect(screen.getByLabelText(/md5 hash/i)).toBeDisabled();
    expect(
      screen.getAllByText(/generated from the uploaded files and cannot be edited/i).length,
    ).toBeGreaterThan(0);
  });

  it('keeps storage-derived metadata read-only for experts during review', async () => {
    renderPageWithDataset('ds-edit', {}, 'expert');

    expect(await screen.findByDisplayValue('Demo Dataset')).toBeInTheDocument();

    expect(screen.getByLabelText(/dataset url/i)).toBeDisabled();
    await openTab(/distribution/i);
    expect(screen.getByLabelText(/file object id/i)).toBeDisabled();
    expect(screen.getByLabelText(/^file name/i)).toBeDisabled();
    expect(screen.getByLabelText(/file url/i)).toBeDisabled();
    expect(screen.getByLabelText(/file format/i)).toBeDisabled();
    expect(screen.getByLabelText(/contained in archive/i)).toBeDisabled();
    expect(screen.getByLabelText(/file size/i)).toBeDisabled();
    expect(screen.getByLabelText(/sha-256 hash/i)).toBeDisabled();
    expect(screen.getByLabelText(/md5 hash/i)).toBeDisabled();
  });

  it('lets users add a record set and an attribute field', async () => {
    renderPage();
    await openTab(/attributes/i);

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
    await openTab(/distribution/i);

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));

    await waitFor(() => {
      expect(screen.queryByText(/no distribution items added yet/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument();
    });
  });

  it('labels the second distribution item "File 2"', async () => {
    renderPage();
    await openTab(/distribution/i);

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
    await openTab(/distribution/i);

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument();

    // distribution.name field label is "File Name"
    fireEvent.change(screen.getByLabelText(/^file name/i), { target: { value: 'my-archive' } });

    expect(screen.getByRole('button', { name: /my-archive/i })).toBeInTheDocument();
  });

  it('removes a distribution item and returns to empty state', async () => {
    renderPage();
    await openTab(/distribution/i);

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
    await fillRequiredDatasetFields();
    await openTab(/distribution/i);

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );
    fillRequiredDistributionFields();

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/at least one of md5 hash or sha-256 hash is required/i),
      ).toBeInTheDocument();
    });
  });

  it('shows an AlertCircle on the selector button when hash is missing after submit', async () => {
    renderPageAs('expert');
    await fillRequiredDatasetFields();
    await openTab(/distribution/i);

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument();
    fillRequiredDistributionFields();

    fireEvent.click(screen.getByRole('button', { name: /save metadata/i }));

    const fileButton = screen.getByRole('button', { name: /test-air-on-test\.csv/i });
    expect(fileButton.querySelector('svg')).toBeInTheDocument();
  });

  it('does not show a hash error when the distribution has an md5 hash', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderPageAs('expert');
    await fillRequiredDatasetFields();
    await openTab(/distribution/i);

    fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /file 1/i })).toBeInTheDocument(),
    );
    fillRequiredDistributionFields({
      md5: 'abc123def456abc123def456abc123de',
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
      await fillRequiredDatasetFields();
      await openTab(/distribution/i);
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
      await fillRequiredDatasetFields();
      await openTab(/distribution/i);
      if (!screen.queryByLabelText(/^file name/i)) {
        fireEvent.click(screen.getByRole('button', { name: /add distribution/i }));
        await screen.findByLabelText(/^file name/i);
      }
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
        await openTab(/distribution/i);
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
      fillActiveDistributionFields('valid.csv');

      await openTab(/attributes/i);
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
      await openTab(/distribution/i);
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
      await openTab(/distribution/i);
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
