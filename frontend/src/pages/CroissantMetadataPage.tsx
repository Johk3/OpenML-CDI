import React, { useRef, useState } from 'react';
import { CROISSANT_USER_FIELDS } from '../constants/croissantFields';
import { CroissantFieldInput } from '../components/CroissantFieldInput';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ArrowLeft, Save, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { serializeCroissant, CroissantFormData, FieldValue } from '../utils/serializeCroissant';

const SECTIONS = [
  { id: 'dataset', label: 'Dataset', description: 'Core dataset metadata' },
  { id: 'distribution', label: 'Distribution', description: 'File objects and downloads' },
];

function distHasHash(item: Record<string, unknown>): boolean {
  return !!(
    (item['distribution.md5'] as string | undefined)?.trim() ||
    (item['distribution.sha256'] as string | undefined)?.trim()
  );
}

export const CroissantMetadataPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CroissantFormData>({
    dataset: {},
    distribution: [],
    fileSet: [],
    recordSet: [],
    rai: {},
  }); // For now RAI, recorset, fileset are ignored to maintain a simple system
  const [activeDistIdx, setActiveDistIdx] = useState(0);
  const [activeTab, setActiveTab] = useState('dataset');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // TODO: For now we use a simplified version and neglect RAI, recordSet, fileSet. Implement these in the future.
  const datasetFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'dataset');
  const distributionFields = CROISSANT_USER_FIELDS.filter((f) => f.section === 'distribution');

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

  /**
   * Validate required fields across ALL tabs using formData state.
   * Returns the section id of the first tab with a missing required field,
   * or null if everything is valid.
   */
  const findFirstInvalidSection = (): string | null => {
    // Check dataset required fields
    for (const field of datasetFields) {
      if (!field.required) continue;
      const val = formData.dataset[field.id];
      if (
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0)
      ) {
        return 'dataset';
      }
    }

    // Check distribution required fields (each item must have its required fields)
    for (let i = 0; i < formData.distribution.length; i++) {
      const item = formData.distribution[i];
      for (const field of distributionFields) {
        if (!field.required) continue;
        const val = item[field.id];
        if (
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0)
        ) {
          return 'distribution';
        }
      }
    }

    return null;
  };

  const handleSaveClick = () => {
    setSubmitAttempted(true);

    // First, check for cross-tab validation (fields on hidden tabs).
    // Switch to the invalid tab so native validation can highlight the fields.
    const invalidSection = findFirstInvalidSection();
    if (invalidSection && invalidSection !== activeTab) {
      setActiveTab(invalidSection);
      // Defer requestSubmit so the tab switch renders the fields first
      setTimeout(() => {
        formRef.current?.requestSubmit();
      }, 0);
      return;
    }

    // Trigger native form validation + submit on the current tab
    formRef.current?.requestSubmit();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    // Cross-tab validation: if the native validation passed for the current
    // tab, also check other tabs for missing required fields
    const invalidSection = findFirstInvalidSection();
    if (invalidSection) {
      setActiveTab(invalidSection);
      if (invalidSection !== activeTab) {
        setTimeout(() => {
          formRef.current?.requestSubmit();
        }, 0);
      }
      return;
    }

    // Custom distribution hash validation
    const invalidDistIndices = formData.distribution
      .map((item, idx) => (!distHasHash(item) ? idx : -1))
      .filter((idx) => idx !== -1);

    if (invalidDistIndices.length > 0) {
      setActiveTab('distribution');
      setActiveDistIdx(invalidDistIndices[0]);
      return;
    }

    const croissantJson = serializeCroissant(formData);
    // TODO: SEND DATA TO BACKEND HERE
    console.log('Croissant JSON:\n', JSON.stringify(croissantJson, null, 2));
    alert('Croissant metadata saved! Check browser console for output.');
    navigate('/datasets');
  };

  const activeDistItem = formData.distribution[activeDistIdx] ?? {};
  const showHashError =
    submitAttempted && formData.distribution.length > 0 && !distHasHash(activeDistItem);

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
          <Button variant="outline" onClick={() => navigate('/datasets')} type="button">
            Cancel
          </Button>
          <Button onClick={handleSaveClick} type="button">
            <Save className="mr-2 h-4 w-4" /> Save Metadata
          </Button>
        </div>
      </div>

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
                            {field.id === 'distribution.sha256' && (
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
          </form>
        </div>
      </Tabs>
    </div>
  );
};
