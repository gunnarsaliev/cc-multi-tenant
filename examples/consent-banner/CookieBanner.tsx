'use client'

/**
 * Cookie banner for a tenant site. Copy this file into the site, then:
 *
 *   pnpm add vanilla-cookieconsent
 *
 *   // app/layout.tsx
 *   <CookieBanner apiUrl={process.env.NEXT_PUBLIC_CMS_URL!} tenant="hubavajena" locale="bg" />
 *
 * `tenant` is the tenant's slug in the CMS. The CMS only accepts consent records from the
 * tenant's `domain`, so that field must match this site's address (localhost works in development).
 */
import { useEffect } from 'react'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'

type ConsentConfig = {
  categories: { analytics: boolean; marketing: boolean; preferences: boolean }
  locale: string
  privacyPolicyUrl: null | string
  revision: number
  tenant: string
  texts: Record<
    | 'acceptAllLabel'
    | 'analyticsDescription'
    | 'analyticsLabel'
    | 'description'
    | 'manageLabel'
    | 'marketingDescription'
    | 'marketingLabel'
    | 'necessaryDescription'
    | 'necessaryLabel'
    | 'preferencesDescription'
    | 'preferencesLabel'
    | 'preferencesTitle'
    | 'rejectAllLabel'
    | 'saveLabel'
    | 'title',
    string
  >
}

type Props = {
  /** The CMS address, for example https://cms.example.com */
  apiUrl: string
  locale?: string
  /** Shown as the privacy policy link text. */
  privacyLinkLabel?: string
  tenant: string
}

// The library renders its texts as HTML, so anything coming from the CMS is escaped first.
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '"': '&quot;', '&': '&amp;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[char]!,
  )

export function CookieBanner({ apiUrl, locale = 'en', privacyLinkLabel = 'Privacy policy', tenant }: Props) {
  useEffect(() => {
    let cancelled = false

    const log = (cookie: CookieConsent.CookieValue) => {
      void fetch(`${apiUrl}/api/consent/log`, {
        body: JSON.stringify({
          analytics: cookie.categories.includes('analytics'),
          consentId: cookie.consentId,
          marketing: cookie.categories.includes('marketing'),
          preferences: cookie.categories.includes('preferences'),
          revision: cookie.revision,
          tenant,
          url: window.location.href,
        }),
        headers: { 'Content-Type': 'application/json' },
        // Lets the request finish if the visitor navigates away straight after answering.
        keepalive: true,
        method: 'POST',
      }).catch(() => undefined)
    }

    const start = async () => {
      const response = await fetch(
        `${apiUrl}/api/consent/config?${new URLSearchParams({ locale, tenant })}`,
      )

      // Without settings there is no banner, and so no consent: optional cookies stay off.
      if (!response.ok || cancelled) {
        return
      }

      const config: ConsentConfig = await response.json()
      const texts = Object.fromEntries(
        Object.entries(config.texts).map(([key, value]) => [key, escape(value)]),
      ) as ConsentConfig['texts']

      const optional = (['preferences', 'analytics', 'marketing'] as const).filter((name) => config.categories[name])

      await CookieConsent.run({
        categories: {
          necessary: { enabled: true, readOnly: true },
          ...Object.fromEntries(optional.map((name) => [name, {}])),
        },
        guiOptions: { consentModal: { equalWeightButtons: true } },
        language: {
          default: config.locale,
          translations: {
            [config.locale]: {
              consentModal: {
                acceptAllBtn: texts.acceptAllLabel,
                acceptNecessaryBtn: texts.rejectAllLabel,
                description: texts.description,
                footer: config.privacyPolicyUrl
                  ? `<a href="${escape(config.privacyPolicyUrl)}">${escape(privacyLinkLabel)}</a>`
                  : undefined,
                showPreferencesBtn: texts.manageLabel,
                title: texts.title,
              },
              preferencesModal: {
                acceptAllBtn: texts.acceptAllLabel,
                acceptNecessaryBtn: texts.rejectAllLabel,
                savePreferencesBtn: texts.saveLabel,
                sections: [
                  {
                    description: texts.necessaryDescription,
                    linkedCategory: 'necessary',
                    title: texts.necessaryLabel,
                  },
                  ...optional.map((name) => ({
                    description: texts[`${name}Description`],
                    linkedCategory: name,
                    title: texts[`${name}Label`],
                  })),
                ],
                title: texts.preferencesTitle,
              },
            },
          },
        },
        // The first answer, and every later change, is one row in the CMS consent log.
        onChange: ({ cookie }) => log(cookie),
        onFirstConsent: ({ cookie }) => log(cookie),
        // Raising the revision in the CMS shows the banner again to everyone.
        revision: config.revision,
      })
    }

    void start().catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [apiUrl, locale, privacyLinkLabel, tenant])

  return null
}

/**
 * Elsewhere in the site:
 *
 *   CookieConsent.acceptedCategory('analytics')   // has the visitor agreed?
 *   CookieConsent.showPreferences()               // "Cookie settings" link in the footer
 *
 * Scripts can also wait for consent on their own:
 *   <script type="text/plain" data-category="analytics" src="..."></script>
 */
