export type InputType = 'text' | 'textarea' | 'url' | 'date' | 'select' | 'boolean' | 'multi-text';

export type FieldSection = 'dataset' | 'distribution' | 'fileSet' | 'recordSet' | 'field' | 'rai';

export interface CroissantFieldDef {
  id: string;
  label: string;
  section: FieldSection;
  inputType: InputType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  helperText: string;
}

export interface GeneratedFieldDef {
  id: string;
  label: string;
  section: FieldSection;
  value: string | string[];
  condition?: string;
  helperText: string;
}
