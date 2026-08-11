import { createI18n } from 'vue-i18n'
import de from './locales/de'
import en from './locales/en'
import es from './locales/es'
import fr from './locales/fr'
import it from './locales/it'
import ptBR from './locales/ptBR'
import ru from './locales/ru'
import zh from './locales/zh'

export const LANGUAGE_STORAGE_KEY = 'super-pomodoro-language'
export const supportedLocales = ['pt-BR', 'en', 'de', 'fr', 'it', 'es', 'ru', 'zh'] as const
export type SupportedLocale = (typeof supportedLocales)[number]

const messages = {
  'pt-BR': ptBR,
  en,
  de,
  fr,
  it,
  es,
  ru,
  zh,
}

function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  if (!locale) {
    return 'pt-BR'
  }

  const normalized = locale.toLowerCase()

  if (normalized.startsWith('pt-br')) {
    return 'pt-BR'
  }

  const languageCode = normalized.split('-')[0] as SupportedLocale

  if (supportedLocales.includes(languageCode)) {
    return languageCode
  }

  return 'en'
}

export function getInitialLocale(): SupportedLocale {
  const storedLocale = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)

  if (storedLocale) {
    return normalizeLocale(storedLocale)
  }

  return normalizeLocale(navigator.language)
}

const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: 'en',
  messages,
})

export function setAppLocale(nextLocale: string) {
  const normalizedLocale = normalizeLocale(nextLocale)
  i18n.global.locale.value = normalizedLocale
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLocale)
}

export default i18n
