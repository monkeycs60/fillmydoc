import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import './i18n'
import App from './App'
import { LandingPage } from './pages/LandingPage'
import { SigningPage } from './pages/SigningPage'
import { SigningDashboard } from './pages/SigningDashboard'
import { HistoryDashboard } from './pages/HistoryDashboard'
import { WebhooksPage } from './pages/WebhooksPage'
import { BrandingSettings } from './pages/BrandingSettings'
import { LocaleProvider } from './components/LocaleProvider'

const supportedLocales = ['fr', 'en', 'es', 'de']

function detectLocale(): string {
  const browserLang = navigator.language.slice(0, 2)
  return supportedLocales.includes(browserLang) ? browserLang : 'fr'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={`/${detectLocale()}`} replace />} />
        <Route path="/:locale" element={<LocaleProvider><LandingPage /></LocaleProvider>} />
        <Route path="/:locale/app" element={<LocaleProvider><App /></LocaleProvider>} />
        <Route path="/:locale/sign/:token" element={<LocaleProvider><SigningPage /></LocaleProvider>} />
        <Route path="/:locale/signing/:jobId" element={<LocaleProvider><SigningDashboard /></LocaleProvider>} />
        <Route path="/:locale/history" element={<LocaleProvider><HistoryDashboard /></LocaleProvider>} />
        <Route path="/:locale/webhooks" element={<LocaleProvider><WebhooksPage /></LocaleProvider>} />
        <Route path="/:locale/settings/branding" element={<LocaleProvider><BrandingSettings /></LocaleProvider>} />
        <Route path="*" element={<Navigate to={`/${detectLocale()}`} replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
