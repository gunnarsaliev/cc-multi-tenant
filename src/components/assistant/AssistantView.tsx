import type { AdminViewServerProps } from 'payload'

import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import React from 'react'

import { AssistantChat } from './AssistantChat'

/** The assistant needs the agent service, which only runs when EVE_ENABLED is set. */
export const AssistantView: React.FC<AdminViewServerProps> = ({
  initPageResult,
  params,
  searchParams,
}) => {
  const { locale, permissions, req, visibleEntities } = initPageResult

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <h1>Assistant</h1>
        {process.env.EVE_ENABLED === 'true' ? (
          <AssistantChat />
        ) : (
          <p>The assistant isn’t enabled yet. Set EVE_ENABLED=true once AI keys are configured.</p>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
