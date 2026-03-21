import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const supportedLocales = ['fr', 'en', 'es', 'de']

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useParams<{ locale: string }>()
  const { i18n } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!locale || !supportedLocales.includes(locale)) {
      navigate('/fr', { replace: true })
      return
    }
    if (i18n.language !== locale) {
      i18n.changeLanguage(locale)
    }
  }, [locale, i18n, navigate])

  if (!locale || !supportedLocales.includes(locale)) return null

  return <>{children}</>
}
