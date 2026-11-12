import type { Access, CollectionConfig } from 'payload'

import { isSuperAdmin } from '@/access/isSuperAdmin'
import { getUserTenantIDs } from '@/utilities/getUserTenantIDs'

const readAccess: Access = ({ req }) => {
  if (isSuperAdmin(req.user)) {
    return true
  }

  const tenantIDs = getUserTenantIDs(req.user, 'tenant-admin')

  return tenantIDs.length > 0 ? { tenant: { in: tenantIDs } } : false
}

/**
 * The record of what each visitor agreed to. Rows are only written by /api/consent/log and are
 * never changed afterwards. No IP address is kept: the consent ID in the visitor's cookie is the
 * link between a person and their row.
 */
export const ConsentLogs: CollectionConfig = {
  slug: 'consent-logs',
  access: {
    create: () => false,
    delete: () => false,
    read: readAccess,
    update: () => false,
  },
  admin: {
    defaultColumns: ['consentId', 'preferences', 'analytics', 'marketing', 'url', 'createdAt'],
    group: 'Cookie consent',
    useAsTitle: 'consentId',
  },
  fields: [
    { name: 'consentId', type: 'text', index: true, required: true },
    { name: 'preferences', type: 'checkbox', defaultValue: false, required: true },
    { name: 'analytics', type: 'checkbox', defaultValue: false, label: 'Statistics', required: true },
    { name: 'marketing', type: 'checkbox', defaultValue: false, required: true },
    {
      name: 'revision',
      type: 'number',
      admin: { description: 'The banner settings revision the visitor answered.' },
    },
    { name: 'url', type: 'text', label: 'Page' },
  ],
  labels: { plural: 'Consent log', singular: 'Consent record' },
}
