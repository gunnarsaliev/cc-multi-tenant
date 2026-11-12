export type ConsentTexts = {
  acceptAllLabel: string
  analyticsDescription: string
  analyticsLabel: string
  description: string
  manageLabel: string
  marketingDescription: string
  marketingLabel: string
  necessaryDescription: string
  necessaryLabel: string
  preferencesDescription: string
  preferencesLabel: string
  preferencesTitle: string
  rejectAllLabel: string
  saveLabel: string
  title: string
}

/**
 * The texts an editor can override in the admin. Category names are fixed, and follow the four
 * categories Cookiebot uses: necessary, preferences, statistics (`analytics` here) and marketing.
 */
export const EDITABLE_TEXTS = [
  'title',
  'description',
  'acceptAllLabel',
  'rejectAllLabel',
  'manageLabel',
  'preferencesTitle',
  'saveLabel',
  'necessaryDescription',
  'preferencesDescription',
  'analyticsDescription',
  'marketingDescription',
] as const satisfies readonly (keyof ConsentTexts)[]

/** Used for anything a tenant has left blank, so a banner works before anyone edits it. */
export const DEFAULT_TEXTS: Record<string, ConsentTexts> = {
  bg: {
    acceptAllLabel: 'Приемам всички',
    analyticsDescription:
      'Помагат ни да разберем как се използва сайтът, за да го подобряваме.',
    analyticsLabel: 'Статистика',
    description:
      'Използваме бисквитки, за да работи сайтът и, с ваше съгласие, за предпочитания, статистика и маркетинг.',
    manageLabel: 'Настройки',
    marketingDescription: 'Използват се за показване на реклами, съобразени с вашите интереси.',
    marketingLabel: 'Маркетинг',
    necessaryDescription: 'Нужни са, за да работи сайтът, и не могат да бъдат изключени.',
    necessaryLabel: 'Необходими',
    preferencesDescription:
      'Запомнят направен от вас избор, например език или регион, за да не го задавате отново.',
    preferencesLabel: 'Предпочитания',
    preferencesTitle: 'Настройки на бисквитките',
    rejectAllLabel: 'Отказвам всички',
    saveLabel: 'Запази избора',
    title: 'Използваме бисквитки',
  },
  en: {
    acceptAllLabel: 'Accept all',
    analyticsDescription: 'Help us understand how the site is used so we can improve it.',
    analyticsLabel: 'Statistics',
    description:
      'We use cookies to make the site work and, with your consent, for preferences, statistics and marketing.',
    manageLabel: 'Manage preferences',
    marketingDescription: 'Used to show ads that match your interests.',
    marketingLabel: 'Marketing',
    necessaryDescription: 'Needed for the site to work. They cannot be switched off.',
    necessaryLabel: 'Necessary',
    preferencesDescription:
      'Remember choices you make, such as language or region, so you do not have to set them again.',
    preferencesLabel: 'Preferences',
    preferencesTitle: 'Cookie preferences',
    rejectAllLabel: 'Reject all',
    saveLabel: 'Save my choices',
    title: 'We use cookies',
  },
}
