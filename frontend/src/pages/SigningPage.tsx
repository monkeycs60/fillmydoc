import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface SigningDoc {
  id: string
  fileName: string
  recipientName: string | null
  status: 'pending' | 'signed'
  signedAt: string | null
  signedByName: string | null
}

export function SigningPage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [doc, setDoc] = useState<SigningDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [signerName, setSignerName] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/signing/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setDoc(data)
      })
      .catch(() => setError('Failed to load document'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSign = async () => {
    if (!signerName.trim() || signerName.trim().length < 2) return
    setSigning(true)
    setError(null)

    try {
      const res = await fetch(`/api/signing/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signerName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setDoc(prev => prev ? {
        ...prev,
        status: 'signed',
        signedAt: data.signedAt,
        signedByName: data.signedByName
      } : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error && !doc) {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-t-2 border-blue-600" />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <p className="text-gray-500">{t('signing.not_found')}</p>
        </div>
      </div>
    )
  }

  if (!doc) return null

  return (
    <div className="min-h-screen bg-white">
      <div className="border-t-2 border-blue-600" />

      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-mono text-2xl font-bold text-gray-900">{t('signing.page_title')}</h1>
          <span className="text-sm text-gray-400 font-mono">{doc.fileName}</span>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 border-l-4 border-red-500 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* PDF Preview */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            {t('signing.preview_label')}
          </p>
          <div className="border border-gray-200 rounded-md overflow-hidden" style={{ height: '500px' }}>
            <iframe
              src={`/api/signing/${token}/pdf`}
              className="w-full h-full"
              title="PDF Preview"
            />
          </div>
        </div>

        {/* Signing form or signed status */}
        {doc.status === 'pending' ? (
          <div className="border border-gray-200 rounded-md p-6">
            <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
              {t('signing.sign_label')}
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={t('signing.sign_placeholder')}
              className="w-full border-0 border-b border-gray-200 rounded-none bg-transparent px-0 py-2 text-lg focus:border-blue-600 focus:ring-0 outline-none mb-4"
            />
            <p className="text-xs text-gray-400 mb-6">
              {t('signing.sign_disclaimer')}
            </p>
            <button
              onClick={handleSign}
              disabled={signing || signerName.trim().length < 2}
              className="w-full py-3 rounded-md font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {signing ? '...' : t('signing.sign_button')}
            </button>
          </div>
        ) : (
          <div className="border border-green-200 bg-green-50/30 rounded-md p-6 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="font-medium text-green-800 mb-1">{t('signing.signed_title')}</p>
            <p className="text-sm text-green-700">
              {t('signing.signed_message', {
                name: doc.signedByName,
                date: doc.signedAt ? new Date(doc.signedAt).toLocaleDateString() : ''
              })}
            </p>
            <a
              href={`/api/signing/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 px-6 py-2 border border-green-300 rounded-md text-sm text-green-800 hover:bg-green-50 transition-colors"
            >
              {t('signing.download_signed')}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
