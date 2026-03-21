import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface SigningDoc {
  id: string
  fileName: string
  recipientName: string | null
  status: 'pending' | 'signed'
  signedAt: string | null
  signedByName: string | null
  signingUrl: string
}

export function SigningDashboard() {
  const { t } = useTranslation()
  const { locale, jobId } = useParams<{ locale: string; jobId: string }>()
  const [documents, setDocuments] = useState<SigningDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/signing/job/${jobId}`)
      .then(r => r.json())
      .then(data => setDocuments(data.documents || []))
      .finally(() => setLoading(false))
  }, [jobId])

  const copyLink = (doc: SigningDoc) => {
    const url = `${window.location.origin}/${locale}/sign/${doc.id}`
    navigator.clipboard.writeText(url)
    setCopiedId(doc.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const signed = documents.filter(d => d.status === 'signed').length
  const total = documents.length

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="border-t-2 border-blue-600" />

      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link to={`/${locale}/app`} className="text-sm text-gray-400 hover:text-gray-600 mb-6 block">
          {t('signing.dashboard_back')}
        </Link>

        <div className="flex items-center justify-between mb-8">
          <h1 className="font-mono text-2xl font-bold text-gray-900">{t('signing.dashboard_title')}</h1>
          <span className="text-sm text-gray-400">
            {signed}/{total} {t('signing.dashboard_signed').toLowerCase()}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-gray-100 rounded-full mb-8">
          <div
            className="h-1 bg-green-500 rounded-full transition-all"
            style={{ width: `${total > 0 ? (signed / total) * 100 : 0}%` }}
          />
        </div>

        {/* Document list */}
        <div className="space-y-0">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center justify-between py-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${doc.status === 'signed' ? 'bg-green-500' : 'bg-gray-300'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{doc.recipientName || doc.fileName}</p>
                  <p className="text-xs text-gray-400 font-mono">{doc.fileName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {doc.status === 'signed' ? (
                  <span className="text-xs text-green-600 font-medium">
                    {t('signing.dashboard_signed')}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">
                    {t('signing.dashboard_pending')}
                  </span>
                )}
                <button
                  onClick={() => copyLink(doc)}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                >
                  {copiedId === doc.id ? t('signing.dashboard_copied') : t('signing.dashboard_copy')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
