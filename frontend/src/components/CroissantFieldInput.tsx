import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import type { CroissantFieldDef, FieldOption } from '../types/croissant';
import type { FieldValue } from '../utils/serializeCroissant';

const CUSTOM_OPTION_VALUE = '__custom__';

function formatMultiTextDraft(value: FieldValue): string {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

function parseMultiTextValue(text: string): string[] {
  return text
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseMultiTextDraft(text: string): string[] {
  if (text.length === 0) {
    return [];
  }

  const segments = text.split(',');
  const completed = segments
    .slice(0, -1)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const active = (segments[segments.length - 1] ?? '').replace(/^\s+/, '');

  if (active.length === 0) {
    return completed;
  }

  return [...completed, active];
}

function getOptionValue(option: FieldOption): string {
  return typeof option === 'string' ? option : option.value;
}

function getOptionLabel(option: FieldOption): string {
  return typeof option === 'string' ? option : option.label;
}

interface CroissantFieldInputProps {
  field: CroissantFieldDef;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  itemData?: Record<string, FieldValue>;
  crossReferenceOptions?: Record<string, string[]>;
  readOnly?: boolean;
  readOnlyReason?: string;
}

export const CroissantFieldInput: React.FC<CroissantFieldInputProps> = ({
  field,
  value,
  onChange,
  itemData,
  crossReferenceOptions,
  readOnly = false,
  readOnlyReason = 'Experts can edit this system-generated value.',
}) => {
  const [showHelper, setShowHelper] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isCustomOptionSelected, setIsCustomOptionSelected] = useState(false);
  const [multiTextDraft, setMultiTextDraft] = useState(() => formatMultiTextDraft(value));
  const [multiTextCustomDraft, setMultiTextCustomDraft] = useState<string | null>(null);
  const serializedMultiTextValue = formatMultiTextDraft(value);
  const [trackedMultiTextValue, setTrackedMultiTextValue] = useState(serializedMultiTextValue);

  if (serializedMultiTextValue !== trackedMultiTextValue) {
    setTrackedMultiTextValue(serializedMultiTextValue);
    setMultiTextDraft(serializedMultiTextValue);
    setMultiTextCustomDraft(null);
  }

  // Return null if conditional logic dictates hiding
  if (field.id === 'field.arrayShape' && itemData && !itemData['field.isArray']) {
    return null;
  }

  if (
    field.id.startsWith('field.source.extract.') ||
    field.id.startsWith('field.source.transform.') ||
    field.id === 'field.source.format'
  ) {
    const hasSource =
      itemData &&
      (itemData['field.source.fileObject'] ||
        itemData['field.source.fileSet'] ||
        itemData['field.source.recordSet']);
    if (!hasSource) return null;
  }

  let isDisabled = readOnly;
  let disabledReason = readOnly ? readOnlyReason : '';
  if (itemData) {
    if (
      field.id === 'field.source.fileObject' &&
      (itemData['field.source.fileSet'] || itemData['field.source.recordSet'])
    ) {
      isDisabled = true;
      disabledReason = 'Disabled due to conflicting choice';
    }
    if (
      field.id === 'field.source.fileSet' &&
      (itemData['field.source.fileObject'] || itemData['field.source.recordSet'])
    ) {
      isDisabled = true;
      disabledReason = 'Disabled due to conflicting choice';
    }
    if (
      field.id === 'field.source.recordSet' &&
      (itemData['field.source.fileObject'] || itemData['field.source.fileSet'])
    ) {
      isDisabled = true;
      disabledReason = 'Disabled due to conflicting choice';
    }
  }

  const handleJsonBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!field.isJson || !e.target.value) {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(e.target.value);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON format');
    }
  };

  const renderInput = () => {
    if (crossReferenceOptions && field.id in crossReferenceOptions) {
      const options = crossReferenceOptions[field.id] || [];
      return (
        <Select
          value={String(value ?? '')}
          onValueChange={(val) => onChange(val)}
          disabled={isDisabled}
        >
          <SelectTrigger id={field.id} className="w-full h-10">
            <SelectValue placeholder="Select a referenced item" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
            {options.length === 0 && (
              <SelectItem value="none" disabled>
                No options available
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      );
    }

    if (field.options && ['select', 'url'].includes(field.inputType)) {
      const optionValues = field.options.map(getOptionValue);
      const valueText = String(value ?? '');
      const hasMatchingOption = optionValues.includes(valueText);
      const showsCustomInput =
        field.allowCustomValue &&
        (isCustomOptionSelected || (valueText !== '' && !hasMatchingOption));
      const selectedValue = showsCustomInput ? CUSTOM_OPTION_VALUE : valueText;

      return (
        <div className="space-y-2">
          <Select
            value={selectedValue}
            disabled={isDisabled}
            onValueChange={(val) => {
              if (val === CUSTOM_OPTION_VALUE) {
                setIsCustomOptionSelected(true);
                if (hasMatchingOption) onChange('');
                return;
              }

              setIsCustomOptionSelected(false);
              onChange(val);
            }}
          >
            <SelectTrigger id={field.id} className="w-full h-10">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={getOptionValue(opt)} value={getOptionValue(opt)}>
                  {getOptionLabel(opt)}
                </SelectItem>
              ))}
              {field.allowCustomValue && (
                <SelectItem value={CUSTOM_OPTION_VALUE}>
                  {field.customValueLabel ?? 'Custom value'}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {showsCustomInput && (
            <Input
              id={`${field.id}-custom`}
              type={field.inputType === 'url' ? 'url' : 'text'}
              required={field.required}
              disabled={isDisabled}
              pattern={field.pattern}
              title={field.patternMessage}
              value={valueText}
              onChange={(e) => onChange(e.target.value)}
              aria-label={`${field.label} URL`}
            />
          )}
        </div>
      );
    }

    switch (field.inputType) {
      case 'textarea':
        return (
          <div className="space-y-2">
            <Textarea
              id={field.id}
              required={field.required}
              disabled={isDisabled}
              value={String(value ?? '')}
              onChange={(e) => {
                onChange(e.target.value);
                if (jsonError) setJsonError(null);
              }}
              onBlur={handleJsonBlur}
              className={cn('min-h-[100px]', jsonError && 'border-destructive')}
            />
            {jsonError && <p className="text-sm font-medium text-destructive">{jsonError}</p>}
          </div>
        );
      case 'boolean':
        return (
          <div className="flex items-center space-x-2 h-10">
            <Switch
              id={field.id}
              checked={!!value}
              disabled={isDisabled}
              onCheckedChange={(checked) => onChange(checked)}
            />
            <Label htmlFor={field.id} className="text-sm font-normal text-muted-foreground">
              {value ? 'Yes' : 'No'}
            </Label>
          </div>
        );
      case 'select':
        return (
          <Select
            value={String(value ?? '')}
            onValueChange={(val) => onChange(val)}
            disabled={isDisabled}
          >
            <SelectTrigger id={field.id} className="w-full h-10">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={getOptionValue(opt)} value={getOptionValue(opt)}>
                  {getOptionLabel(opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'multi-text':
        if (field.options && field.options.length > 0) {
          const optionValues = field.options.map(getOptionValue);
          const arrValue: string[] = Array.isArray(value)
            ? value
            : parseMultiTextValue(String(value ?? ''));
          const customValues = arrValue.filter((entry) => !optionValues.includes(entry));
          const customDraft = multiTextCustomDraft ?? customValues.join(', ');

          const commitCustomDraft = (draft: string) => {
            const customVals = parseMultiTextValue(draft);
            const selectedOptions = arrValue.filter((entry) => optionValues.includes(entry));
            onChange([...selectedOptions, ...customVals]);
            setMultiTextCustomDraft(null);
          };

          const updateCustomDraft = (draft: string) => {
            setMultiTextCustomDraft(draft);
            const customVals = parseMultiTextDraft(draft);
            const selectedOptions = arrValue.filter((entry) => optionValues.includes(entry));
            onChange([...selectedOptions, ...customVals]);
          };

          return (
            <div className="space-y-3 p-1">
              <div className="flex flex-wrap gap-2">
                {field.options.map((opt) => {
                  const optionValue = getOptionValue(opt);
                  const isSelected = arrValue.includes(optionValue);
                  return (
                    <Badge
                      key={optionValue}
                      variant={isSelected ? 'default' : 'outline'}
                      className="cursor-pointer hover:bg-primary/80 transition-colors"
                      onClick={() => {
                        if (isSelected) {
                          if (isDisabled) return;
                          onChange(arrValue.filter((v) => v !== optionValue));
                        } else {
                          if (isDisabled) return;
                          onChange([...arrValue, optionValue]);
                        }
                      }}
                    >
                      {getOptionLabel(opt)}
                    </Badge>
                  );
                })}
              </div>
              <Input
                value={customDraft}
                disabled={isDisabled}
                onChange={(e) => updateCustomDraft(e.target.value)}
                onBlur={(e) => commitCustomDraft(e.target.value)}
              />
            </div>
          );
        }
        return (
          <Input
            id={field.id}
            type="text"
            required={field.required}
            disabled={isDisabled}
            pattern={field.pattern}
            title={field.patternMessage}
            value={multiTextDraft}
            onChange={(e) => {
              const draft = e.target.value;
              setMultiTextDraft(draft);
              onChange(parseMultiTextDraft(draft));
            }}
            onBlur={(e) => {
              const parsed = parseMultiTextValue(e.target.value);
              onChange(parsed);
              setMultiTextDraft(parsed.join(', '));
            }}
          />
        );
      case 'date':
      case 'url':
      case 'text':
      default:
        return (
          <Input
            id={field.id}
            type={
              field.inputType === 'date' || field.inputType === 'url' ? field.inputType : 'text'
            }
            required={field.required}
            disabled={isDisabled}
            pattern={field.pattern}
            title={field.patternMessage}
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  };

  return (
    <div className={cn('space-y-2 mb-6', isDisabled && 'opacity-50 pointer-events-none')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Label htmlFor={field.id} className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helperText && (
            <button
              type="button"
              onClick={() => setShowHelper(!showHelper)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle help"
            >
              <Info size={16} />
            </button>
          )}
        </div>
        {isDisabled && (
          <span className="text-xs text-muted-foreground italic">{disabledReason}</span>
        )}
      </div>

      <AnimatePresence>
        {showHelper && field.helperText && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md border border-border/50">
              {field.helperText}
              {field.patternMessage && (
                <span className="block mt-1 font-semibold">Format: {field.patternMessage}</span>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {renderInput()}
    </div>
  );
};
