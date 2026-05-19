# Croissant Metadata Page: How It Works

This document explains the architecture and logic of the Croissant Metadata Page.

---

## 1. What is the Croissant Metadata Page?

The Croissant Metadata Page is a form that collects metadata about machine learning datasets. Croissant is a standard that describes datasets so that tools can understand how to download them, read their files, and parse their columns.

Because datasets can be complex (having multiple downloadable files, various tables, and dozens of columns), a standard "flat" form is not enough. This page is built to handle highly nested and repeatable structures, with a guided user experience.

---

## 2. The Five Main Sections

The page divides the dataset metadata into five core tabs:

1. **Dataset**: Core project information like name, description, and license.
2. **Distribution**: Individual files or archives, represented as Croissant `FileObject` resources.
3. **File Sets**: Groupings of similar files matching a path pattern, represented as Croissant `FileSet` resources.
4. **Attributes**: Record sets and fields. This captures table-like structures, columns, data types, and OpenML handoff hints such as target attributes.
5. **Responsible AI**: Data collection, intended use, limitations, biases, sensitive information, annotation, and preprocessing notes.

---

## 3. Generated Metadata

Some metadata is generated from the upload record instead of being typed manually:

- JSON-LD scaffolding: `@context`, `@type`, and `dct:conformsTo`.
- Dataset name, description, creation/publication date, and internal dataset URL.
- Private upload contact metadata is not copied into public Croissant author fields.
- File names, content types, byte sizes, and SHA-256 checksums when available.
- `FileObject` entries from stored upload object metadata.
- `FileSet` entries from folder or ZIP package metadata.

## 4. Save Behavior

When the user clicks **Save Metadata**, the page serializes the form state into Croissant JSON-LD.
`FileObject` and `FileSet` resources are emitted together under `distribution`, while record sets contain nested field definitions.
OpenML-specific handoff fields that do not map cleanly to Croissant are stored as `openml:` JSON-LD terms.
