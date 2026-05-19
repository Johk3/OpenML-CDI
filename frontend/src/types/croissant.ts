export type InputType = 'text' | 'textarea' | 'url' | 'date' | 'select' | 'boolean' | 'multi-text';

export type FieldSection = 'dataset' | 'distribution' | 'fileSet' | 'recordSet' | 'field' | 'rai';

export type FieldOption =
  | string
  | {
      label: string;
      value: string;
    };

export interface CroissantFieldDef {
  id: string;
  label: string;
  section: FieldSection;
  inputType: InputType;
  required: boolean;
  placeholder?: string;
  options?: FieldOption[];
  allowCustomValue?: boolean;
  customValueLabel?: string;
  expertOnly?: boolean;
  helperText: string;
  pattern?: string;
  patternMessage?: string;
  isJson?: boolean;
}

export interface GeneratedFieldDef {
  id: string;
  label: string;
  section: FieldSection;
  value: string | string[] | Record<string, unknown>;
  condition?: string;
  helperText: string;
}
