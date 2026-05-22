import { ConfirmationDialog, ConfirmationDialogProps } from '@/components/ConfirmationDialog';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('ConfirmationDialog', () => {
  const testProps: ConfirmationDialogProps = {
    title: 'Test Title',
    description: 'Test Description',
    open: true,
    confirmLabel: 'Test Confirm Label',
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };

  it('should render the provided title', () => {
    render(<ConfirmationDialog {...testProps} />);

    const title = screen.getByRole('heading');
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent(testProps.title);
  });

  it('should render the provided description', () => {
    render(<ConfirmationDialog {...testProps} />);

    const description = screen.getByRole('paragraph');
    expect(description).toBeInTheDocument();
    expect(description).toHaveTextContent(testProps.description);
  });

  it('should render the confirmation button with the provided label', () => {
    render(<ConfirmationDialog {...testProps} />);

    const button = screen.getByRole('button', { name: testProps.confirmLabel });
    expect(button).toBeInTheDocument();
  });

  it('should render the cancel button with no provided label', () => {
    render(<ConfirmationDialog {...testProps} />);

    const button = screen.getByRole('button', { name: /cancel/i });
    expect(button).toBeInTheDocument();
  });

  it('should render the cancel button with the provided label', () => {
    const customlabel = 'customlabel';
    render(<ConfirmationDialog {...testProps} cancelLabel={customlabel} />);

    const button = screen.getByRole('button', { name: customlabel });
    expect(button).toBeInTheDocument();
  });

  it('should render a spinner when isConfirming is true', () => {
    render(<ConfirmationDialog {...testProps} isConfirming={true} />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
  });

  it('should not render a spinner by default', () => {
    render(<ConfirmationDialog {...testProps} />);

    const spinner = screen.queryByRole('status');
    expect(spinner).not.toBeInTheDocument();
  });

  it('should not render anything if the dialog is closed', () => {
    const closedProps = {
      ...testProps,
      open: false,
    };
    render(<ConfirmationDialog {...closedProps} />);

    const dialog = screen.queryByRole('dialog');
    expect(dialog).not.toBeInTheDocument();
  });

  it('should call onCancel when the user presses the ESC button', async () => {
    const user = userEvent.setup();
    render(<ConfirmationDialog {...testProps} />);

    await user.keyboard('{Escape}');

    expect(testProps.onCancel).toHaveBeenCalled();
  });

  it('should call onConfirm when the user presses the confirm button', async () => {
    const user = userEvent.setup();
    render(<ConfirmationDialog {...testProps} />);

    await user.click(screen.getByRole('button', { name: testProps.confirmLabel }));

    expect(testProps.onConfirm).toHaveBeenCalled();
  });
});
