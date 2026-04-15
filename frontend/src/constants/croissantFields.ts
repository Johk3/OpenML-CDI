import type { CroissantFieldDef, GeneratedFieldDef } from '../types/croissant';

// Fields emitted automatically by the serializer. Never shown to the user.
export const CROISSANT_GENERATED_FIELDS: GeneratedFieldDef[] = [
  {
    id: '@context',
    label: 'JSON-LD Context',
    section: 'dataset',
    value: {
      '@language': 'en',
      '@vocab': 'https://schema.org/',
      citeAs: 'cr:citeAs',
      column: 'cr:column',
      conformsTo: 'dct:conformsTo',
      cr: 'http://mlcommons.org/croissant/',
      data: { '@id': 'cr:data', '@type': '@json' },
      dataBiases: 'cr:dataBiases',
      dataCollection: 'cr:dataCollection',
      dataType: { '@id': 'cr:dataType', '@type': '@vocab' },
      dct: 'http://purl.org/dc/terms/',
      extract: 'cr:extract',
      field: 'cr:field',
      fileProperty: 'cr:fileProperty',
      fileObject: 'cr:fileObject',
      fileSet: 'cr:fileSet',
      format: 'cr:format',
      includes: 'cr:includes',
      isLiveDataset: 'cr:isLiveDataset',
      jsonPath: 'cr:jsonPath',
      key: 'cr:key',
      md5: 'cr:md5',
      parentField: 'cr:parentField',
      path: 'cr:path',
      personalSensitiveInformation: 'cr:personalSensitiveInformation',
      rai: 'http://mlcommons.org/croissant/RAI/',
      recordSet: 'cr:recordSet',
      references: 'cr:references',
      regex: 'cr:regex',
      repeated: 'cr:repeated',
      replace: 'cr:replace',
      sc: 'https://schema.org/',
      separator: 'cr:separator',
      source: 'cr:source',
      subField: 'cr:subField',
      transform: 'cr:transform',
    } as Record<string, unknown>,
    helperText:
      'Sets the JSON-LD vocabulary: schema.org, Croissant (cr:), RAI (rai:), and Dublin Core (dct:).',
  },
  {
    id: '@type',
    label: 'Document Type',
    section: 'dataset',
    value: 'sc:Dataset',
    helperText: 'Always "sc:Dataset" for a Croissant file.',
  },
  {
    id: 'conformsTo',
    label: 'Croissant Version',
    section: 'dataset',
    value: 'http://mlcommons.org/croissant/1.1',
    helperText: 'Declares conformance to Croissant 1.1.',
  },
];

