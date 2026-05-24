import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CroissantFieldInput } from '@/components/CroissantFieldInput';
import type { CroissantFieldDef } from '@/types/croissant';

describe('CroissantFieldInput component', () => {
  it('renders standard text input', () => {
    const field: CroissantFieldDef = {
      id: 'test1',
      label: 'Test Text',
      section: 'dataset',
      inputType: 'text',
      required: false,
      helperText: '',
      isJson: false,
    };
    const onChange = vi.fn();
    render(<CroissantFieldInput field={field} value="Hello" onChange={onChange} />);

    expect(screen.getByLabelText('Test Text')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
  });

  it('does not own JSON validation on blur', async () => {
    const field: CroissantFieldDef = {
      id: 'test-json',
      label: 'JSON Data',
      section: 'dataset',
      inputType: 'textarea',
      required: false,
      helperText: '',
      isJson: true,
    };
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CroissantFieldInput field={field} value="{ invalid json" onChange={onChange} />);

    const textarea = screen.getByLabelText('JSON Data');
    expect(textarea).toBeInTheDocument();

    // Trigger blur to validate json
    await user.click(textarea);
    await user.click(document.body);

    expect(screen.queryByText('Invalid JSON format')).not.toBeInTheDocument();
  });

  it('shows the submit error instead of duplicate local json errors', async () => {
    const field: CroissantFieldDef = {
      id: 'test-json',
      label: 'JSON Data',
      section: 'dataset',
      inputType: 'textarea',
      required: false,
      helperText: '',
      isJson: true,
    };
    const user = userEvent.setup();

    render(
      <CroissantFieldInput
        field={field}
        value="{ invalid json"
        onChange={vi.fn()}
        error="JSON Data must contain valid JSON."
      />,
    );

    const textarea = screen.getByLabelText('JSON Data');
    await user.click(textarea);
    await user.click(document.body);

    expect(screen.getByText('JSON Data must contain valid JSON.')).toBeInTheDocument();
    expect(screen.queryByText('Invalid JSON format')).not.toBeInTheDocument();
  });

  it('does not show example placeholders in writable fields', () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <CroissantFieldInput
        field={{
          id: 'description',
          label: 'Description',
          section: 'dataset',
          inputType: 'textarea',
          required: true,
          helperText: 'Describe the dataset.',
          placeholder: 'What does this dataset contain?',
        }}
        value=""
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText(/description/i)).not.toHaveAttribute('placeholder');

    rerender(
      <CroissantFieldInput
        field={{
          id: 'url',
          label: 'Dataset URL',
          section: 'dataset',
          inputType: 'url',
          required: true,
          helperText: 'Link to the dataset source.',
          placeholder: 'https://github.com/yourorg/your-dataset',
        }}
        value=""
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText(/dataset url/i)).not.toHaveAttribute('placeholder');

    rerender(
      <CroissantFieldInput
        field={{
          id: 'creators',
          label: 'Creator(s)',
          section: 'dataset',
          inputType: 'multi-text',
          required: true,
          helperText: 'People or organizations that created the dataset.',
          placeholder: 'Jane Doe',
        }}
        value={[]}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText(/creator\(s\)/i)).not.toHaveAttribute('placeholder');
  });

  it('keeps spaces in multi-text values while typing and trims them on blur', async () => {
    const field: CroissantFieldDef = {
      id: 'creator',
      label: 'Creator(s)',
      section: 'dataset',
      inputType: 'multi-text',
      required: true,
      helperText: 'People or organizations that created the dataset.',
      pattern: '^([^.,]+)(,\\s*[^.,]+)*$',
      patternMessage:
        'Must be a comma-separated list of names without special characters like periods.',
    };
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<CroissantFieldInput field={field} value={[]} onChange={onChange} />);

    const input = screen.getByLabelText(/creator\(s\)/i);
    await user.type(input, 'Jane ');

    expect(onChange).toHaveBeenLastCalledWith(['Jane ']);
    expect(input).toHaveValue('Jane ');

    await user.type(input, 'Doe');

    expect(onChange).toHaveBeenLastCalledWith(['Jane Doe']);
    expect(input).toHaveValue('Jane Doe');

    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith(['Jane Doe']);
  });

  it('does not attach native validation attributes to JS-validated text fields', () => {
    const field: CroissantFieldDef = {
      id: 'creator',
      label: 'Creator(s)',
      section: 'dataset',
      inputType: 'text',
      required: true,
      helperText: 'People or organizations that created the dataset.',
      pattern: '^([^.,]+)(,\\s*[^.,]+)*$',
      patternMessage:
        'Must be a comma-separated list of names without special characters like periods.',
    };

    render(<CroissantFieldInput field={field} value={[]} onChange={vi.fn()} />);

    const input = screen.getByLabelText(/creator\(s\)/i);
    expect(input).not.toHaveAttribute('pattern');
    expect(input).not.toHaveAttribute('required');
  });

  it('parses comma-separated multi-text values on change', () => {
    const field: CroissantFieldDef = {
      id: 'test-multi',
      label: 'Tags',
      section: 'dataset',
      inputType: 'multi-text',
      required: false,
      helperText: '',
      isJson: false,
    };
    const onChange = vi.fn();
    render(<CroissantFieldInput field={field} value={[]} onChange={onChange} />);

    const input = screen.getByLabelText('Tags');
    fireEvent.change(input, { target: { value: 'apple, banana, cherry' } });

    expect(onChange).toHaveBeenCalledWith(['apple', 'banana', 'cherry']);
  });

  it('toggles helper text visibility', async () => {
    const field: CroissantFieldDef = {
      id: 'test-help',
      label: 'Helpful Field',
      section: 'dataset',
      inputType: 'text',
      required: false,
      helperText: 'This is some helper info',
      isJson: false,
    };
    const user = userEvent.setup();
    render(<CroissantFieldInput field={field} value="" onChange={vi.fn()} />);

    const toggleBtn = screen.getByTitle('Toggle help');
    expect(toggleBtn).toBeInTheDocument();

    expect(screen.queryByText('This is some helper info')).not.toBeInTheDocument();

    await user.click(toggleBtn);
    expect(screen.getByText('This is some helper info')).toBeInTheDocument();
  });

  it('disables input when conflicting source is selected', () => {
    const field: CroissantFieldDef = {
      id: 'field.source.fileObject',
      label: 'File Object',
      section: 'field',
      inputType: 'text',
      required: false,
      helperText: '',
      isJson: false,
    };
    const itemData = { 'field.source.recordSet': 'some value' };
    render(<CroissantFieldInput field={field} value="" onChange={vi.fn()} itemData={itemData} />);

    expect(screen.getByText('Disabled due to conflicting choice')).toBeInTheDocument();
  });

  it('renders multi-text input', () => {
    const field: CroissantFieldDef = {
      id: 'test-multi',
      label: 'Tags',
      section: 'dataset',
      inputType: 'multi-text',
      required: false,
      helperText: '',
      isJson: false,
    };
    const onChange = vi.fn();
    render(<CroissantFieldInput field={field} value={['tag1', 'tag2']} onChange={onChange} />);

    const input = screen.getByLabelText('Tags');
    expect(input).toHaveValue('tag1, tag2');
  });
});
