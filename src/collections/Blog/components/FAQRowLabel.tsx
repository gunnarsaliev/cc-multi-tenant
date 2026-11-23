'use client'

import { useRowLabel } from '@payloadcms/ui'
import React from 'react'

/** Labels each FAQ row with its question, so a collapsed list is easy to scan. */
export const FAQRowLabel: React.FC = () => {
  const { data, rowNumber } = useRowLabel<{ question?: string }>()

  return <span>{data?.question?.trim() || `Question ${(rowNumber ?? 0) + 1}`}</span>
}
