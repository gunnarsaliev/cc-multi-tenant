import type { MCPAccessSettings, MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { CollectionConfig, Field } from 'payload'

type MCPCollections = NonNullable<MCPPluginConfig['collections']>

const OPERATIONS = ['find', 'create', 'update', 'delete'] as const

/** The plugin stores each collection's permissions in a group named after the camel-cased slug. */
const toCamelCase = (value: string) =>
  value
    .replace(/[-_\s]+(.)?/g, (_, chr: string | undefined) => (chr ? chr.toUpperCase() : ''))
    .replace(/^(.)/, (_, chr: string) => chr.toLowerCase())

/** The operations the plugin config enables for a collection, i.e. the ones a key could tick. */
const enabledOperations = (entry: MCPCollections[keyof MCPCollections]) => {
  const enabled = entry?.enabled
  if (enabled === true) {
    return [...OPERATIONS]
  }
  if (!enabled) {
    return []
  }
  return OPERATIONS.filter((operation) => enabled[operation] === true)
}

/**
 * Ticking "All collections" on a key grants every operation the plugin exposes, on every
 * collection, including collections added to the plugin later. It is resolved when the key is
 * used rather than written into the key's checkboxes, so unticking it restores the key's own choices.
 */
export const expandAllCollections = (
  settings: MCPAccessSettings,
  collections: MCPCollections,
): MCPAccessSettings => {
  if (!settings.allCollections) {
    return settings
  }

  const expanded: MCPAccessSettings = { ...settings }
  for (const [slug, entry] of Object.entries(collections)) {
    expanded[toCamelCase(slug)] = Object.fromEntries(
      enabledOperations(entry).map((operation) => [operation, true]),
    )
  }
  return expanded
}

/** Adds the "All collections" checkbox and hides the per-collection checkboxes while it is ticked. */
export const withAllCollectionsField =
  (collections: MCPCollections) =>
  (collection: CollectionConfig): CollectionConfig => {
    const groupNames = new Set(Object.keys(collections).map(toCamelCase))

    const isCollectionPermissions = (field: Field) =>
      field.type === 'collapsible' &&
      field.fields.length === 1 &&
      'name' in field.fields[0] &&
      groupNames.has(field.fields[0].name)

    const allCollectionsField: Field = {
      name: 'allCollections',
      type: 'checkbox',
      admin: {
        description:
          'Allow every operation on every collection available to MCP, including collections added later.',
        position: 'sidebar',
      },
      defaultValue: false,
      label: 'All collections',
    }

    const fields: Field[] = []
    let inserted = false
    for (const field of collection.fields) {
      if (isCollectionPermissions(field)) {
        if (!inserted) {
          fields.push(allCollectionsField)
          inserted = true
        }
        fields.push({
          ...field,
          admin: {
            ...field.admin,
            condition: (data) => !data?.allCollections,
          },
        } as Field)
        continue
      }
      fields.push(field)
    }
    if (!inserted) {
      fields.push(allCollectionsField)
    }

    return { ...collection, fields }
  }
