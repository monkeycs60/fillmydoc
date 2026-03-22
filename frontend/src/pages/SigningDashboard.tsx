import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface SigningDoc {
  id: string
  fileName: string
  recipientName: string | null
  recipientEmail: string | null
  status: string
  signedAt: string | null
  signedByName: string | null
  documentHash: string | null
  esignProvider: string | null
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

  const isDocSigned = (status: string) =>
    status === 'signed' || status === 'esign_completed'

  const signed = documents.filter(d => isDocSigned(d.status)).length
  const total = documents.length

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'signed':
      case 'esign_completed':
        return t('signing.dashboard_signed')
      case 'otp_sent':
        return t('signing.dashboard_otp_sent')
      case 'esign_pending':
        return t('signing.dashboard_esign_pending')
      default:
        return t('signing.dashboard_pending')
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'signed':
      case 'esign_completed':
        return 'bg-green-500'
      case 'otp_sent':
      case 'esign_pending':
        return 'bg-amber-400'
      default:
        return 'bg-gray-300'
    }
  }

  const getStatusTextColor = (status: string): string => {
    switch (status) {
      case 'signed':
      case 'esign_completed':
        return 'text-green-600'
      case 'otp_sent':
      case 'esign_pending':
        return 'text-amber-600'
      default:
        return 'text-gray-400'
    }
  }

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
        <div className="w-full h-1.5 bg-gray-100 rounded-full mb-8">
          <div
            className="h-1.5 bg-green-500 rounded-full transition-all"
            style={{ width: `${total > 0 ? (signed / total) * 100 : 0}%` }}
          />
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-50 rounded-md p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{total}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">{t('signing.dashboard_total')}</p>
          </div>
          <div className="bg-green-50 rounded-md p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{signed}</p>
            <p className="text-xs text-green-600 uppercase tracking-wider">{t('signing.dashboard_signed')}</p>
          </div>
          <div className="bg-gray-50 rounded-md p-4 text-center">
            <p className="text-2xl font-bold text-gray-500">{total - signed}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider">{t('signing.dashboard_pending')}</p>
          </div>
        </div>

        {/* Document list */}
        <div className="space-y-0">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center justify-between py-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(doc.status)}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {doc.recipientName || doc.fileName}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400 font-mono">{doc.fileName}</p>
                    {doc.recipientEmail && (
                      <p className="text-xs text-gray-400">{doc.recipientEmail}</p>
                    )}
                  </div>
                  {isDocSigned(doc.status) && doc.signedAt && (
                    <p className="text-xs text-green-600">
                      {doc.signedByName} — {new Date(doc.signedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${getStatusTextColor(doc.status)}`}>
                  {getStatusLabel(doc.status)}
                </span>
                {isDocSigned(doc.status) && (
                  <a
                    href={`/api/signing/${doc.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 border border-green-200 rounded-md text-green-700 hover:bg-green-50 transition-colors"
                  >
                    PDF
                  </a>
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
