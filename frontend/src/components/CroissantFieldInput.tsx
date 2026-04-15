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
import type { CroissantFieldDef } from '../types/croissant';
import type { FieldValue } from '../utils/serializeCroissant';

interface CroissantFieldInputProps {
  field: CroissantFieldDef;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  itemData?: Record<string, FieldValue>;
  crossReferenceOptions?: Record<string, string[]>;
}

export const CroissantFieldInput: React.FC<CroissantFieldInputProps> = ({
  field,
  value,
  onChange,
  itemData,
  crossReferenceOptions,
}) => {
  const [showHelper, setShowHelper] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

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

  let isDisabled = false;
  if (itemData) {
    if (
      field.id === 'field.source.fileObject' &&
      (itemData['field.source.fileSet'] || itemData['field.source.recordSet'])
    )
      isDisabled = true;
    if (
      field.id === 'field.source.fileSet' &&
      (itemData['field.source.fileObject'] || itemData['field.source.recordSet'])
    )
      isDisabled = true;
    if (
      field.id === 'field.source.recordSet' &&
      (itemData['field.source.fileObject'] || itemData['field.source.fileSet'])
    )
      isDisabled = true;
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
        <Select value={String(value ?? '')} onValueChange={(val) => onChange(val)}>
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

    switch (field.inputType) {
      case 'textarea':
        return (
          <div className="space-y-2">
            <Textarea
              id={field.id}
              placeholder={field.placeholder}
              required={field.required}
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
              onCheckedChange={(checked) => onChange(checked)}
            />
            <Label htmlFor={field.id} className="text-sm font-normal text-muted-foreground">
              {value ? 'Yes' : 'No'}
            </Label>
          </div>
        );
      case 'select':
        return (
          <Select value={String(value ?? '')} onValueChange={(val) => onChange(val)}>
            <SelectTrigger id={field.id} className="w-full h-10">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'multi-text':
        if (field.options && field.options.length > 0) {
          const arrValue: string[] = Array.isArray(value)
            ? value
            : value
              ? String(value)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          return (
            <div className="space-y-3 p-1">
              <div className="flex flex-wrap gap-2">
                {field.options.map((opt) => {
                  const isSelected = arrValue.includes(opt);
                  return (
                    <Badge
                      key={opt}
                      variant={isSelected ? 'default' : 'outline'}
                      className="cursor-pointer hover:bg-primary/80 transition-colors"
                      onClick={() => {
                        if (isSelected) {
                          onChange(arrValue.filter((v) => v !== opt));
                        } else {
                          onChange([...arrValue, opt]);
                        }
                      }}
                    >
                      {opt}
                    </Badge>
                  );
                })}
              </div>
              <Input
                placeholder="Other custom/schema URIs (comma separated)..."
                value={arrValue.filter((v) => !field.options!.includes(v)).join(', ')}
                onChange={(e) => {
                  const customVals = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const selectedOptions = arrValue.filter((v) => field.options!.includes(v));
                  onChange([...selectedOptions, ...customVals]);
                }}
              />
            </div>
          );
        }
        return (
          <Input
            id={field.id}
            type="text"
            placeholder={
              field.placeholder
                ? `${field.placeholder} (comma separated)`
                : 'Comma separated values...'
            }
            required={field.required}
            pattern={field.pattern}
            title={field.patternMessage}
            value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
            onChange={(e) => {
              const val = e.target.value;
              onChange(
                val
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              );
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
            placeholder={field.placeholder}
            required={field.required}
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
          <span className="text-xs text-muted-foreground italic">
            Disabled due to conflicting choice
          </span>
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
