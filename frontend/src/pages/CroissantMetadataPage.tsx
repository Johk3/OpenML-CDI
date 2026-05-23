import React, { useRef, useState, useEffect } from 'react';
import { CROISSANT_USER_FIELDS } from '../constants/croissantFields';
import { CroissantFieldInput } from '../components/CroissantFieldInput';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  serializeCroissant,
  CroissantFormData,
  FieldValue,
  FormSection,
  RecordSetData,
} from '../utils/serializeCroissant';
import { deserializeCroissant } from '../utils/deserializeCroissant';
import {
  buildCroissantFormDataFromDataset,
  mergeCroissantFormData,
} from '../utils/croissantGeneratedMetadata';
import { DatasetService } from '@/services/datasetService';
import { getApiErrorMessage } from '@/lib/apiErrors';
import type { CroissantFieldDef } from '@/types/croissant';
import { useUserContext } from '@/hooks/useUserContext';

const SECTIONS = [
  { id: 'dataset', label: 'Dataset', description: 'Core dataset metadata' },
  { id: 'distribution', label: 'Distribution', description: 'File objects and downloads' },
  { id: 'fileSet', label: 'File Sets', description: 'Folders and repeated file groups' },
  { id: 'recordSet', label: 'Attributes', description: 'Tables, columns, and OpenML hints' },
  { id: 'rai', label: 'Responsible AI', description: 'Use, limitations, and sensitive data' },
];

const UPLOADED_DATASET_IMMUTABLE_FIELD_IDS = new Set([
  'url',
  'distribution.@id',
  'distribution.name',
  'distribution.contentUrl',
  'distribution.encodingFormat',
  'distribution.sha256',
  'distribution.md5',
  'distribution.contentSize',
  'distribution.containedIn',
  'fileSet.@id',
  'fileSet.name',
  'fileSet.containedIn',
  'fileSet.encodingFormat',
  'fileSet.includes',
]);

const UPLOADED_DATASET_IMMUTABLE_REASON = 'Generated from the uploaded files and cannot be edited.';

type InvalidFormTarget = {
  section: string;
  itemIndex?: number;
  fieldIndex?: number;
  message?: string;
};

type MetadataLocationState = {
  datasetId?: string;
  returnTo?: string;
};

function distHasHash(item: Record<string, unknown>): boolean {
  if (item._generated) return true;
  return !!(
    (item['distribution.md5'] as string | undefined)?.trim() ||
    (item['distribution.sha256'] as string | undefined)?.trim()
  );
}

