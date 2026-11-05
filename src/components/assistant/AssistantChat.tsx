'use client'

import { Button } from '@payloadcms/ui'
import { openInteractions } from 'eve/events'
import { useEveAgent } from 'eve/react'
import React, { useState } from 'react'

/** A minimal chat. Approvals have to be shown, or a turn waiting on one could never continue. */
export const AssistantChat: React.FC = () => {
  const agent = useEveAgent()
  const [draft, setDraft] = useState('')
  const isBusy = agent.status === 'resuming'
  const pending = openInteractions(agent.view, { kind: 'approval' })

  return (
    <div style={{ display: 'grid', gap: '1rem', maxWidth: '48rem' }}>
      {agent.messages.map((message) => (
        <article key={message.id}>
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          {message.parts.map((part, index) =>
            part.type === 'text' ? (
              <p key={part.id ?? index} style={{ whiteSpace: 'pre-wrap' }}>
                {part.text}
              </p>
            ) : null,
          )}
        </article>
      ))}

      {pending.map(({ interactionId }) => (
        <div key={interactionId} style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
          <span>The assistant wants to save a translated draft.</span>
          <Button
            margin={false}
            onClick={() => void agent.respond([{ interactionId, optionId: 'approve' }])}
            size="small"
          >
            Approve
          </Button>
          <Button
            buttonStyle="secondary"
            margin={false}
            onClick={() => void agent.respond([{ interactionId, optionId: 'deny' }])}
            size="small"
          >
            Deny
          </Button>
        </div>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault()

          if (draft.trim() && !isBusy) {
            void agent.send(draft.trim())
            setDraft('')
          }
        }}
        style={{ display: 'flex', gap: '0.5rem' }}
      >
        <input
          aria-label="Message"
          disabled={isBusy}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about your content…"
          style={{ flex: 1, padding: '0.5rem' }}
          value={draft}
        />
        <Button disabled={isBusy} margin={false} type="submit">
          Send
        </Button>
      </form>
    </div>
  )
}
