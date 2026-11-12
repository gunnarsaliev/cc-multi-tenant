import type { CollectionConfig, Field } from 'payload'

import { getAppUser } from '@/access/getAppUser'
import {
  superAdminOrTenantAdminAccess,
  superAdminOrTenantAdminCreateAccess,
} from '@/collections/Pages/access/superAdminOrTenantAdmin'
import { DEFAULT_TEXTS, EDITABLE_TEXTS } from '@/consent/defaults'

const LABELS: Record<(typeof EDITABLE_TEXTS)[number], string> = {
  acceptAllLabel: '"Accept all" button',
  analyticsDescription: 'Statistics description',
  description: 'Banner text',
  manageLabel: '"Manage preferences" button',
  marketingDescription: 'Marketing description',
  necessaryDescription: 'Necessary cookies description',
  preferencesDescription: 'Preferences description',
  preferencesTitle: 'Preferences window title',
  rejectAllLabel: '"Reject all" button',
  saveLabel: '"Save" button',
  title: 'Banner title',
}

const textFields = EDITABLE_TEXTS.map((name): Field => {
  const shared = {
    name,
    admin: { placeholder: DEFAULT_TEXTS.en[name] },
    label: LABELS[name],
    localized: true,
  }

  return name.endsWith('escription') ? { ...shared, type: 'textarea' } : { ...shared, type: 'text' }
})

/**
 * One cookie banner per tenant (the multi-tenant plugin treats this collection as a global).
 * Visitors get these through /api/consent/config, never by reading the collection.
 */
export const ConsentSettings: CollectionConfig = {
  slug: 'consent-settings',
  access: {
    create: superAdminOrTenantAdminCreateAccess,
    delete: superAdminOrTenantAdminAccess,
    read: ({ req }) => Boolean(getAppUser(req.user)),
    update: superAdminOrTenantAdminAccess,
  },
  admin: {
    description: 'Leave a text empty to use the standard wording for that language.',
    group: 'Cookie consent',
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'preferencesEnabled',
          type: 'checkbox',
          defaultValue: true,
          label: 'Ask about preference cookies',
        },
        {
          name: 'analyticsEnabled',
          type: 'checkbox',
          defaultValue: true,
          label: 'Ask about statistics cookies',
        },
        {
          name: 'marketingEnabled',
          type: 'checkbox',
          defaultValue: true,
          label: 'Ask about marketing cookies',
        },
      ],
    },
    {
      name: 'privacyPolicyUrl',
      type: 'text',
      label: 'Privacy policy link',
    },
    {
      name: 'revision',
      type: 'number',
      admin: {
        description: 'Raise this number to show the banner again to everyone who already answered.',
        position: 'sidebar',
      },
      defaultValue: 0,
      min: 0,
    },
    ...textFields,
  ],
  labels: { plural: 'Banner settings', singular: 'Banner settings' },
}
