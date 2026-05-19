import { describe, expect, it } from 'vitest';
import { serializeCroissant, type CroissantFormData } from '@/utils/serializeCroissant';
import { deserializeCroissant } from '@/utils/deserializeCroissant';

describe('serializeCroissant', () => {
  it('serializes file sets into Croissant distribution resources', () => {
    const formData: CroissantFormData = {
      dataset: {
        name: 'images',
        description: 'Image dataset',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        url: 'https://example.test/datasets/images',
        creator: ['Ada Lovelace'],
        datePublished: '2026-05-01',
      },
      distribution: [],
      fileSet: [
        {
          _generated: true,
          'fileSet.@id': 'image-files',
          'fileSet.name': 'image-files',
          'fileSet.encodingFormat': 'image/jpeg',
          'fileSet.includes': 'images/**/*',
          'fileSet.containedIn': 'images.zip',
        },
      ],
      recordSet: [],
      rai: {},
    };

    const json = serializeCroissant(formData);

    expect(json.distribution).toEqual([
      {
        '@type': 'cr:FileSet',
        '@id': 'image-files',
        name: 'image-files',
        encodingFormat: 'image/jpeg',
        includes: 'images/**/*',
        containedIn: { '@id': 'images.zip' },
      },
    ]);
    expect(JSON.stringify(json)).not.toContain('_generated');
    expect(json).not.toHaveProperty('fileSet');
  });

  it('serializes OpenML attributes as Croissant record set fields', () => {
    const formData: CroissantFormData = {
      dataset: {
        name: 'tabular',
        description: 'Tabular dataset',
        license: 'https://creativecommons.org/licenses/by/4.0/',
        url: 'https://example.test/datasets/tabular',
        creator: ['Ada Lovelace'],
        datePublished: '2026-05-01',
      },
      distribution: [],
      fileSet: [],
      recordSet: [
        {
          'recordSet.name': 'rows',
          field: [
            {
              'field.@id': 'rows/class',
              'field.name': 'class',
              'field.dataType': ['sc:Text', 'cr:Label'],
              'field.description': 'Target class',
              'field.source.fileObject': 'train.csv',
              'field.source.extract.column': 'class',
              'field.references': 'labels/name',
            },
          ],
        },
      ],
      rai: {},
    };

    const json = serializeCroissant(formData);

    expect(json.recordSet).toEqual([
      {
        '@type': 'cr:RecordSet',
        name: 'rows',
        field: [
          {
            '@type': 'cr:Field',
            '@id': 'rows/class',
            name: 'class',
            dataType: ['sc:Text', 'cr:Label'],
            description: 'Target class',
            source: {
              fileObject: { '@id': 'train.csv' },
              extract: {
                column: 'class',
              },
            },
            references: { '@id': 'labels/name' },
          },
        ],
      },
    ]);
  });

  it('deserializes Croissant FileSet resources from distribution into file sets', () => {
    const formData = deserializeCroissant({
      '@context': {},
      '@type': 'sc:Dataset',
      name: 'images',
      distribution: [
        {
          '@type': 'cr:FileObject',
          '@id': 'archive.zip',
          name: 'archive.zip',
          contentUrl: 'https://example.test/archive.zip',
        },
        {
          '@type': 'cr:FileSet',
          '@id': 'image-files',
          name: 'image-files',
          includes: 'images/**/*',
          containedIn: { '@id': 'archive.zip' },
        },
      ],
    });

    expect(formData.distribution).toEqual([
      expect.objectContaining({
        'distribution.@id': 'archive.zip',
        'distribution.name': 'archive.zip',
        'distribution.contentUrl': 'https://example.test/archive.zip',
      }),
    ]);
    expect(formData.fileSet).toEqual([
      expect.objectContaining({
        'fileSet.@id': 'image-files',
        'fileSet.name': 'image-files',
        'fileSet.includes': 'images/**/*',
        'fileSet.containedIn': 'archive.zip',
      }),
    ]);
  });

  it('deserializes nested record set fields into editable field form data', () => {
    const formData = deserializeCroissant({
      '@context': {},
      '@type': 'sc:Dataset',
      name: 'tabular',
      recordSet: [
        {
          '@type': 'cr:RecordSet',
          '@id': 'rows',
          name: 'rows',
          field: [
            {
              '@type': 'cr:Field',
              '@id': 'rows/class',
              name: 'class',
              dataType: ['sc:Text', 'cr:Label'],
              source: {
                fileObject: { '@id': 'train.csv' },
                extract: { column: 'class' },
              },
              references: { '@id': 'labels/name' },
            },
          ],
        },
      ],
    });

    expect(formData.recordSet).toEqual([
      expect.objectContaining({
        'recordSet.@id': 'rows',
        'recordSet.name': 'rows',
        field: [
          expect.objectContaining({
            'field.@id': 'rows/class',
            'field.name': 'class',
            'field.dataType': ['sc:Text', 'cr:Label'],
            'field.source.fileObject': 'train.csv',
            'field.source.extract.column': 'class',
            'field.references': 'labels/name',
          }),
        ],
      }),
    ]);
  });
});
