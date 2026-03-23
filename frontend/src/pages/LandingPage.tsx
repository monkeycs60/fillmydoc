import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

export function LandingPage() {
  const { t } = useTranslation()
  const { locale } = useParams<{ locale: string }>()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white">
      <div className="border-t-2 border-blue-600" />

      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <span className="font-mono text-xl font-bold text-gray-900">FillMyDoc</span>
        <div className="flex items-center gap-8">
          <Link to={`/${locale}/history`} className="text-sm text-gray-500 hover:text-gray-900">{t('landing.nav_history')}</Link>
          <a href="#pricing" className="text-sm text-gray-500 hover:text-gray-900">{t('landing.nav_pricing')}</a>
          <a href="#faq" className="text-sm text-gray-500 hover:text-gray-900">{t('landing.nav_faq')}</a>
          <LanguageSwitcher />
          <Link
            to={`/${locale}/app`}
            className="text-sm font-medium bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            {t('landing.nav_cta')}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight tracking-tight">
              {t('landing.hero_headline')}
            </h1>
            <p className="mt-6 text-lg text-gray-500 leading-relaxed">
              {t('landing.hero_sub')}
            </p>
            <div className="mt-10 flex gap-4">
              <Link
                to={`/${locale}/app`}
                className="bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors"
              >
                {t('landing.hero_cta')}
              </Link>
              <a
                href="#steps"
                className="border border-gray-300 text-gray-700 px-6 py-3 rounded-md font-medium hover:bg-gray-50 transition-colors"
              >
                {t('landing.hero_secondary')}
              </a>
            </div>
          </div>
          {/* App mockup */}
          <div className="border border-gray-200 rounded-md p-6 bg-gray-50/50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="ml-2 text-xs text-gray-400 font-mono">fillmydoc.com/app</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 border-b border-gray-100 py-2.5">
                <span className="font-mono text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded">{t('landing.mockup_var1')}</span>
                <span className="text-gray-300">&rarr;</span>
                <span className="text-sm text-gray-600 border-b border-gray-200 pb-0.5 px-1">{t('landing.mockup_col1')}</span>
              </div>
              <div className="flex items-center gap-3 border-b border-gray-100 py-2.5">
                <span className="font-mono text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded">{t('landing.mockup_var2')}</span>
                <span className="text-gray-300">&rarr;</span>
                <span className="text-sm text-gray-600 border-b border-gray-200 pb-0.5 px-1">{t('landing.mockup_col2')}</span>
              </div>
              <div className="flex items-center gap-3 border-b border-gray-100 py-2.5">
                <span className="font-mono text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded">{t('landing.mockup_var3')}</span>
                <span className="text-gray-300">&rarr;</span>
                <span className="text-sm text-gray-600 border-b border-gray-200 pb-0.5 px-1">{t('landing.mockup_col3')}</span>
              </div>
              <div className="pt-3">
                <div className="bg-gray-900 text-white text-sm text-center py-2.5 rounded-md font-medium">
                  {t('landing.mockup_button')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <div className="border-y border-gray-100 py-4">
        <p className="text-center text-xs text-gray-400 tracking-wide uppercase">
          {t('landing.social_proof')}
        </p>
      </div>

      {/* Steps */}
      <section id="steps" className="max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-12">
          {t('landing.steps_title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`py-6 ${n < 3 ? 'md:border-r md:border-gray-100 md:pr-8' : ''} ${n > 1 ? 'md:pl-8' : ''}`}>
              <h3 className="font-mono text-lg font-bold text-gray-900 mb-2">
                {t(`landing.step${n}_title`)}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {t(`landing.step${n}_desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="bg-gray-50/50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-12">
            {t('landing.usecases_title')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white p-8">
                <h3 className="font-medium text-gray-900 mb-1">
                  {t(`landing.usecase${n}_title`)}
                </h3>
                <p className="text-sm text-gray-500">
                  {t(`landing.usecase${n}_desc`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-12">
          {t('landing.pricing_title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl">
          {/* Free */}
          <div className="border border-gray-200 rounded-md p-8">
            <h3 className="font-medium text-gray-900">{t('landing.pricing_free_name')}</h3>
            <div className="mt-2 mb-6">
              <span className="text-3xl font-bold text-gray-900">{t('landing.pricing_free_price')}</span>
              <span className="text-sm text-gray-400">{t('landing.pricing_free_period')}</span>
            </div>
            <ul className="space-y-3 text-sm text-gray-600 mb-8">
              {[1, 2, 3, 4].map(n => (
                <li key={n} className="flex items-center gap-2">
                  <span className="text-gray-400">&mdash;</span>
                  {t(`landing.pricing_free_f${n}`)}
                </li>
              ))}
            </ul>
            <Link
              to={`/${locale}/app`}
              className="block text-center border border-gray-300 text-gray-700 py-2.5 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {t('landing.pricing_free_cta')}
            </Link>
          </div>
          {/* Pro */}
          <div className="border-2 border-blue-600 rounded-md p-8 relative">
            <div className="absolute -top-3 left-6 bg-blue-600 text-white text-xs font-medium px-3 py-0.5 rounded-full">
              Pro
            </div>
            <h3 className="font-medium text-gray-900">{t('landing.pricing_pro_name')}</h3>
            <div className="mt-2 mb-6">
              <span className="text-3xl font-bold text-gray-900">{t('landing.pricing_pro_price')}</span>
              <span className="text-sm text-gray-400">{t('landing.pricing_pro_period')}</span>
            </div>
            <ul className="space-y-3 text-sm text-gray-600 mb-8">
              {[1, 2, 3, 4].map(n => (
                <li key={n} className="flex items-center gap-2">
                  <span className="text-blue-600">&mdash;</span>
                  {t(`landing.pricing_pro_f${n}`)}
                </li>
              ))}
            </ul>
            <Link
              to={`/${locale}/app`}
              className="block text-center bg-gray-900 text-white py-2.5 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              {t('landing.pricing_pro_cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-6 py-24">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-12">
            {t('landing.faq_title')}
          </h2>
          <div className="space-y-0">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="border-b border-gray-100">
                <button
                  onClick={() => setOpenFaq(openFaq === n ? null : n)}
                  className="w-full text-left py-5 flex items-center justify-between"
                >
                  <span className="font-medium text-gray-900 text-sm">{t(`landing.faq${n}_q`)}</span>
                  <span className="text-gray-400 text-lg">{openFaq === n ? '\u2212' : '+'}</span>
                </button>
                {openFaq === n && (
                  <p className="pb-5 text-sm text-gray-500 leading-relaxed">
                    {t(`landing.faq${n}_a`)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="bg-gray-900">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl font-bold text-white mb-6">
            {t('landing.footer_cta_title')}
          </h2>
          <Link
            to={`/${locale}/app`}
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors"
          >
            {t('landing.footer_cta_button')}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="font-mono text-sm text-gray-400">FillMyDoc</span>
          <div className="flex gap-6 text-xs text-gray-400">
            <a href="#" className="hover:text-gray-600">{t('landing.footer_legal')}</a>
            <a href="#" className="hover:text-gray-600">{t('landing.footer_terms')}</a>
            <a href="#" className="hover:text-gray-600">{t('landing.footer_contact')}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
