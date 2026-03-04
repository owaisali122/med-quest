import type { CollectionConfig } from 'payload'

export const Forms: CollectionConfig = {
  slug: 'forms',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'updatedAt'],
    group: 'Form Management',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'URL-safe identifier used by the API (e.g. benefits-application).',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Internal reference only.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
    {
      name: 'schema',
      type: 'json',
      required: true,
      defaultValue: { display: 'form', components: [] },
      admin: {
        description: 'Form.io schema — use the Form Builder below to edit.',
        components: {
          Field: '/components/admin/FormBuilderField',
        },
      },
    },
    {
      name: 'settings',
      type: 'group',
      fields: [
        {
          name: 'submitButtonText',
          type: 'text',
          defaultValue: 'Submit',
        },
        {
          name: 'successMessage',
          type: 'textarea',
        },
        {
          name: 'allowMultipleSubmissions',
          type: 'checkbox',
          defaultValue: true,
        },
      ],
    },
  ],
}
