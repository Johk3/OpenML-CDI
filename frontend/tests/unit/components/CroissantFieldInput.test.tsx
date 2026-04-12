import { render, screen } from '@testing-library/react';
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

  it('renders textarea and handles custom json error on blur', async () => {
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

    expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();
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

    const input = screen.getByPlaceholderText('Comma separated values...');
    expect(input).toHaveValue('tag1, tag2');
  });
});
