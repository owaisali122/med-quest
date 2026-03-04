import type { CollectionConfig } from 'payload'

export const FormSubmissions: CollectionConfig = {
  slug: 'form-submissions',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['id', 'form', 'status', 'updatedAt'],
    group: 'Form Management',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'form',
      type: 'relationship',
      relationTo: 'forms',
      required: true,
    },
    {
      name: 'data',
      type: 'json',
      required: true,
      defaultValue: {},
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Submitted', value: 'submitted' },
      ],
    },
    {
      name: 'email',
      type: 'text',
      admin: {
        description: 'Optional; used to resume drafts by form + email.',
      },
    },
  ],
}
