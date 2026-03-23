import { useState, useEffect, useCallback } from 'react'
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
  emailSentAt: string | null
  signingUrl: string
}

export function SigningDashboard() {
  const { t } = useTranslation()
  const { locale, jobId } = useParams<{ locale: string; jobId: string }>()
  const [documents, setDocuments] = useState<SigningDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)

  const fetchDocuments = useCallback(() => {
    fetch(`/api/signing/job/${jobId}`)
      .then(r => r.json())
      .then(data => setDocuments(data.documents || []))
      .finally(() => setLoading(false))
  }, [jobId])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const clearMessages = () => {
    setEmailError(null)
    setEmailSuccess(null)
  }

  const showTemporaryMessage = (setter: (v: string | null) => void, message: string) => {
    setter(message)
    setTimeout(() => setter(null), 5000)
  }

  const copyLink = (doc: SigningDoc) => {
    const url = `${window.location.origin}/${locale}/sign/${doc.id}`
    navigator.clipboard.writeText(url)
    setCopiedId(doc.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const sendEmail = async (docId: string) => {
    clearMessages()
    setSendingEmailId(docId)
    try {
      const res = await fetch(`/api/signing/${docId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: window.location.origin,
          locale,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showTemporaryMessage(setEmailError, data.error || t('signing.email_send_error'))
        return
      }
      showTemporaryMessage(setEmailSuccess, t('signing.email_sent_success'))
      fetchDocuments()
    } catch {
      showTemporaryMessage(setEmailError, t('signing.email_send_error'))
    } finally {
      setSendingEmailId(null)
    }
  }

  const sendAllEmails = async () => {
    clearMessages()
    setSendingAll(true)
    try {
      const res = await fetch(`/api/signing/job/${jobId}/send-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: window.location.origin,
          locale,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showTemporaryMessage(setEmailError, data.error || t('signing.email_send_error'))
        return
      }
      const msg = t('signing.email_bulk_result', { sent: data.sent, failed: data.failed })
      if (data.failed > 0) {
        showTemporaryMessage(setEmailError, msg)
      } else {
        showTemporaryMessage(setEmailSuccess, msg)
      }
      fetchDocuments()
    } catch {
      showTemporaryMessage(setEmailError, t('signing.email_send_error'))
    } finally {
      setSendingAll(false)
    }
  }

  const isDocSigned = (status: string) =>
    status === 'signed' || status === 'esign_completed'

  const canSendEmail = (doc: SigningDoc) =>
    !isDocSigned(doc.status) && !!doc.recipientEmail

  const signed = documents.filter(d => isDocSigned(d.status)).length
  const total = documents.length
  const pendingWithEmail = documents.filter(d => canSendEmail(d)).length

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

        {/* Notification banners */}
        {emailError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center justify-between">
            <p className="text-sm text-red-700">{emailError}</p>
            <button onClick={() => setEmailError(null)} className="text-red-400 hover:text-red-600 ml-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {emailSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
            <p className="text-sm text-green-700">{emailSuccess}</p>
            <button onClick={() => setEmailSuccess(null)} className="text-green-400 hover:text-green-600 ml-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Bulk send button */}
        {pendingWithEmail > 0 && (
          <div className="mb-6">
            <button
              onClick={sendAllEmails}
              disabled={sendingAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sendingAll ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
              {t('signing.email_send_all', { count: pendingWithEmail })}
            </button>
          </div>
        )}

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
                  {doc.emailSentAt && !isDocSigned(doc.status) && (
                    <p className="text-xs text-blue-500">
                      {t('signing.email_sent_at', { date: new Date(doc.emailSentAt).toLocaleString() })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${getStatusTextColor(doc.status)}`}>
                  {getStatusLabel(doc.status)}
                </span>
                {doc.emailSentAt && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
                    {t('signing.email_sent_badge')}
                  </span>
                )}
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
                {canSendEmail(doc) && (
                  <button
                    onClick={() => sendEmail(doc.id)}
                    disabled={sendingEmailId === doc.id}
                    className="text-xs px-3 py-1.5 border border-blue-200 rounded-md text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
                  >
                    {sendingEmailId === doc.id ? (
                      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    )}
                    {doc.emailSentAt ? t('signing.email_resend') : t('signing.email_send')}
                  </button>
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
