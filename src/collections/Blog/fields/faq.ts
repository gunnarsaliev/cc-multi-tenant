import type { Field } from 'payload'

/**
 * Questions and answers shown with the post.
 *
 * The whole list is localized, so each language has its own questions, in its own number and
 * order. The Translate button fills the list for another language, and each item is indexed for
 * search with its question as the heading.
 */
export const faqField: Field = {
  name: 'faq',
  type: 'array',
  admin: {
    components: {
      RowLabel: '@/collections/Blog/components/FAQRowLabel#FAQRowLabel',
    },
    initCollapsed: true,
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
    },
    {
      name: 'answer',
      type: 'richText',
      required: true,
    },
  ],
  label: 'FAQ',
  labels: {
    plural: 'Questions',
    singular: 'Question',
  },
  localized: true,
}
