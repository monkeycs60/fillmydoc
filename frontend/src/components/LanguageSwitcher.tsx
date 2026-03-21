import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

const languages = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'de', label: 'DE' }
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const { locale } = useParams<{ locale: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const handleChange = (newLocale: string) => {
    // Replace the locale segment in the current path
    const pathWithoutLocale = location.pathname.replace(/^\/(fr|en|es|de)/, '')
    navigate(`/${newLocale}${pathWithoutLocale || ''}`)
  }

  const currentLocale = locale || i18n.language.slice(0, 2)

  return (
    <div className="flex gap-1">
      {languages.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => handleChange(code)}
          className={`font-mono text-xs px-2 py-1 rounded-md transition-colors ${
            currentLocale === code
              ? 'bg-gray-900 text-white'
              : 'text-gray-300 hover:text-gray-500'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