function hasValue(value: FieldValue | undefined): boolean {
  return !(
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function fieldValueAsString(value: FieldValue | undefined): string {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return Boolean(url.protocol && url.host);
  } catch {
    return false;
  }
}

function isInvalidFieldValue(field: CroissantFieldDef, item: Record<string, unknown>): boolean {
  const value = item[field.id] as FieldValue | undefined;
  if (!hasValue(value)) return field.required;

  const textValue = fieldValueAsString(value);
  if (field.pattern && !new RegExp(field.pattern).test(textValue)) return true;
  if (field.inputType === 'url' && !isValidAbsoluteUrl(textValue)) return true;
  if (field.inputType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(textValue)) return true;
  if (field.isJson) {
    try {
      JSON.parse(textValue);
    } catch {
      return true;
    }
  }

  return false;
}

function getInvalidFieldMessage(
  field: CroissantFieldDef,
  item: Record<string, unknown>,
): string | undefined {
  const value = item[field.id] as FieldValue | undefined;
  if (!hasValue(value) && field.required) return `${field.label} is required.`;
  if (field.isJson) return 'Annotation fields must contain valid JSON.';
  return undefined;
}

function safeReturnPath(path: string | undefined): string {
  return path && path.startsWith('/') && !path.startsWith('//') ? path : '/datasets';
}

export const CroissantMetadataPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUserContext();
  const locationState = (location.state as MetadataLocationState | null) ?? null;
  const datasetId = locationState?.datasetId ?? null;
  const returnPath = safeReturnPath(locationState?.returnTo);
  const canEditExpertOnlyFields = user?.role === 'expert';

  const [formData, setFormData] = useState<CroissantFormData>({
    dataset: {},
    distribution: [],
    fileSet: [],
    recordSet: [],
    rai: {},
  });
  const [activeDistIdx, setActiveDistIdx] = useState(0);
  const [activeFileSetIdx, setActiveFileSetIdx] = useState(0);
  const [activeRecordSetIdx, setActiveRecordSetIdx] = useState(0);
  const [activeFieldIdx, setActiveFieldIdx] = useState(0);
  const [activeTab, setActiveTab] = useState('dataset');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Initialize form with existing dataset info if available
  useEffect(() => {
    if (!datasetId) return;

    const fetchDataset = async () => {
      setIsLoading(true);
      try {
        const dataset = await DatasetService.getDataset(datasetId);

        const generatedData = buildCroissantFormDataFromDataset(dataset);

        // If we already have croissant metadata in dataset_metadata, deserialize it
        if (
          dataset.dataset_metadata &&
          (dataset.dataset_metadata.distribution || dataset.dataset_metadata['@context'])
        ) {
          const existingData = deserializeCroissant(dataset.dataset_metadata);
          setFormData(mergeCroissantFormData(generatedData, existingData));
        } else {
          setFormData((prev) => mergeCroissantFormData(generatedData, prev));
        }
      } catch (err) {
        console.error('Failed to fetch dataset:', err);
        setSubmitError(
          getApiErrorMessage(err, 'Failed to load dataset metadata. Please try again.'),
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchDataset();
  }, [datasetId]);

  const datasetFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'dataset');
  const distributionFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'distribution');
  const fileSetFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'fileSet');
  const recordSetFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'recordSet');
  const fieldFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'field');
  const raiFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'rai');

  const isUploadedDatasetImmutableField = (field: CroissantFieldDef): boolean =>
    Boolean(datasetId) && UPLOADED_DATASET_IMMUTABLE_FIELD_IDS.has(field.id);

  const canEditField = (field: CroissantFieldDef): boolean =>
    !isUploadedDatasetImmutableField(field) && (!field.expertOnly || canEditExpertOnlyFields);

  const isFieldReadOnly = (field: CroissantFieldDef): boolean => !canEditField(field);

  const getFieldReadOnlyReason = (field: CroissantFieldDef): string | undefined =>
    isUploadedDatasetImmutableField(field) ? UPLOADED_DATASET_IMMUTABLE_REASON : undefined;

  const handleDatasetChange = (fieldId: string, value: FieldValue) => {
    setFormData((prev) => ({
      ...prev,
      dataset: { ...prev.dataset, [fieldId]: value },
    }));
  };

  const handleDistributionChange = (idx: number, fieldId: string, value: FieldValue) => {
    setFormData((prev) => {
      const newDist = [...prev.distribution];
      newDist[idx] = { ...newDist[idx], [fieldId]: value };
      return { ...prev, distribution: newDist };
    });
  };

  const handleAddDistribution = () => {
    setFormData((prev) => ({ ...prev, distribution: [...prev.distribution, {}] }));
    setActiveDistIdx(formData.distribution.length);
  };

  const handleRemoveDistribution = (idx: number) => {
    setFormData((prev) => {
      const newDist = [...prev.distribution];
      newDist.splice(idx, 1);
      return { ...prev, distribution: newDist };
    });
    setActiveDistIdx((prev) => Math.max(0, idx === prev ? prev - 1 : prev > idx ? prev - 1 : prev));
  };

  const handleFileSetChange = (idx: number, fieldId: string, value: FieldValue) => {
    setFormData((prev) => {
      const newFileSets = [...prev.fileSet];
      newFileSets[idx] = { ...newFileSets[idx], [fieldId]: value };
      return { ...prev, fileSet: newFileSets };
    });
  };

  const handleAddFileSet = () => {
    setFormData((prev) => ({ ...prev, fileSet: [...prev.fileSet, {}] }));
    setActiveFileSetIdx(formData.fileSet.length);
  };

  const handleRemoveFileSet = (idx: number) => {
    setFormData((prev) => {
      const newFileSets = [...prev.fileSet];
      newFileSets.splice(idx, 1);
      return { ...prev, fileSet: newFileSets };
    });
    setActiveFileSetIdx((prev) =>
      Math.max(0, idx === prev ? prev - 1 : prev > idx ? prev - 1 : prev),
    );
  };

  const handleRecordSetChange = (idx: number, fieldId: string, value: FieldValue) => {
    setFormData((prev) => {
      const newRecordSets = [...prev.recordSet];
      newRecordSets[idx] = { ...newRecordSets[idx], [fieldId]: value };
      return { ...prev, recordSet: newRecordSets };
    });
  };

  const handleAddRecordSet = () => {
    setFormData((prev) => ({ ...prev, recordSet: [...prev.recordSet, {}] }));
    setActiveRecordSetIdx(formData.recordSet.length);
    setActiveFieldIdx(0);
  };

  const handleRemoveRecordSet = (idx: number) => {
    setFormData((prev) => {
      const newRecordSets = [...prev.recordSet];
      newRecordSets.splice(idx, 1);
      return { ...prev, recordSet: newRecordSets };
    });
    setActiveRecordSetIdx((prev) =>
      Math.max(0, idx === prev ? prev - 1 : prev > idx ? prev - 1 : prev),
    );
    setActiveFieldIdx(0);
  };

  const recordSetFieldsFor = (recordSet: RecordSetData | undefined): FormSection[] =>
    Array.isArray(recordSet?.field) ? (recordSet.field as FormSection[]) : [];

  const handleAddField = () => {
    setFormData((prev) => {
      const newRecordSets = [...prev.recordSet];
      const recordSet = { ...(newRecordSets[activeRecordSetIdx] ?? {}) } as RecordSetData;
      const fields = recordSetFieldsFor(recordSet);
      recordSet.field = [...fields, {}];
      newRecordSets[activeRecordSetIdx] = recordSet;
      return { ...prev, recordSet: newRecordSets };
    });
    setActiveFieldIdx(recordSetFieldsFor(formData.recordSet[activeRecordSetIdx]).length);
  };

  const handleFieldChange = (
    recordSetIdx: number,
    fieldIdx: number,
    fieldId: string,
    value: FieldValue,
  ) => {
    setFormData((prev) => {
      const newRecordSets = [...prev.recordSet];
      const recordSet = { ...(newRecordSets[recordSetIdx] ?? {}) } as RecordSetData;
      const fields = [...recordSetFieldsFor(recordSet)];
      fields[fieldIdx] = { ...fields[fieldIdx], [fieldId]: value };
      recordSet.field = fields;
      newRecordSets[recordSetIdx] = recordSet;
      return { ...prev, recordSet: newRecordSets };
    });
  };

  const handleRemoveField = (fieldIdx: number) => {
    setFormData((prev) => {
      const newRecordSets = [...prev.recordSet];
      const recordSet = { ...(newRecordSets[activeRecordSetIdx] ?? {}) } as RecordSetData;
      const fields = [...recordSetFieldsFor(recordSet)];
      fields.splice(fieldIdx, 1);
      recordSet.field = fields;
      newRecordSets[activeRecordSetIdx] = recordSet;
      return { ...prev, recordSet: newRecordSets };
    });
    setActiveFieldIdx((prev) =>
      Math.max(0, fieldIdx === prev ? prev - 1 : prev > fieldIdx ? prev - 1 : prev),
    );
  };

  const handleRaiChange = (fieldId: string, value: FieldValue) => {
    setFormData((prev) => ({
      ...prev,
      rai: { ...prev.rai, [fieldId]: value },
    }));
  };

  /**
   * Validate fields across ALL tabs and item selectors using formData state.
   * Returns the location of the first missing or invalid field,
   * or null if everything is valid.
   */
  const findFirstInvalidTarget = (): InvalidFormTarget | null => {
    for (const field of datasetFields) {
      if (!canEditField(field)) continue;
      if (isInvalidFieldValue(field, formData.dataset)) {
        return {
          section: 'dataset',
          message: getInvalidFieldMessage(field, formData.dataset),
        };
      }
    }

    if (formData.distribution.length === 0 && formData.fileSet.length === 0) {
      return {
        section: 'distribution',
        message: 'Add at least one FileObject or FileSet before saving Croissant metadata.',
      };
    }

    for (let i = 0; i < formData.distribution.length; i++) {
      const item = formData.distribution[i];
      for (const field of distributionFields) {
        if (!canEditField(field)) continue;
        if (isInvalidFieldValue(field, item)) {
          return { section: 'distribution', itemIndex: i };
        }
      }
    }

    for (let i = 0; i < formData.fileSet.length; i++) {
      const item = formData.fileSet[i];
      for (const field of fileSetFields) {
        if (!canEditField(field)) continue;
        if (isInvalidFieldValue(field, item)) {
          return { section: 'fileSet', itemIndex: i };
        }
      }
    }

    for (let i = 0; i < formData.recordSet.length; i++) {
      const item = formData.recordSet[i];
      for (const field of recordSetFields) {
        if (!canEditField(field)) continue;
        if (isInvalidFieldValue(field, item)) {
          return {
            section: 'recordSet',
            itemIndex: i,
            message: getInvalidFieldMessage(field, item),
          };
        }
      }

      for (let fieldIndex = 0; fieldIndex < recordSetFieldsFor(item).length; fieldIndex++) {
        const fieldItem = recordSetFieldsFor(item)[fieldIndex];
        for (const field of fieldFields) {
          if (!canEditField(field)) continue;
          if (isInvalidFieldValue(field, fieldItem)) {
            return {
              section: 'recordSet',
              itemIndex: i,
              fieldIndex,
              message: getInvalidFieldMessage(field, fieldItem),
            };
          }
        }
      }
    }

    for (const field of raiFields) {
      if (!canEditField(field)) continue;
      if (isInvalidFieldValue(field, formData.rai)) {
        return {
          section: 'rai',
          message: getInvalidFieldMessage(field, formData.rai),
        };
      }
    }

    return null;
  };

  const applyInvalidTarget = (target: InvalidFormTarget) => {
    setActiveTab(target.section);
    if (target.section === 'distribution' && target.itemIndex !== undefined) {
      setActiveDistIdx(target.itemIndex);
    }
    if (target.section === 'fileSet' && target.itemIndex !== undefined) {
      setActiveFileSetIdx(target.itemIndex);
    }
    if (target.section === 'recordSet' && target.itemIndex !== undefined) {
      setActiveRecordSetIdx(target.itemIndex);
      setActiveFieldIdx(target.fieldIndex ?? 0);
    }
  };

  const isInvalidTargetVisible = (target: InvalidFormTarget) => {
    if (target.section !== activeTab) return false;
    if (target.section === 'distribution') {
      return target.itemIndex === undefined || target.itemIndex === activeDistIdx;
    }
    if (target.section === 'fileSet') {
      return target.itemIndex === undefined || target.itemIndex === activeFileSetIdx;
    }
    if (target.section === 'recordSet') {
      return (
        (target.itemIndex === undefined || target.itemIndex === activeRecordSetIdx) &&
        (target.fieldIndex === undefined || target.fieldIndex === activeFieldIdx)
      );
    }
    return true;
  };

  const handleSaveClick = () => {
    setSubmitAttempted(true);

    // First, check for cross-tab validation (fields on hidden tabs).
    // Switch to the invalid tab so native validation can highlight the fields.
    const invalidTarget = findFirstInvalidTarget();
    if (invalidTarget) {
      setSubmitError(invalidTarget.message ?? null);
      applyInvalidTarget(invalidTarget);
      // Defer requestSubmit so the tab switch renders the fields first
      const submit = () => {
        formRef.current?.requestSubmit();
      };
      if (isInvalidTargetVisible(invalidTarget)) {
        submit();
      } else {
        setTimeout(submit, 0);
      }
      return;
    }

    // Trigger native form validation + submit on the current tab
    formRef.current?.requestSubmit();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    // Cross-tab validation: if the native validation passed for the current
    // tab, also check other tabs for missing required fields
    const invalidTarget = findFirstInvalidTarget();
    if (invalidTarget) {
      setSubmitError(invalidTarget.message ?? null);
      applyInvalidTarget(invalidTarget);
      return;
    }

    // Custom distribution hash validation
    if (canEditExpertOnlyFields) {
      const invalidDistIndices = formData.distribution
        .map((item, idx) => (!distHasHash(item) ? idx : -1))
        .filter((idx) => idx !== -1);

      if (invalidDistIndices.length > 0) {
        setSubmitError(null);
        setActiveTab('distribution');
        setActiveDistIdx(invalidDistIndices[0]);
        return;
      }
    }

    const croissantJson = serializeCroissant(formData);

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (datasetId) {
        await DatasetService.updateMetadata(datasetId, croissantJson as Record<string, unknown>);
      }
      // If no datasetId then just navigate away as the metadata already in memory
      navigate(returnPath);
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, 'Failed to save metadata. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeDistItem = formData.distribution[activeDistIdx] ?? {};
  const activeFileSetItem = formData.fileSet[activeFileSetIdx] ?? {};
  const activeRecordSetItem = formData.recordSet[activeRecordSetIdx] ?? {};
  const activeFields = recordSetFieldsFor(activeRecordSetItem);
  const activeFieldItem = activeFields[activeFieldIdx] ?? {};
  const crossReferenceOptions = {
    'field.source.fileObject': formData.distribution
      .map((item, idx) => String(item['distribution.name'] || `File ${idx + 1}`))
      .filter(Boolean),
    'field.source.fileSet': formData.fileSet
      .map((item, idx) => String(item['fileSet.name'] || `File Set ${idx + 1}`))
      .filter(Boolean),
    'field.source.recordSet': formData.recordSet
      .map((item, idx) => String(item['recordSet.name'] || `Record Set ${idx + 1}`))
      .filter(Boolean),
  };
  const showHashError =
    canEditExpertOnlyFields &&
    submitAttempted &&
    formData.distribution.length > 0 &&
    !distHasHash(activeDistItem);
  const showMissingDistributionError =
    submitAttempted && formData.distribution.length === 0 && formData.fileSet.length === 0;

  if (isLoading) {
    return (
      <div className="container flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 rounded-full border-4 border-muted border-t-primary animate-spin mb-4" />
        <h2 className="text-xl font-semibold">Loading dataset details...</h2>
        <p className="text-muted-foreground mt-2">Retrieving your dataset configuration.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2 -ml-4" type="button">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Dataset Metadata</h1>
          <p className="text-muted-foreground mt-2">
            Configure the Croissant metadata for your uploaded dataset.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate(returnPath)} type="button">
            Cancel
          </Button>
          <Button onClick={handleSaveClick} type="button" disabled={isSubmitting}>
            <Save className="mr-2 h-4 w-4" /> {isSubmitting ? 'Saving…' : 'Save Metadata'}
          </Button>
        </div>
      </div>

      {submitError && (
        <div className="mb-6 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        orientation="vertical"
        className="w-full flex flex-col md:flex-row gap-8"
      >
        <Card className="h-fit w-full md:w-[220px] shrink-0">
          <TabsList className="flex flex-col h-auto bg-transparent items-start w-full p-2">
            {SECTIONS.map((section) => (
              <TabsTrigger
                key={section.id}
                value={section.id}
                className="w-full justify-start text-left px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary mb-1 whitespace-normal h-auto"
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">{section.label}</span>
                  <span className="text-xs font-normal opacity-70 hidden md:block">
                    {section.description}
                  </span>
                </div>
              </TabsTrigger>
            ))}
          </TabsList>
        </Card>

        <div className="flex-1 w-full min-w-0">
          <form ref={formRef} onSubmit={handleSubmit}>
            {/* Dataset tab */}
            <TabsContent value="dataset" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Dataset</CardTitle>
                  <CardDescription>Core dataset metadata</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {datasetFields.map((field) => (
                    <div key={field.id} className="p-1">
                      <CroissantFieldInput
                        field={field}
                        value={formData.dataset[field.id]}
                        onChange={(val) => handleDatasetChange(field.id, val)}
                        readOnly={isFieldReadOnly(field)}
                        readOnlyReason={getFieldReadOnlyReason(field)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Distribution tab */}
            <TabsContent value="distribution" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Distribution</CardTitle>
                  <CardDescription>
                    File objects and downloads. Use this for single file objects or archives.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Item selector */}
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    {formData.distribution.map((item, idx) => (
                      <div key={idx} className="flex items-center">
                        <Button
                          variant={activeDistIdx === idx ? 'default' : 'outline'}
                          className="rounded-r-none pr-3"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveDistIdx(idx);
                          }}
                          type="button"
                        >
                          {item['distribution.name'] || `File ${idx + 1}`}
                          {submitAttempted && !distHasHash(item) && (
                            <AlertCircle className="ml-2 h-3.5 w-3.5 text-destructive" />
                          )}
                        </Button>
                        <Button
                          variant={activeDistIdx === idx ? 'default' : 'outline'}
                          className="rounded-l-none px-2 border-l-0 hover:bg-destructive hover:text-destructive-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            handleRemoveDistribution(idx);
                          }}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault();
                        handleAddDistribution();
                      }}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add
                    </Button>
                  </div>

                  {formData.distribution.length === 0 ? (
                    <div className="text-center py-10 border border-dashed rounded-lg">
                      {showMissingDistributionError && (
                        <div className="mx-auto mb-4 flex max-w-xl items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          Add at least one FileObject or FileSet before saving Croissant metadata.
                        </div>
                      )}
                      <p className="text-muted-foreground mb-4">No distribution items added yet.</p>
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          handleAddDistribution();
                        }}
                        type="button"
                      >
                        <Plus className="mr-2 h-4 w-4" /> Add Distribution
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {showHashError && (
                        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          At least one of MD5 Hash or SHA-256 Hash is required for each distribution
                          item.
                        </div>
                      )}
                      {distributionFields.map((field) => {
                        const isHashField =
                          field.id === 'distribution.md5' || field.id === 'distribution.sha256';
                        return (
                          <React.Fragment key={field.id}>
                            {canEditExpertOnlyFields &&
                              !isFieldReadOnly(field) &&
                              field.id === 'distribution.sha256' && (
                                <div
                                  className={`flex items-start gap-2 rounded-md border px-4 py-3 text-sm ${showHashError ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400'}`}
                                >
                                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                  <span>
                                    Provide at least one checksum, either SHA-256 or MD5. SHA-256 is
                                    preferred.
                                  </span>
                                </div>
                              )}
                            <div
                              className={
                                isHashField && showHashError
                                  ? 'p-1 rounded-md ring-1 ring-destructive/50'
                                  : 'p-1'
                              }
                            >
                              <CroissantFieldInput
                                field={field}
                                value={formData.distribution[activeDistIdx]?.[field.id]}
                                onChange={(val) =>
                                  handleDistributionChange(activeDistIdx, field.id, val)
                                }
                                readOnly={isFieldReadOnly(field)}
                                readOnlyReason={getFieldReadOnlyReason(field)}
                              />
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* FileSet tab */}
            <TabsContent value="fileSet" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">File Sets</CardTitle>
                  <CardDescription>
                    Describe folders or repeated file groups from the uploaded package.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    {formData.fileSet.map((item, idx) => (
                      <div key={idx} className="flex items-center">
                        <Button
                          variant={activeFileSetIdx === idx ? 'default' : 'outline'}
                          className="rounded-r-none pr-3"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveFileSetIdx(idx);
                          }}
                          type="button"
                        >
                          {item['fileSet.name'] || `File Set ${idx + 1}`}
                        </Button>
                        <Button
                          variant={activeFileSetIdx === idx ? 'default' : 'outline'}
                          className="rounded-l-none px-2 border-l-0 hover:bg-destructive hover:text-destructive-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            handleRemoveFileSet(idx);
                          }}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault();
                        handleAddFileSet();
                      }}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add File Set
                    </Button>
                  </div>

                  {formData.fileSet.length === 0 ? (
                    <div className="text-center py-10 border border-dashed rounded-lg">
                      <p className="text-muted-foreground mb-4">No file sets added yet.</p>
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          handleAddFileSet();
                        }}
                        type="button"
                      >
                        <Plus className="mr-2 h-4 w-4" /> Create File Set
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {fileSetFields.map((field) => (
                        <div key={field.id} className="p-1">
                          <CroissantFieldInput
                            field={field}
                            value={activeFileSetItem[field.id]}
                            onChange={(val) => handleFileSetChange(activeFileSetIdx, field.id, val)}
                            readOnly={isFieldReadOnly(field)}
                            readOnlyReason={getFieldReadOnlyReason(field)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Attributes tab */}
            <TabsContent value="recordSet" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Attributes</CardTitle>
                  <CardDescription>
                    Describe logical tables and fields so experts can map the upload to OpenML.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  <div className="flex flex-wrap items-center gap-2 pb-2">
                    {formData.recordSet.map((item, idx) => (
                      <div key={idx} className="flex items-center">
                        <Button
                          variant={activeRecordSetIdx === idx ? 'default' : 'outline'}
                          className="rounded-r-none pr-3"
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveRecordSetIdx(idx);
                            setActiveFieldIdx(0);
                          }}
                          type="button"
                        >
                          {String(item['recordSet.name'] || `Record Set ${idx + 1}`)}
                        </Button>
                        <Button
                          variant={activeRecordSetIdx === idx ? 'default' : 'outline'}
                          className="rounded-l-none px-2 border-l-0 hover:bg-destructive hover:text-destructive-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            handleRemoveRecordSet(idx);
                          }}
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      onClick={(e) => {
                        e.preventDefault();
                        handleAddRecordSet();
                      }}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Record Set
                    </Button>
                  </div>

                  {formData.recordSet.length === 0 ? (
                    <div className="text-center py-10 border border-dashed rounded-lg">
                      <p className="text-muted-foreground mb-4">No record sets added yet.</p>
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          handleAddRecordSet();
                        }}
                        type="button"
                      >
                        <Plus className="mr-2 h-4 w-4" /> Create Record Set
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="space-y-6">
                        {recordSetFields.map((field) => (
                          <div key={field.id} className="p-1">
                            <CroissantFieldInput
                              field={field}
                              value={activeRecordSetItem[field.id] as FieldValue}
                              onChange={(val) =>
                                handleRecordSetChange(activeRecordSetIdx, field.id, val)
                              }
                              readOnly={isFieldReadOnly(field)}
                              readOnlyReason={getFieldReadOnlyReason(field)}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="border-t pt-6 space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {activeFields.map((fieldItem, idx) => (
                            <div key={idx} className="flex items-center">
                              <Button
                                variant={activeFieldIdx === idx ? 'default' : 'outline'}
                                className="rounded-r-none pr-3"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setActiveFieldIdx(idx);
                                }}
                                type="button"
                              >
                                {fieldItem['field.name'] || `Attribute ${idx + 1}`}
                              </Button>
                              <Button
                                variant={activeFieldIdx === idx ? 'default' : 'outline'}
                                className="rounded-l-none px-2 border-l-0 hover:bg-destructive hover:text-destructive-foreground"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleRemoveField(idx);
                                }}
                                type="button"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              e.preventDefault();
                              handleAddField();
                            }}
                            type="button"
                          >
                            <Plus className="mr-2 h-4 w-4" /> Add Attribute
                          </Button>
                        </div>

                        {activeFields.length === 0 ? (
                          <div className="text-center py-8 border border-dashed rounded-lg">
                            <p className="text-muted-foreground mb-4">
                              No attributes added for this record set yet.
                            </p>
                            <Button
                              onClick={(e) => {
                                e.preventDefault();
                                handleAddField();
                              }}
                              type="button"
                            >
                              <Plus className="mr-2 h-4 w-4" /> Create Attribute
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {fieldFields.map((field) => (
                              <div key={field.id} className="p-1">
                                <CroissantFieldInput
                                  field={field}
                                  value={activeFieldItem[field.id] as FieldValue}
                                  onChange={(val) =>
                                    handleFieldChange(
                                      activeRecordSetIdx,
                                      activeFieldIdx,
                                      field.id,
                                      val,
                                    )
                                  }
                                  itemData={activeFieldItem}
                                  crossReferenceOptions={crossReferenceOptions}
                                  readOnly={isFieldReadOnly(field)}
                                  readOnlyReason={getFieldReadOnlyReason(field)}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* RAI tab */}
            <TabsContent value="rai" className="mt-0 outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">Responsible AI</CardTitle>
                  <CardDescription>
                    Add known collection, use, limitation, and sensitive-data notes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {raiFields.map((field) => (
                    <div key={field.id} className="p-1">
                      <CroissantFieldInput
                        field={field}
                        value={formData.rai[field.id]}
                        onChange={(val) => handleRaiChange(field.id, val)}
                        readOnly={isFieldReadOnly(field)}
                        readOnlyReason={getFieldReadOnlyReason(field)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </form>
        </div>
      </Tabs>
    </div>
  );
};
