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

  it('renders required asterisk when field is required', () => {
    const field: CroissantFieldDef = {
      id: 'required-field',
      label: 'Required Field',
      section: 'dataset',
      inputType: 'text',
      required: true,
      helperText: '',
    };

    render(<CroissantFieldInput field={field} value="" onChange={vi.fn()} />);

    expect(screen.getByText('*')).toBeInTheDocument();
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

  it('returns null when array shape is hidden for scalar attributes', () => {
    const field: CroissantFieldDef = {
      id: 'field.arrayShape',
      label: 'Array Shape',
      section: 'field',
      inputType: 'text',
      required: false,
      helperText: '',
    };

    const { container } = render(
      <CroissantFieldInput
        field={field}
        value=""
        onChange={vi.fn()}
        itemData={{ 'field.isArray': false }}
      />,
    );

    expect(container.firstChild).toBeNull();
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

  it('renders multi-text options as selectable badges', () => {
    const field: CroissantFieldDef = {
      id: 'test-multi',
      label: 'Tags',
      section: 'dataset',
      inputType: 'multi-text',
      required: false,
      helperText: '',
      options: ['Option A', 'Option B'],
    };
    const onChange = vi.fn();

    render(<CroissantFieldInput field={field} value={['Option A']} onChange={onChange} />);

    fireEvent.click(screen.getByText('Option B'));
    expect(onChange).toHaveBeenCalledWith(['Option A', 'Option B']);

    fireEvent.click(screen.getByText('Option A'));
    expect(onChange).toHaveBeenCalledWith([]);
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

  it('renders cross-reference fields as dropdowns', () => {
    const field: CroissantFieldDef = {
      id: 'field.source.fileObject',
      label: 'Source: File Object',
      section: 'field',
      inputType: 'text',
      required: false,
      helperText: '',
    };

    render(
      <CroissantFieldInput
        field={field}
        value=""
        onChange={vi.fn()}
        crossReferenceOptions={{ 'field.source.fileObject': ['data.csv'] }}
      />,
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders boolean fields as switches', () => {
    const field: CroissantFieldDef = {
      id: 'isLiveDataset',
      label: 'Is Live Dataset',
      section: 'dataset',
      inputType: 'boolean',
      required: false,
      helperText: '',
    };
    const onChange = vi.fn();

    render(<CroissantFieldInput field={field} value={true} onChange={onChange} />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toBeChecked();

    fireEvent.click(switchButton);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('uses display labels for select options while submitting their stored values', async () => {
    const field: CroissantFieldDef = {
      id: 'license',
      label: 'License',
      section: 'dataset',
      inputType: 'select',
      required: true,
      helperText: '',
      options: [
        {
          label: 'CC BY 4.0',
          value: 'https://creativecommons.org/licenses/by/4.0/',
        },
        {
          label: 'CC0 1.0',
          value: 'https://creativecommons.org/publicdomain/zero/1.0/',
        },
      ],
    };
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<CroissantFieldInput field={field} value="" onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('CC BY 4.0'));

    expect(onChange).toHaveBeenCalledWith('https://creativecommons.org/licenses/by/4.0/');
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
