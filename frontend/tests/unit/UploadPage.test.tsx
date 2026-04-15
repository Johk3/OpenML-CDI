import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UploadPage } from '../../src/pages/UploadPage';
import { renderWithRouter, mockNavigate } from '../utils';

describe('UploadPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockNavigate.mockClear();
    renderWithRouter(<UploadPage />);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the main heading', () => {
    expect(screen.getByText('Share Your Dataset')).toBeInTheDocument();
  });

  it('renders the drag & drop text', () => {
    expect(screen.getByText(/Drag & Drop your dataset here/i)).toBeInTheDocument();
  });

  describe('when a file is selected', () => {
    beforeEach(() => {
      const fileInput = screen.getByTitle('') as HTMLInputElement;
      const file = new File(['hello'], 'hello.csv', { type: 'text/csv' });
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    it('displays the contact form heading', () => {
      expect(screen.getByText('Almost there!')).toBeInTheDocument();
    });

    it('displays the selected file name', () => {
      expect(screen.getByText('hello.csv')).toBeInTheDocument();
    });

    describe('when the user clicks "Change" file', () => {
      beforeEach(() => {
        const changeButton = screen.getByText('Change');
        fireEvent.click(changeButton);
      });

      it('returns to the initial upload state', () => {
        expect(screen.getByText('Share Your Dataset')).toBeInTheDocument();
      });
    });
  });

  describe('when submitting the form successfully', () => {
    beforeEach(() => {
      const fileInput = screen.getByTitle('');
      const file = new File(['success'], 'data.csv', { type: 'text/csv' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'John' } });
      fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Doe' } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'john@example.com' },
      });

      const uploadButton = screen.getByText(/Upload Dataset/i);
      fireEvent.click(uploadButton);
    });

    it('shows the uploading indicator', () => {
      expect(screen.getByText('Uploading…')).toBeInTheDocument();
    });

    it('shows the completion state after delay', async () => {
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      await waitFor(() => {
        expect(screen.getByText('Upload Complete!')).toBeInTheDocument();
      });
    });

    it('shows the user first name in the completion state', async () => {
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      await waitFor(() => {
        expect(screen.getByText('John')).toBeInTheDocument();
      });
    });

    it('navigates to metadata page after completion delay', async () => {
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      await screen.findByText('Upload Complete!');

      act(() => {
        vi.advanceTimersByTime(2500);
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/metadata');
      });
    });
  });

  describe('when submitting the form fails', () => {
    beforeEach(() => {
      const fileInput = screen.getByTitle('');
      // Use 'fail' in file name to trigger the mock error state
      const file = new File(['fail'], 'fail.csv', { type: 'text/csv' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
      fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Smith' } });
      fireEvent.change(screen.getByLabelText(/Email Address/i), {
        target: { value: 'jane@example.com' },
      });

      const uploadButton = screen.getByText(/Upload Dataset/i);
      fireEvent.click(uploadButton);
    });

    it('shows the uploading indicator initially', () => {
      expect(screen.getByText('Uploading…')).toBeInTheDocument();
    });

    it('shows the upload failed state after delay', async () => {
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      await waitFor(() => {
        expect(screen.getByText('Upload Failed')).toBeInTheDocument();
      });
    });

    describe('when the user clicks "Try Again"', () => {
      beforeEach(async () => {
        act(() => {
          vi.advanceTimersByTime(2500);
        });
        await screen.findByText('Upload Failed');
        const retryButton = screen.getByText('Try Again');
        fireEvent.click(retryButton);
      });

      it('returns to the initial upload state', () => {
        expect(screen.getByText('Share Your Dataset')).toBeInTheDocument();
      });
    });
  });
});
