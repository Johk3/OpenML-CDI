import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { CroissantFieldInput } from '../../src/components/CroissantFieldInput';
import type { CroissantFieldDef } from '../../src/types/croissant';

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

describe('CroissantFieldInput', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  const baseField: CroissantFieldDef = {
    id: 'testField',
    label: 'Test Field',
    section: 'dataset',
    inputType: 'text',
    required: false,
    helperText: 'Helper information here',
  };

  it('renders a basic text input correctly', () => {
    render(<CroissantFieldInput field={baseField} value="test value" onChange={mockOnChange} />);

    expect(screen.getByLabelText(/test field/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('test value')).toBeInTheDocument();
  });

  it('toggles helper text when info icon is clicked', () => {
    render(<CroissantFieldInput field={baseField} value="" onChange={mockOnChange} />);

    const infoButton = screen.getByTitle('Toggle help');
    expect(screen.queryByText('Helper information here')).not.toBeInTheDocument();

    fireEvent.click(infoButton);
    expect(screen.getByText('Helper information here')).toBeInTheDocument();

    fireEvent.click(infoButton);
    expect(screen.queryByText('Helper information here')).not.toBeInTheDocument();
  });

  it('renders required asterisk when field is required', () => {
    render(
      <CroissantFieldInput
        field={{ ...baseField, required: true }}
        value=""
        onChange={mockOnChange}
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('returns null if field is field.arrayShape and isArray is not true', () => {
    const field: CroissantFieldDef = { ...baseField, id: 'field.arrayShape' };
    const { container } = render(
      <CroissantFieldInput
        field={field}
        value=""
        onChange={mockOnChange}
        itemData={{ 'field.isArray': false }}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('disables input when conflicting source is present', () => {
    const field: CroissantFieldDef = { ...baseField, id: 'field.source.fileObject' };
    render(
      <CroissantFieldInput
        field={field}
        value=""
        onChange={mockOnChange}
        itemData={{ 'field.source.fileSet': 'someFileSet' }}
      />,
    );

    expect(screen.getByText(/disabled due to conflicting choice/i)).toBeInTheDocument();
  });

  it('validates bad JSON in textarea on blur', () => {
    const field: CroissantFieldDef = { ...baseField, inputType: 'textarea', isJson: true };
    const { rerender } = render(
      <CroissantFieldInput field={field} value="" onChange={mockOnChange} />,
    );

    const textarea = screen.getByRole('textbox');

    // Simulate typing bad JSON
    rerender(<CroissantFieldInput field={field} value="invalid json {" onChange={mockOnChange} />);
    fireEvent.blur(textarea);

    expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();

    // Fix the json
    rerender(<CroissantFieldInput field={field} value='{"valid": true}' onChange={mockOnChange} />);
    fireEvent.blur(textarea);

    expect(screen.queryByText('Invalid JSON format')).not.toBeInTheDocument();
  });

  it('renders a boolean input', () => {
    const field: CroissantFieldDef = { ...baseField, inputType: 'boolean' };
    render(<CroissantFieldInput field={field} value={true} onChange={mockOnChange} />);

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeChecked();

    fireEvent.click(switchBtn);
    expect(mockOnChange).toHaveBeenCalledWith(false);
  });

  it('renders multi-text without options as a comma-separated input', () => {
    const field: CroissantFieldDef = { ...baseField, inputType: 'multi-text' };
    render(
      <CroissantFieldInput field={field} value={['apple', 'banana']} onChange={mockOnChange} />,
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('apple, banana');

    fireEvent.change(input, { target: { value: 'apple, banana, cherry' } });
    expect(mockOnChange).toHaveBeenCalledWith(['apple', 'banana', 'cherry']);
  });

  it('renders multi-text with options as badges', () => {
    const field: CroissantFieldDef = {
      ...baseField,
      inputType: 'multi-text',
      options: ['Option A', 'Option B'],
    };
    render(<CroissantFieldInput field={field} value={['Option A']} onChange={mockOnChange} />);

    const optABadge = screen.getByText('Option A');
    const optBBadge = screen.getByText('Option B');

    expect(optABadge).toBeInTheDocument();
    expect(optBBadge).toBeInTheDocument();

    // Clicking an unselected badge adds it
    fireEvent.click(optBBadge);
    expect(mockOnChange).toHaveBeenCalledWith(['Option A', 'Option B']);

    // Clicking a selected badge removes it
    fireEvent.click(optABadge);
    expect(mockOnChange).toHaveBeenCalledWith([]);
  });

  it('renders parent item as a dropdown', () => {
    render(
      <CroissantFieldInput
        field={baseField}
        value=""
        onChange={mockOnChange}
        crossReferenceOptions={{ testField: ['Ref 1', 'Ref 2'] }}
      />,
    );

    // The select trigger will display the placeholder
    expect(screen.getByRole('combobox')).toBeInTheDocument();

    // Check that standard inputs are replaced by parent select
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