export const CROISSANT_USER_FIELDS: CroissantFieldDef[] = [
  // ── dataset: required ────────────────────────────────────────────────────

  {
    id: 'name',
    label: 'Dataset Name',
    section: 'dataset',
    inputType: 'text',
    required: true,
    placeholder: 'madoff-airlines-dataset',
    helperText:
      'A unique identifier for your dataset. Lowercase letters, hyphens, or underscores. No spaces.',
    pattern: '^[-a-zA-Z0-9_]+$',
    patternMessage: 'Must only contain letters, numbers, hyphens, and underscores.',
  },
  {
    id: 'description',
    label: 'Description',
    section: 'dataset',
    inputType: 'textarea',
    required: true,
    placeholder: 'What does this dataset contain, how was it collected, and what is it useful for?',
    helperText:
      'Explain what the data contains, how it was collected, and what it is good for. Note any limitations. Markdown is supported.',
  },
  {
    id: 'license',
    label: 'License',
    section: 'dataset',
    inputType: 'url',
    required: true,
    placeholder: 'https://creativecommons.org/licenses/by/4.0/',
    helperText:
      'URL of the license for this dataset. Without one, others cannot legally reuse your data. Common options: CC BY 4.0, CC0 1.0, Apache-2.0.',
  },
  {
    id: 'url',
    label: 'Dataset URL',
    section: 'dataset',
    inputType: 'url',
    required: true,
    placeholder: 'https://github.com/yourorg/your-dataset',
    helperText:
      'The main web page for this dataset. A GitHub repo, Zenodo record, or institutional page works well.',
  },
  {
    id: 'creator',
    label: 'Creator(s)',
    section: 'dataset',
    inputType: 'multi-text',
    required: true,
    placeholder: 'Jane Doe',
    helperText: 'Full names of the people or organizations who created this dataset.',
    pattern: '^([^.,]+)(,\\s*[^.,]+)*$',
    patternMessage:
      'Must be a comma-separated list of names without special characters like periods.',
  },
  {
    id: 'datePublished',
    label: 'Date Published',
    section: 'dataset',
    inputType: 'date',
    required: true,
    helperText: 'When this dataset was made publicly available.',
  },

  // ── dataset: recommended ─────────────────────────────────────────────────

  {
    id: 'keywords',
    label: 'Keywords',
    section: 'dataset',
    inputType: 'multi-text',
    required: false,
    placeholder: 'image classification',
    helperText:
      'Words that describe the domain, task, or content of the dataset. Helps people find it.',
  },
  {
    id: 'version',
    label: 'Version',
    section: 'dataset',
    inputType: 'text',
    required: false,
    placeholder: '1.0',
    helperText: 'The version of the dataset content. Increment when you release updated data.',
  },
  {
    id: 'publisher',
    label: 'Publisher',
    section: 'dataset',
    inputType: 'text',
    required: false,
    placeholder: 'Madoff Research Institute',
    helperText: 'The organization that published this dataset, if different from the creator(s).',
  },
  {
    id: 'dateCreated',
    label: 'Date Created',
    section: 'dataset',
    inputType: 'date',
    required: false,
    helperText:
      'When you started collecting or building this dataset. May be earlier than the publication date.',
  },
  {
    id: 'dateModified',
    label: 'Date Last Modified',
    section: 'dataset',
    inputType: 'date',
    required: false,
    helperText: 'When the dataset content was last updated.',
  },
  {
    id: 'sameAs',
    label: 'Alternate URL',
    section: 'dataset',
    inputType: 'url',
    required: false,
    placeholder: 'https://huggingface.co/datasets/yourorg/your-dataset',
    helperText:
      'Another URL where this same dataset can be found, such as a Kaggle or Hugging Face listing.',
  },
  {
    id: 'inLanguage',
    label: 'Language',
    section: 'dataset',
    inputType: 'text',
    required: false,
    placeholder: 'en',
    helperText:
      'The language of the dataset content as a BCP-47 code (e.g. "en", "de", "zh-Hans"). Skip if the data has no natural language content.',
    pattern: '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$',
    patternMessage: 'Must be a valid BCP-47 language tag (e.g. en, en-US, zh-Hans).',
  },
  {
    id: 'citation',
    label: 'Citation(s)',
    section: 'dataset',
    inputType: 'multi-text',
    required: false,
    placeholder: 'https://doi.org/10.1234/example',
    helperText:
      'Works that this dataset cites or is based on. Use DOI URLs or BibTeX keys. For citing this dataset itself, see "How to Cite This Dataset".',
  },
  {
    id: 'funder',
    label: 'Funder(s)',
    section: 'dataset',
    inputType: 'multi-text',
    required: false,
    placeholder: 'Madoff Research Council',
    helperText: 'Organizations or people who funded the creation of this dataset.',
  },
  {
    id: 'temporalCoverage',
    label: 'Temporal Coverage',
    section: 'dataset',
    inputType: 'text',
    required: false,
    placeholder: '2020-01-01/2023-12-31',
    helperText:
      'The time period the data covers, in ISO 8601 interval format. Use a single date if collected on one day.',
    pattern: '^\\d{4}(-\\d{2}(-\\d{2})?)?(/\\d{4}(-\\d{2}(-\\d{2})?)?)?$',
    patternMessage: 'Must be a valid ISO 8601 date or time interval (e.g. YYYY-MM-DD/YYYY-MM-DD).',
  },
  {
    id: 'spatialCoverage',
    label: 'Spatial Coverage',
    section: 'dataset',
    inputType: 'text',
    required: false,
    placeholder: 'Germany',
    helperText:
      'The geographic area the data covers. A country name, city, or GeoShape description.',
  },
  {
    id: 'measurementTechnique',
    label: 'Measurement Technique',
    section: 'dataset',
    inputType: 'text',
    required: false,
    placeholder: 'MRI scan, 3T Siemens Prisma',
    helperText:
      'The method or instrument used to collect the data. Helps others assess quality and reproducibility.',
  },
  {
    id: 'variableMeasured',
    label: 'Variable(s) Measured',
    section: 'dataset',
    inputType: 'multi-text',
    required: false,
    placeholder: 'heart rate',
    helperText:
      'The real-world phenomena captured in this dataset, separate from column names. Examples: temperature, sentiment score, blood pressure.',
  },

  // ── dataset: Croissant-specific optional ─────────────────────────────────

  {
    id: 'citeAs',
    label: 'How to Cite This Dataset',
    section: 'dataset',
    inputType: 'textarea',
    required: false,
    placeholder:
      '@article{yourname2024,\n  title={My Dataset},\n  author={Doe, Jane},\n  year={2024}\n}',
    helperText:
      'The citation you want others to use when referencing your dataset. BibTeX format is preferred.',
  },
  {
    id: 'isLiveDataset',
    label: 'Is Live Dataset',
    section: 'dataset',
    inputType: 'boolean',
    required: false,
    helperText:
      'Turn this on if the dataset is continuously updated. Leave it off for static snapshots.',
  },
  {
    id: 'sdVersion',
    label: 'Metadata Version',
    section: 'dataset',
    inputType: 'text',
    required: false,
    placeholder: '1.0',
    helperText:
      'The version of this metadata document, not the dataset itself. Increment when you update the metadata without changing the data.',
  },
  {
    id: 'sdLicense',
    label: 'Metadata License',
    section: 'dataset',
    inputType: 'url',
    required: false,
    placeholder: 'https://creativecommons.org/licenses/by/4.0/',
    helperText: 'The license for this metadata document. Often CC BY 4.0 or CC0.',
  },

  // ── distribution: FileObject ──────────────────────────────────────────────

  {
    id: 'distribution.name',
    label: 'File Name',
    section: 'distribution',
    inputType: 'text',
    required: true,
    placeholder: 'train.csv',
    helperText:
      'A unique name for this file. Used internally to reference it from record sets and fields.',
  },
  {
    id: 'distribution.contentUrl',
    label: 'File URL',
    section: 'distribution',
    inputType: 'url',
    required: true,
    placeholder: 'https://example.com/data/train.csv',
    helperText: 'A direct download URL for this file. Must be publicly accessible.',
  },
  {
    id: 'distribution.encodingFormat',
    label: 'File Format',
    section: 'distribution',
    inputType: 'text',
    required: true,
    placeholder: 'text/csv',
    helperText:
      'The MIME type of this file (e.g. text/csv, application/parquet, image/jpeg). You can also use a URL for niche formats.',
    pattern: '^([a-zA-Z0-9\\-.]+\\/[a-zA-Z0-9\\-.]+|https?:\\/\\/.*)$',
    patternMessage: 'Must be a valid MIME type (e.g., text/csv) or a URL.',
  },
  {
    id: 'distribution.description',
    label: 'File Description',
    section: 'distribution',
    inputType: 'text',
    required: false,
    placeholder: 'Training split with 80% of labelled examples',
    helperText: 'What this file contains, such as which split it represents.',
  },
  {
    id: 'distribution.sha256',
    label: 'SHA-256 Hash',
    section: 'distribution',
    inputType: 'text',
    required: false,
    placeholder: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    helperText:
      'The SHA-256 checksum of this file. Tools use it to verify the download is intact. Generate with `sha256sum <file>`.',
    pattern: '^[A-Fa-f0-9]{64}$',
    patternMessage: 'Must be exactly 64 hexadecimal characters.',
  },
  {
    id: 'distribution.md5',
    label: 'MD5 Hash',
    section: 'distribution',
    inputType: 'text',
    required: false,
    placeholder: 'd8e8fca2dc0f896fd7cb4cb0031ba249',
    helperText:
      'The MD5 checksum of this file. SHA-256 is preferred, but MD5 is supported for legacy compatibility.',
    pattern: '^[A-Fa-f0-9]{32}$',
    patternMessage: 'Must be exactly 32 hexadecimal characters.',
  },
  {
    id: 'distribution.contentSize',
    label: 'File Size',
    section: 'distribution',
    inputType: 'text',
    required: false,
    placeholder: '25585843 B',
    helperText:
      'The size of the file in bytes (e.g. "25585843 B"). Used as informational metadata.',
  },
  {
    id: 'distribution.containedIn',
    label: 'Contained In Archive',
    section: 'distribution',
    inputType: 'text',
    required: false,
    placeholder: 'dataset.zip',
    helperText:
      "If this file is inside a zip or tar archive, enter that archive's file name here. Tools will download the archive first, then extract this file.",
  },

  // ── fileSet: FileSet ──────────────────────────────────────────────────────

  {
    id: 'fileSet.name',
    label: 'File Set Name',
    section: 'fileSet',
    inputType: 'text',
    required: true,
    placeholder: 'image-files',
    helperText:
      'A unique name for this file collection. Use a FileSet when your data spans many files matched by a pattern, like thousands of images.',
  },
  {
    id: 'fileSet.description',
    label: 'File Set Description',
    section: 'fileSet',
    inputType: 'text',
    required: false,
    placeholder: 'All JPEG images in the raw/ directory',
    helperText: 'What files are in this set.',
  },
  {
    id: 'fileSet.containedIn',
    label: 'Contained In Archive',
    section: 'fileSet',
    inputType: 'text',
    required: false,
    placeholder: 'images.zip',
    helperText:
      'If the files are inside an archive, enter its name here. Tools will extract it before applying file patterns.',
  },
  {
    id: 'fileSet.encodingFormat',
    label: 'File Set Format',
    section: 'fileSet',
    inputType: 'text',
    required: false,
    placeholder: 'image/jpeg',
    helperText: 'The MIME type shared by all files in this set.',
    pattern: '^([a-zA-Z0-9\\-.]+\\/[a-zA-Z0-9\\-.]+|https?:\\/\\/.*)$',
    patternMessage: 'Must be a valid MIME type (e.g., text/csv) or a URL.',
  },
  {
    id: 'fileSet.includes',
    label: 'Include Pattern',
    section: 'fileSet',
    inputType: 'text',
    required: false,
    placeholder: '*.jpg',
    helperText:
      'A glob pattern for files to include, e.g. "*.jpg" or "images/**/*.png". Leave blank to include all files.',
  },
  {
    id: 'fileSet.excludes',
    label: 'Exclude Pattern',
    section: 'fileSet',
    inputType: 'text',
    required: false,
    placeholder: '*_thumbnail.jpg',
    helperText: 'A glob pattern for files to exclude. Applied after the include pattern.',
  },

  // ── recordSet ─────────────────────────────────────────────────────────────

  {
    id: 'recordSet.name',
    label: 'Record Set Name',
    section: 'recordSet',
    inputType: 'text',
    required: true,
    placeholder: 'train_examples',
    helperText:
      'A name for this logical table of rows. Datasets with train/val/test splits usually have one record set per split.',
  },
  {
    id: 'recordSet.description',
    label: 'Record Set Description',
    section: 'recordSet',
    inputType: 'text',
    required: false,
    placeholder: 'The training split of labelled examples',
    helperText: 'What this record set represents.',
  },
  {
    id: 'recordSet.key',
    label: 'Primary Key Field(s)',
    section: 'recordSet',
    inputType: 'multi-text',
    required: false,
    placeholder: 'id',
    helperText:
      'The field or fields that uniquely identify each row. Supports composite keys. Required if other record sets reference rows in this one.',
  },
  {
    id: 'recordSet.isEnumeration',
    label: 'Is Enumeration',
    section: 'recordSet',
    inputType: 'boolean',
    required: false,
    helperText:
      'Turn this on if this record set defines a fixed list of categories, like a set of class labels.',
  },
  {
    id: 'recordSet.dataType',
    label: 'Semantic Data Type',
    section: 'recordSet',
    inputType: 'url',
    required: false,
    placeholder: 'https://schema.org/ImageObject',
    helperText:
      'A schema.org URL for the type of object each row describes. Skip for generic tabular data.',
  },
  {
    id: 'recordSet.annotation',
    label: 'Annotation',
    section: 'recordSet',
    inputType: 'textarea',
    required: false,
    placeholder: '{"count": 50000, "format": "COCO"}',
    helperText:
      'Machine-readable annotations about this record set, such as descriptive statistics. JSON format is recommended.',
    isJson: true,
  },

  // ── field: identity and type ──────────────────────────────────────────────

  {
    id: 'field.name',
    label: 'Column Name',
    section: 'field',
    inputType: 'text',
    required: true,
    placeholder: 'age',
    helperText:
      'The exact column header from the source file. Must match the file exactly, including capitalization.',
  },
  {
    id: 'field.description',
    label: 'Column Description',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: "The participant's age in years at time of survey",
    helperText:
      'What the values in this column represent. Include units and note any special values like -1 for missing data.',
  },
  {
    id: 'field.dataType',
    label: 'Data Type(s)',
    section: 'field',
    inputType: 'multi-text',
    required: true,
    options: [
      'sc:Text',
      'sc:Integer',
      'sc:Float',
      'sc:Boolean',
      'sc:Date',
      'sc:DateTime',
      'sc:Time',
      'sc:URL',
      'sc:ImageObject',
      'sc:AudioObject',
      'sc:VideoObject',
      'sc:GeoCoordinates',
      'sc:GeoShape',
      'cr:BoundingBox',
      'cr:Label',
    ],
    helperText:
      'One or more types for this field. Include at least one atomic type (e.g. sc:Float) and optionally a semantic type (e.g. sc:GeoCoordinates). Any schema.org or external vocabulary URI is valid.',
  },
  {
    id: 'field.isArray',
    label: 'Is Array',
    section: 'field',
    inputType: 'boolean',
    required: false,
    helperText:
      'Turn this on if the field holds a list of values per row, e.g. a JSON array of tags. The declared data type applies to each item.',
  },
  {
    id: 'field.arrayShape',
    label: 'Array Shape',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: '-1',
    helperText:
      'The shape of the array: "-1" for variable length, "3" for fixed length, "224 224 3" for a 3D tensor. Only used when Is Array is on.',
  },
  {
    id: 'field.isEnumeration',
    label: 'Is Enumeration',
    section: 'field',
    inputType: 'boolean',
    required: false,
    helperText:
      'Turn this on if values come from a fixed set of categories, like a label column with values "cat", "dog", "bird".',
  },
  {
    id: 'field.subField',
    label: 'Sub-Field Names',
    section: 'field',
    inputType: 'multi-text',
    required: false,
    placeholder: 'gps_coordinates/latitude',
    helperText:
      'Names of fields nested inside this one, in "parentField/childField" format. Use this for structured types like GeoCoordinates or BoundingBox where each component maps to a separate source column.',
  },
  {
    id: 'field.annotation',
    label: 'Field Annotation',
    section: 'field',
    inputType: 'textarea',
    required: false,
    placeholder: '{"min": 0, "max": 120, "mean": 34.2}',
    helperText:
      'Machine-readable annotations about this field, such as descriptive statistics. JSON format is recommended.',
    isJson: true,
  },

  // ── field: source reference ───────────────────────────────────────────────

  {
    id: 'field.source.fileObject',
    label: 'Source: File Object',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: 'train.csv',
    helperText:
      'The name of the FileObject this field draws its values from. Use one of fileObject, fileSet, or recordSet as the source.',
  },
  {
    id: 'field.source.fileSet',
    label: 'Source: File Set',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: 'image-files',
    helperText: 'The name of the FileSet this field draws its values from.',
  },
  {
    id: 'field.source.recordSet',
    label: 'Source: Record Set',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: 'labels',
    helperText: 'The name of another RecordSet this field draws its values from.',
  },

  // ── field: extraction ─────────────────────────────────────────────────────

  {
    id: 'field.source.extract.column',
    label: 'Extract: Column',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: 'age_years',
    helperText:
      'For CSV sources: the column name to extract values from. Leave blank if the field name matches the column header exactly.',
  },
  {
    id: 'field.source.extract.jsonPath',
    label: 'Extract: JSONPath',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: '$.answers[*].text',
    helperText: 'For JSON sources: a JSONPath expression that selects the values for this field.',
  },
  {
    id: 'field.source.extract.fileProperty',
    label: 'Extract: File Property',
    section: 'field',
    inputType: 'select',
    required: false,
    options: ['fullpath', 'filename', 'content', 'lines', 'lineNumbers'],
    helperText:
      'For FileObject or FileSet sources: which file property to extract. "filename" gives the file name, "content" gives the raw bytes, "lines" splits the file into rows.',
  },

  // ── field: transforms ─────────────────────────────────────────────────────

  {
    id: 'field.source.transform.regex',
    label: 'Transform: Regex',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: '^(train|val|test)2014/.*\\.jpg$',
    helperText:
      'A regular expression applied to extracted values. The first capture group becomes the field value.',
  },
  {
    id: 'field.source.transform.jsonPath',
    label: 'Transform: JSONPath',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: 'text',
    helperText:
      'A JSONPath expression applied after extraction, for drilling into nested JSON values.',
  },
  {
    id: 'field.source.transform.separator',
    label: 'Transform: Separator',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: ',',
    helperText:
      'A character used to split a string value into a list. For example "," splits "a,b,c" into ["a", "b", "c"].',
  },
  {
    id: 'field.source.transform.readLines',
    label: 'Transform: Read Lines',
    section: 'field',
    inputType: 'boolean',
    required: false,
    helperText:
      'Turn this on to split the extracted content into individual lines, one per record.',
  },
  {
    id: 'field.source.transform.unArchive',
    label: 'Transform: Unarchive',
    section: 'field',
    inputType: 'boolean',
    required: false,
    helperText:
      'Turn this on if the source file is an archive (zip, tar) that needs to be extracted before reading.',
  },
  {
    id: 'field.source.format',
    label: 'Parse Format',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: '%Y-%m-%d %H:%M:%S',
    helperText:
      'A format string for parsing text values into typed data. Use strftime format for dates (e.g. "%Y-%m-%d") or a number format string for floats.',
  },

  // ── field: structural relations ───────────────────────────────────────────

  {
    id: 'field.equivalentProperty',
    label: 'Equivalent Property',
    section: 'field',
    inputType: 'url',
    required: false,
    placeholder: 'https://schema.org/givenName',
    helperText:
      'A schema.org URL for the property this field maps to. Useful for semantic interoperability with knowledge graphs.',
  },
  {
    id: 'field.references',
    label: 'References (Foreign Key)',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: 'labels/id',
    helperText:
      'Another field this one references, in "recordSetName/fieldName" format. Works like a foreign key. Tools can use this to join record sets.',
  },
  {
    id: 'field.parentField',
    label: 'Parent Field',
    section: 'field',
    inputType: 'text',
    required: false,
    placeholder: 'examples/id',
    helperText:
      'A reference to a field from the parent RecordSet that this sub-field is grouped under. Used when flattening nested structures.',
  },

  // ── rai: data collection ──────────────────────────────────────────────────

  {
    id: 'rai.dataCollection',
    label: 'Data Collection Process',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe how the data was collected...',
    helperText:
      'A description of how the data was collected. Include sources, methods, and any selection criteria.',
  },
  {
    id: 'rai.dataCollectionType',
    label: 'Collection Type(s)',
    section: 'rai',
    inputType: 'multi-text',
    required: false,
    placeholder: 'Web Scraping',
    helperText:
      'The type(s) of collection method used. Examples: Web Scraping, Manual Human Curation, Secondary Data Analysis, Surveys.',
  },
  {
    id: 'rai.dataCollectionRawData',
    label: 'Raw Data Description',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe the raw source material before processing...',
    helperText:
      'A description of the raw or source material the data was collected or derived from.',
  },
  {
    id: 'rai.dataCollectionTimeFrameStart',
    label: 'Collection Start Date',
    section: 'rai',
    inputType: 'date',
    required: false,
    helperText: 'When data collection started.',
  },
  {
    id: 'rai.dataCollectionTimeFrameEnd',
    label: 'Collection End Date',
    section: 'rai',
    inputType: 'date',
    required: false,
    helperText: 'When data collection ended.',
  },

  // ── rai: use and limitations ──────────────────────────────────────────────

  {
    id: 'rai.dataUseCases',
    label: 'Intended Use Cases',
    section: 'rai',
    inputType: 'multi-text',
    required: false,
    placeholder: 'Training image classifiers',
    helperText:
      'The intended or appropriate use cases for this dataset. Be specific about what tasks it was designed for.',
  },
  {
    id: 'rai.dataLimitations',
    label: 'Limitations',
    section: 'rai',
    inputType: 'multi-text',
    required: false,
    placeholder: 'Underrepresents non-English speakers',
    helperText:
      'Known limitations, gaps, or constraints of this dataset. Users need this to decide if it fits their use case.',
  },
  {
    id: 'rai.dataBiases',
    label: 'Biases',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe any known biases in the data or collection process...',
    helperText:
      'Known biases in the data or collection process. This includes demographic skews, label biases, or sampling biases.',
  },
  {
    id: 'rai.personalSensitiveInformation',
    label: 'Personal and Sensitive Information',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe any PII or sensitive categories present in the data...',
    helperText:
      'Any personally identifiable information or sensitive categories (health, financial, biometric) present in the dataset and how they are handled.',
  },
  {
    id: 'rai.dataSocialImpact',
    label: 'Social Impact',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe the positive and negative social impact of releasing this dataset...',
    helperText:
      'The expected positive and negative social impact of this dataset. Consider downstream uses and who may be affected.',
  },

  // ── rai: annotation ───────────────────────────────────────────────────────

  {
    id: 'rai.dataAnnotationProtocol',
    label: 'Annotation Protocol',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe the annotation instructions and guidelines...',
    helperText:
      'The instructions and guidelines given to annotators. Include task descriptions, label definitions, and any edge case handling.',
  },
  {
    id: 'rai.dataAnnotationPlatform',
    label: 'Annotation Platform',
    section: 'rai',
    inputType: 'text',
    required: false,
    placeholder: 'Amazon Mechanical Turk',
    helperText: 'The platform or tool used to collect annotations.',
  },
  {
    id: 'rai.dataAnnotationAnalysis',
    label: 'Annotation Quality Analysis',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe validation methods, inter-annotator agreement, etc.',
    helperText:
      'How annotation quality was measured and validated. Include inter-annotator agreement scores or any review process.',
  },
  {
    id: 'rai.annotationsPerItem',
    label: 'Annotations Per Item',
    section: 'rai',
    inputType: 'text',
    required: false,
    placeholder: '3',
    helperText:
      'How many annotations were collected per data item. "3" means each item was labelled by three different annotators.',
  },
  {
    id: 'rai.annotatorDemographics',
    label: 'Annotator Demographics',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe the demographic breakdown of annotators...',
    helperText:
      'The demographic profile of the people who annotated this dataset. Include relevant characteristics such as age, geography, or expertise level.',
  },
  {
    id: 'rai.machineAnnotationTools',
    label: 'Machine Annotation Tools',
    section: 'rai',
    inputType: 'multi-text',
    required: false,
    placeholder: 'GPT-5, Grok',
    helperText:
      'Any automated or machine-learning tools used to assist or produce annotations. List tool names and versions where possible.',
  },

  // ── rai: preprocessing and maintenance ───────────────────────────────────

  {
    id: 'rai.dataPreprocessingProtocol',
    label: 'Preprocessing Steps',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe cleaning, normalization, filtering, etc.',
    helperText:
      'The steps taken to clean or preprocess the raw data before release. Include filtering rules, normalization, and deduplication.',
  },
  {
    id: 'rai.dataManipulationProtocol',
    label: 'Data Manipulation Protocol',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder:
      'Describe any transformations, filtering, or manipulation applied after collection...',
    helperText:
      'Any manipulation applied to the data after collection, such as filtering, transformation, augmentation, or normalization steps beyond basic preprocessing.',
  },
  {
    id: 'rai.dataReleaseMaintenance',
    label: 'Release and Maintenance Plan',
    section: 'rai',
    inputType: 'textarea',
    required: false,
    placeholder: 'Describe how the dataset will be maintained, updated, or deprecated...',
    helperText:
      'How this dataset will be maintained over time. Include update frequency, point of contact, and any planned deprecation.',
  },
];

export const CROISSANT_ALL_FIELDS = {
  user: CROISSANT_USER_FIELDS,
  generated: CROISSANT_GENERATED_FIELDS,
};

export const CROISSANT_FIELDS_BY_SECTION = {
  dataset: CROISSANT_USER_FIELDS.filter((f) => f.section === 'dataset'),
  distribution: CROISSANT_USER_FIELDS.filter((f) => f.section === 'distribution'),
  fileSet: CROISSANT_USER_FIELDS.filter((f) => f.section === 'fileSet'),
  recordSet: CROISSANT_USER_FIELDS.filter((f) => f.section === 'recordSet'),
  field: CROISSANT_USER_FIELDS.filter((f) => f.section === 'field'),
  rai: CROISSANT_USER_FIELDS.filter((f) => f.section === 'rai'),
} as const;

export const CROISSANT_REQUIRED_FIELDS = CROISSANT_USER_FIELDS.filter((f) => f.required);
