import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

interface BrandingConfig {
  primaryColor: string
  companyName: string | null
  hasLogo: boolean
  updatedAt?: string
}

export function BrandingSettings() {
  const { t } = useTranslation()
  const { locale } = useParams<{ locale: string }>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [config, setConfig] = useState<BrandingConfig>({
    primaryColor: '#2563eb',
    companyName: null,
    hasLogo: false,
  })
  const [primaryColor, setPrimaryColor] = useState('#2563eb')
  const [companyName, setCompanyName] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // Fetch current branding config
  useEffect(() => {
    fetch('/api/branding')
      .then(r => r.json())
      .then((data: BrandingConfig) => {
        setConfig(data)
        setPrimaryColor(data.primaryColor)
        setCompanyName(data.companyName || '')
        if (data.hasLogo) {
          setLogoPreview(`/api/branding/logo?t=${Date.now()}`)
        }
      })
      .catch(() => setError(t('branding.load_error')))
  }, [t])

  // Handle logo file selection
  const handleLogoFile = useCallback((file: File) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
    if (!allowedTypes.includes(file.type)) {
      setError(t('branding.logo_type_error'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t('branding.logo_size_error'))
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setError(null)
  }, [t])

  // Drag and drop handlers
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleLogoFile(file)
  }, [handleLogoFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  // Remove logo
  const handleRemoveLogo = async () => {
    try {
      await fetch('/api/branding/logo', { method: 'DELETE' })
      setLogoPreview(null)
      setLogoFile(null)
      setConfig(prev => ({ ...prev, hasLogo: false }))
    } catch {
      setError(t('branding.delete_error'))
    }
  }

  // Save all settings
  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      // Upload logo if new file selected
      if (logoFile) {
        const formData = new FormData()
        formData.append('logo', logoFile)
        const logoRes = await fetch('/api/branding/logo', {
          method: 'POST',
          body: formData,
        })
        if (!logoRes.ok) {
          const data = await logoRes.json()
          throw new Error(data.error || 'Logo upload failed')
        }
      }

      // Update config
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryColor,
          companyName: companyName.trim() || '',
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Save failed')
      }

      setLogoFile(null)
      setConfig(prev => ({
        ...prev,
        primaryColor,
        companyName: companyName.trim() || null,
        hasLogo: prev.hasLogo || !!logoFile,
      }))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Preset colors
  const presetColors = [
    '#2563eb', '#0891b2', '#059669', '#d97706',
    '#dc2626', '#7c3aed', '#db2777', '#1e293b',
  ]

  return (
    <div className="min-h-screen bg-white">
      <div className="border-t-2" style={{ borderColor: primaryColor }} />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              to={`/${locale}/app`}
              className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block"
            >
              {t('branding.back')}
            </Link>
            <h1 className="font-mono text-2xl font-bold text-gray-900">
              {t('branding.title')}
            </h1>
            <p className="text-sm text-gray-400 mt-1">{t('branding.subtitle')}</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 border-l-4 border-red-500 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {saved && (
          <div className="mb-6 px-4 py-3 border-l-4 border-green-500 bg-green-50 text-green-700 text-sm">
            {t('branding.saved')}
          </div>
        )}

        {/* Logo Upload */}
        <div className="mb-8">
          <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
            {t('branding.logo_label')}
          </label>
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            {logoPreview ? (
              <div className="flex flex-col items-center">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="max-h-20 max-w-[200px] object-contain mb-3"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveLogo()
                  }}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  {t('branding.remove_logo')}
                </button>
              </div>
            ) : (
              <div>
                <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v15a1.5 1.5 0 001.5 1.5z" />
                </svg>
                <p className="text-sm text-gray-500">{t('branding.logo_hint')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('branding.logo_formats')}</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleLogoFile(file)
              }}
            />
          </div>
        </div>

        {/* Company Name */}
        <div className="mb-8">
          <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
            {t('branding.company_label')}
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t('branding.company_placeholder')}
            className="w-full border border-gray-200 rounded-md px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-0 outline-none"
          />
          <p className="text-xs text-gray-400 mt-1">{t('branding.company_hint')}</p>
        </div>

        {/* Primary Color */}
        <div className="mb-8">
          <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
            {t('branding.color_label')}
          </label>
          <div className="flex items-center gap-4 mb-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border border-gray-200"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => {
                const val = e.target.value
                if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                  setPrimaryColor(val)
                }
              }}
              className="w-28 border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-0 outline-none"
            />
          </div>
          <div className="flex gap-2">
            {presetColors.map(color => (
              <button
                key={color}
                onClick={() => setPrimaryColor(color)}
                className={`w-7 h-7 rounded-full border-2 transition-all ${
                  primaryColor === color ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* Live Preview */}
        <div className="mb-8">
          <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
            {t('branding.preview_label')}
          </label>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Signing page header preview */}
            <div className="border-t-2" style={{ borderColor: primaryColor }} />
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-3">
                {logoPreview && (
                  <img
                    src={logoPreview}
                    alt="Logo"
                    className="h-8 max-w-[120px] object-contain"
                  />
                )}
                <h2 className="font-mono text-lg font-bold text-gray-900">
                  {companyName.trim() || 'FillMyDoc'}
                </h2>
              </div>
              <p className="text-sm text-gray-400">{t('branding.preview_document')}</p>

              {/* Mini signature block preview */}
              <div className="mt-4 p-3 rounded border" style={{ borderColor: primaryColor, backgroundColor: '#f8f9fa' }}>
                <p className="text-xs font-bold" style={{ color: primaryColor }}>
                  {companyName.trim()
                    ? `${companyName.trim()} — SIGNATURE ELECTRONIQUE`
                    : 'SIGNATURE ELECTRONIQUE'}
                </p>
                <p className="text-xs text-gray-700 mt-1 font-semibold">
                  {t('branding.preview_signed_by')}: Jean Dupont
                </p>
                <p className="text-xs text-gray-400">
                  {t('branding.preview_date')}: 23/03/2026
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-md font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: primaryColor }}
        >
          {saving ? t('branding.saving') : t('branding.save')}
        </button>
      </div>
    </div>
  )
}
