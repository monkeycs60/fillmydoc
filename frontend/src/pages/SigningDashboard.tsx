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
  reminderCount: number
  maxReminders: number
  lastReminderAt: string | null
  nextReminderAt: string | null
  createdAt: string
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
  const [showReminderConfig, setShowReminderConfig] = useState(false)
  const [reminderMax, setReminderMax] = useState(3)
  const [reminderInterval, setReminderInterval] = useState<'default' | 'frequent' | 'relaxed'>('default')
  const [savingReminders, setSavingReminders] = useState(false)

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

  const intervalPresets: Record<string, number[]> = {
    default: [3, 7, 14],
    frequent: [1, 3, 5, 7],
    relaxed: [5, 14, 30],
  }

  const saveReminderConfig = async () => {
    setSavingReminders(true)
    try {
      await fetch(`/api/signing/job/${jobId}/configure-reminders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxReminders: reminderMax,
          intervals: intervalPresets[reminderInterval],
          enabled: reminderMax > 0,
        }),
      })
      // Reload documents to reflect changes
      const res = await fetch(`/api/signing/job/${jobId}`)
      const data = await res.json()
      setDocuments(data.documents || [])
      setShowReminderConfig(false)
    } catch (error) {
      console.error('Failed to save reminder config:', error)
    } finally {
      setSavingReminders(false)
    }
  }

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

        {/* Reminder configuration toggle */}
        <div className="mb-6">
          <button
            onClick={() => setShowReminderConfig(!showReminderConfig)}
            className="text-xs px-4 py-2 border border-orange-200 rounded-md text-orange-700 hover:bg-orange-50 transition-colors"
          >
            {t('signing.reminder_configure')}
          </button>

          {showReminderConfig && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-md">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('signing.reminder_settings')}</h3>

              <div className="space-y-3">
                {/* Max reminders */}
                <div>
                  <label className="text-xs text-gray-600 block mb-1">{t('signing.reminder_max_label')}</label>
                  <select
                    value={reminderMax}
                    onChange={e => setReminderMax(Number(e.target.value))}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value={0}>{t('signing.reminder_disabled')}</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </div>

                {/* Interval preset */}
                <div>
                  <label className="text-xs text-gray-600 block mb-1">{t('signing.reminder_interval_label')}</label>
                  <select
                    value={reminderInterval}
                    onChange={e => setReminderInterval(e.target.value as 'default' | 'frequent' | 'relaxed')}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="default">{t('signing.reminder_interval_default')}</option>
                    <option value="frequent">{t('signing.reminder_interval_frequent')}</option>
                    <option value="relaxed">{t('signing.reminder_interval_relaxed')}</option>
                  </select>
                </div>

                <button
                  onClick={saveReminderConfig}
                  disabled={savingReminders}
                  className="text-xs px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                  {savingReminders ? '...' : t('signing.reminder_save')}
                </button>
              </div>
            </div>
          )}
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
                  {doc.emailSentAt && !isDocSigned(doc.status) && (
                    <p className="text-xs text-blue-500">
                      {t('signing.email_sent_at', { date: new Date(doc.emailSentAt).toLocaleString() })}
                    </p>
                  )}
                  {/* Reminder badge for unsigned documents */}
                  {!isDocSigned(doc.status) && doc.reminderCount > 0 && (
                    <p className="text-xs text-orange-600 mt-0.5">
                      {t('signing.reminder_count', { count: doc.reminderCount, max: doc.maxReminders })}
                    </p>
                  )}
                  {/* Next reminder info */}
                  {!isDocSigned(doc.status) && doc.nextReminderAt && doc.reminderCount < doc.maxReminders && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('signing.reminder_next', { date: new Date(doc.nextReminderAt).toLocaleDateString() })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Reminder count badge */}
                {!isDocSigned(doc.status) && doc.reminderCount > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                    {doc.reminderCount}/{doc.maxReminders}
                  </span>
                )}
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
