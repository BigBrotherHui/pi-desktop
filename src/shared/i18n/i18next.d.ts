import type en from '../../../resources/locales/en/translation.json'

// Typed keys: t('unknown.key') and a plural key without `count` fail
// `npm run typecheck`. English is the source, so its shape is the type.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
