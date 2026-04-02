# Croissant Metadata Page: How It Works

This document explains the architecture and logic of the Croissant Metadata Page.

---

## 1. What is the Croissant Metadata Page?
The Croissant Metadata Page is a form that collects metadata about machine learning datasets. Croissant is a standard that describes datasets so that tools can understand how to download them, read their files, and parse their columns.

Because datasets can be complex (having multiple downloadable files, various tables, and dozens of columns), a standard "flat" form is not enough. This page is built to handle highly nested and repeatable structures, with a guided user experience.

---

## 2. The Five Main Sections
The page divides the dataset metadata into five core tabs (visible on the left side of the screen):

1. **Dataset**: Core project information like name, description, and license.
2. **Distribution**: Individual files or archives (e.g., `images.zip`, `data.csv`).

These are yet to be implemented:
3. **File Sets**: Groupings of similar files matching a specific pattern (e.g., a folder full of thousands of `*.png` images).
4. **Record Sets**: The logical grouping of data. Think of a Record Set as a specific "Table" of data or a "Schema".
5. **RAI**: Responsible AI metadata (e.g., ethical considerations, personal data warnings).

---

When the user click **"Save Metadata"**, the `handleSubmit` function takes the UI state and produces standard Croissant JSON which is just a JSON-LD.
