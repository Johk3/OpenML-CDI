# Croissant Metadata Input Page

## Table of Contents

- [Overview](#overview)
- [Official Croissant References](#official-croissant-references)
- [When Users Reach This Page](#when-users-reach-this-page)
- [Required Metadata](#required-metadata)
- [Page Sections](#page-sections)
- [Expected Formats](#expected-formats)
- [Generated and Read-Only Metadata](#generated-and-read-only-metadata)
- [Typical Scenarios](#typical-scenarios)
- [Advanced Scenarios](#advanced-scenarios)
- [Potential Issues and Questions](#potential-issues-and-questions)
- [Implementation References](#implementation-references)

## Overview

The Croissant metadata input page lets an uploader or expert describe an uploaded
machine learning dataset in Croissant-compatible JSON-LD. Croissant metadata
describes the dataset itself, the files that contain the data, the logical
records or attributes inside those files, and responsible AI context.

The page is mounted at `/metadata` and is protected by authentication. It is
usually opened after upload completion or from an existing dataset detail flow.
When a dataset id is provided, the page pre-fills fields from the upload record
and saves the resulting Croissant JSON-LD back to the dataset metadata.

The form is intentionally split across tabs because a Croissant description can
represent more than a flat dataset card. A single dataset can have multiple
files, file groups, tables, columns, extraction rules, and Responsible AI notes.

## Official Croissant References

Use this page for application-specific guidance. Use the official MLCommons
Croissant documentation when a field needs deeper standard-level detail:

- [Croissant documentation](https://docs.mlcommons.org/croissant/)
- [Croissant 1.1 format specification](https://docs.mlcommons.org/croissant/docs/croissant-spec-1.1.html)
- [Croissant RAI specification](https://docs.mlcommons.org/croissant/docs/croissant-rai-spec.html)
- [MLCommons Croissant working group](https://mlcommons.org/working-groups/data/croissant/)

The application currently serializes Croissant metadata with
`dct:conformsTo` set to `http://mlcommons.org/croissant/1.1`.

## When Users Reach This Page

Users normally reach the metadata page after uploading dataset files. The upload
flow prompts them to complete known metadata so expert review has enough context
to validate and publish the dataset.

Experts may also use the page during review to complete generated fields, check
file descriptions, add OpenML handoff hints, or improve Responsible AI context.
Some storage-derived values stay read-only even for experts because they must
match the uploaded objects.

## Required Metadata

The form cannot be saved until the required fields below are valid.

| Section      | Field           | Required value                                                                   |
| ------------ | --------------- | -------------------------------------------------------------------------------- |
| Dataset      | Dataset Name    | A stable dataset identifier using letters, numbers, hyphens, or underscores      |
| Dataset      | Description     | A human-readable description of what the data contains and how it should be used |
| Dataset      | License         | A license URL, either from the common options or a custom URL                    |
| Dataset      | Dataset URL     | The canonical dataset page; generated for uploaded datasets                      |
| Dataset      | Creator(s)      | One or more people or organizations responsible for the dataset                  |
| Dataset      | Date Published  | A publication date in `YYYY-MM-DD` format                                        |
| Distribution | File Name       | A unique name for each `FileObject`                                              |
| Distribution | File URL        | A direct file URL; generated for uploaded datasets                               |
| Distribution | File Format     | A MIME type or format URL for each file                                          |
| File Sets    | File Set Name   | A unique name for each `FileSet` when file sets are used                         |
| Attributes   | Record Set Name | A unique name for each logical record set when attributes are used               |
| Attributes   | Column Name     | The source column or attribute name for each field                               |
| Attributes   | Data Type(s)    | One or more Croissant/schema.org data types for each field                       |

At least one Distribution `FileObject` or File Set must exist before saving.
Experts also need at least one checksum, either SHA-256 or MD5, for each editable
distribution item. SHA-256 is preferred.

## Page Sections

### Dataset

The Dataset tab captures top-level metadata about the dataset as a whole. These
fields support discovery, citation, review, and OpenML handoff.

| Field group        | Purpose                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Identity           | Name, description, canonical URL, version, alternate URLs, language, and publication dates |
| Ownership          | Creators, publisher, funders, and citation information                                     |
| Reuse terms        | Dataset license and metadata license                                                       |
| Coverage           | Temporal coverage, spatial coverage, measured variables, and measurement technique         |
| OpenML hints       | Default target attribute, ignored attributes, row id attribute, and expected task type     |
| Croissant metadata | Citation text, live dataset flag, and metadata document version                            |

Use the description field to explain what the data contains, how it was
collected, what it is useful for, and any limitations. This is often the most
important field for reviewers and future users.

### Distribution

The Distribution tab describes individual files or archives as Croissant
`FileObject` resources. Use one distribution item for each file that should be
downloaded or referenced independently.

| Field group      | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| File identity    | Stable file object id and file name               |
| File location    | Direct content URL and optional archive container |
| File format      | MIME type or external format URL                  |
| File integrity   | SHA-256 checksum, MD5 checksum, and file size     |
| File description | Short explanation of what the file contains       |

For uploaded datasets, the application generates file names, URLs, formats,
sizes, and checksums from storage metadata where available. Those generated
values are read-only because changing them would make the metadata disagree with
the stored file.

### File Sets

The File Sets tab describes repeated or grouped files as Croissant `FileSet`
resources. Use a File Set when many files share the same meaning and can be
matched by a pattern, such as `images/**/*.jpg`.

| Field group          | Purpose                                   |
| -------------------- | ----------------------------------------- |
| File set identity    | Stable file set id and file set name      |
| File set location    | Optional archive container                |
| File matching        | Include and exclude glob patterns         |
| File set format      | Shared MIME type for the files in the set |
| File set description | Summary of what files belong to the group |

For folder uploads or compressed packages, the application can generate a File
Set from the uploaded directory structure.

### Attributes

The Attributes tab describes logical records and fields. This is where a
tabular dataset, labels file, image manifest, or other structured data becomes
machine-readable to Croissant-aware tools and easier for experts to map to
OpenML.

Record Sets describe logical groups of records, such as rows in `train.csv`,
entries in a label file, or images in a file set.

| Record set field group | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| Identity               | Stable record set id and record set name               |
| Meaning                | Description and semantic data type                     |
| Structure              | Primary key fields and enumeration flag                |
| Annotation             | Optional JSON annotations such as counts or statistics |

Fields describe attributes inside a record set, usually columns or values
extracted from a file.

| Field group       | Purpose                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Identity and type | Attribute id, column name, description, data type, array flag, array shape, enumeration flag, sub-fields, and annotations |
| Source reference  | The FileObject, FileSet, or RecordSet that supplies the values                                                            |
| Extraction        | Column, JSONPath, or file property used to extract values                                                                 |
| Transforms        | Regex, JSONPath, separator, read-lines, unarchive, and parse format rules                                                 |
| Relations         | Equivalent property, foreign key reference, and parent field                                                              |

For simple CSV datasets, start with one Record Set and one Field per important
column. Use `Default Target Attribute`, `Ignore Attribute(s)`, and `Row ID
Attribute` on the Dataset tab to help experts understand the intended OpenML
mapping.

### Responsible AI

The Responsible AI tab captures context that helps reviewers and downstream
users judge whether the dataset is appropriate for a task.

| Field group                | Purpose                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Collection                 | Collection process, collection types, raw data description, and collection dates                                            |
| Use and limitations        | Intended use cases, limitations, biases, sensitive information, and social impact                                           |
| Annotation                 | Annotation protocol, platform, quality analysis, annotations per item, annotator demographics, and machine annotation tools |
| Processing and maintenance | Preprocessing steps, manipulation protocol, and release or maintenance plan                                                 |

Fill these fields as specifically as possible when the dataset contains people,
health data, financial data, scraped data, labels produced by humans or models,
or any content with known sampling or representation concerns.

## Expected Formats

| Field type              | Expected format                                      | Example                                                            |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Dataset name            | Letters, numbers, hyphens, or underscores; no spaces | `madoff-airlines-dataset`                                          |
| URL                     | Absolute URL with protocol and host                  | `https://example.org/datasets/train`                               |
| Date                    | ISO date                                             | `2026-05-23`                                                       |
| Language                | BCP-47 language tag                                  | `en`, `en-US`, `zh-Hans`                                           |
| Temporal coverage       | ISO date or interval                                 | `2020-01-01/2023-12-31`                                            |
| File format             | MIME type or format URL                              | `text/csv`, `application/parquet`                                  |
| SHA-256                 | 64 hexadecimal characters                            | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| MD5                     | 32 hexadecimal characters                            | `d8e8fca2dc0f896fd7cb4cb0031ba249`                                 |
| Multi-value text        | Comma-separated values in the input                  | `class, split, source_id`                                          |
| JSON annotation         | Valid JSON object or value                           | `{"count": 50000, "format": "COCO"}`                               |
| Include/exclude pattern | Glob pattern                                         | `images/**/*.png`                                                  |
| Regex transform         | JavaScript-style regular expression                  | `^(train\|val\|test)/.*\\.jpg$`                                    |
| Parse format            | Date or number parsing pattern                       | `%Y-%m-%d`                                                         |
| Data type               | Croissant/schema.org term or external URI            | `sc:Float`, `sc:Text`, `cr:Label`                                  |

## Generated and Read-Only Metadata

The application emits some Croissant fields automatically and never shows them
as editable form controls:

- `@context`
- `@type`
- `dct:conformsTo`

When editing metadata for an uploaded dataset, the application also generates
values from the upload record:

- Dataset name, description, created date, publication date, and internal URL.
- File object names, content URLs, content types, sizes, and checksums.
- File sets from uploaded folder or archive structure.
- JSON-LD scaffolding required by the Croissant serializer.

Private upload contact metadata is not copied into public Croissant creator
fields. Users should explicitly enter public creator names or organizations.

## Typical Scenarios

### Single CSV File

1. Confirm Dataset fields: name, description, license, creators, and dates.
2. Confirm the generated Distribution item for the uploaded CSV file.
3. Add one Record Set named after the rows in the CSV.
4. Add one Field for each important column.
5. Set the default target attribute and ignored attributes when the dataset is
   meant for supervised OpenML tasks.

### Train, Validation, and Test Splits

1. Use one Distribution item per split file when the splits are separate files.
2. Use one Record Set per split if the columns are similar but the records have
   different roles.
3. Use matching Field definitions across the split record sets.
4. Document the split purpose in each file or record set description.

### Image Folder or Archive

1. Use a File Set for the image files, such as `images/**/*.jpg`.
2. Use a Distribution item for a manifest or labels file if one exists.
3. Add a Record Set for the image records.
4. Use Fields to describe image path, label, split, and any metadata columns.
5. Use extraction rules when values come from file names, paths, or manifest
   columns.

### Dataset With Sensitive or Human-Centered Data

1. Fill the Responsible AI collection, limitations, bias, and sensitive
   information fields.
2. Describe annotation protocol and annotator demographics when labels were
   created by people.
3. Explain preprocessing and filtering rules.
4. Use intended use cases and limitations to make unsupported uses clear.

## Advanced Scenarios

### Referencing Another Record Set

Use `References (Foreign Key)` when one field points to another record set, such
as a label id referencing a label table. Use the `recordSetName/fieldName`
format, for example `labels/id`.

### Extracting From JSON

Use `Extract: JSONPath` when field values are nested inside JSON files. Use
`Transform: JSONPath` when a first extraction returns a nested object that needs
another lookup.

### Extracting From File Paths

Use `Extract: File Property` with `filename` or `fullpath` when field values are
encoded in file names or paths. Add a regex transform when only part of the path
should become the field value.

### Arrays and Structured Values

Turn on `Is Array` when each record can contain multiple values for the same
field. Use `Array Shape` for fixed-size arrays or tensors. Use sub-fields for
structured values such as bounding boxes or coordinates.

### Live Datasets and Metadata Versions

Turn on `Is Live Dataset` only when the dataset is continuously updated. Use the
dataset `Version` for data content changes and `Metadata Version` for metadata
document changes that do not alter the underlying data.

## Potential Issues and Questions

### Why is a field read-only?

Some values are generated from the uploaded files and must remain consistent
with storage metadata. For example, the file URL, content type, checksum, and
file size are generated from the stored object.

### Why does save fail when most fields look complete?

Required fields can exist on hidden tabs or inactive file/record selectors. The
page switches to the first invalid section when possible. Check Dataset,
Distribution, File Sets, and Attributes for missing required values.

### Do I need both a Distribution item and a File Set?

No. At least one of them is required. Use Distribution for individual files or
archives. Use File Sets for repeated files matched by a pattern.

### Which checksum should be used?

Use SHA-256 when possible. MD5 is supported for compatibility, but SHA-256 is
preferred. For uploaded datasets, generated checksums must match the uploaded
bytes.

### What should go in Data Type(s)?

Use the most specific type that describes the field values. Common tabular
values use `sc:Text`, `sc:Integer`, `sc:Float`, `sc:Boolean`, `sc:Date`,
`sc:DateTime`, or `sc:URL`. ML-specific values can use terms such as
`cr:Label` or `cr:BoundingBox`.

### What if a field does not map cleanly to Croissant?

Use the closest Croissant or schema.org field where possible. OpenML-specific
handoff hints are serialized under the `openml:` JSON-LD namespace when they do
not map cleanly to core Croissant terms.

### Where should detailed standard questions be answered?

Use the official Croissant documentation and specification for exact vocabulary
semantics, cardinality, and examples:

- [Croissant documentation](https://docs.mlcommons.org/croissant/)
- [Croissant 1.1 format specification](https://docs.mlcommons.org/croissant/docs/croissant-spec-1.1.html)

## Implementation References

| Area                              | File                                                 |
| --------------------------------- | ---------------------------------------------------- |
| Page component                    | `frontend/src/pages/CroissantMetadataPage.tsx`       |
| Field definitions and helper text | `frontend/src/constants/croissantFields.ts`          |
| Field input component             | `frontend/src/components/CroissantFieldInput.tsx`    |
| Serialization                     | `frontend/src/utils/serializeCroissant.ts`           |
| Deserialization                   | `frontend/src/utils/deserializeCroissant.ts`         |
| Generated metadata merge          | `frontend/src/utils/croissantGeneratedMetadata.ts`   |
| Unit tests                        | `frontend/tests/unit/CroissantMetadataPage.test.tsx` |

---

**Related:** [Dataset Detail Page](./dataset-detail-page.md) | [Frontend Routing](./routing.md)

[← Back to documentation index](../index.md)
