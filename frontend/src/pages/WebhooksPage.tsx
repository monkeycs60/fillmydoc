import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

interface Webhook {
  id: string
  name: string
  url: string
  events: string[]
  active: boolean
  secretPreview: string
  createdAt: string
  updatedAt: string
}

interface WebhookLog {
  id: string
  event: string
  statusCode: number | null
  success: boolean
  attempt: number
  response: string | null
  createdAt: string
}

const ALL_EVENTS = ['document.signed', 'document.viewed', 'job.completed'] as const

export function WebhooksPage() {
  const { t } = useTranslation()
  const { locale } = useParams<{ locale: string }>()

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formEvents, setFormEvents] = useState<string[]>([])
  const [formError, setFormError] = useState('')
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)

  // Logs
  const [logsWebhookId, setLogsWebhookId] = useState<string | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Test
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; statusCode: number | null } | null>(null)

  const fetchWebhooks = useCallback(() => {
    fetch('/api/webhooks')
      .then(r => r.json())
      .then(data => setWebhooks(data.webhooks || []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  const resetForm = () => {
    setFormName('')
    setFormUrl('')
    setFormEvents([])
    setFormError('')
    setEditingId(null)
    setShowForm(false)
    setCreatedSecret(null)
  }

  const toggleEvent = (event: string) => {
    setFormEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    )
  }

  const handleSubmit = async () => {
    setFormError('')

    if (!formName.trim()) {
      setFormError(t('webhooks.error_name_required'))
      return
    }
    if (!formUrl.trim()) {
      setFormError(t('webhooks.error_url_required'))
      return
    }
    if (formEvents.length === 0) {
      setFormError(t('webhooks.error_events_required'))
      return
    }

    try {
      if (editingId) {
        const res = await fetch(`/api/webhooks/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, url: formUrl, events: formEvents }),
        })
        if (!res.ok) {
          const err = await res.json()
          setFormError(err.error || 'Error')
          return
        }
      } else {
        const res = await fetch('/api/webhooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, url: formUrl, events: formEvents }),
        })
        if (!res.ok) {
          const err = await res.json()
          setFormError(err.error || 'Error')
          return
        }
        const data = await res.json()
        if (data.secret) {
          setCreatedSecret(data.secret)
        }
      }

      fetchWebhooks()
      if (editingId) {
        resetForm()
      }
    } catch {
      setFormError('Network error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('webhooks.confirm_delete'))) return

    await fetch(`/api/webhooks/${id}`, { method: 'DELETE' })
    fetchWebhooks()
    if (logsWebhookId === id) setLogsWebhookId(null)
  }

  const handleToggleActive = async (webhook: Webhook) => {
    await fetch(`/api/webhooks/${webhook.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !webhook.active }),
    })
    fetchWebhooks()
  }

  const handleEdit = (webhook: Webhook) => {
    setEditingId(webhook.id)
    setFormName(webhook.name)
    setFormUrl(webhook.url)
    setFormEvents(webhook.events)
    setFormError('')
    setShowForm(true)
    setCreatedSecret(null)
  }

  const handleViewLogs = async (webhookId: string) => {
    if (logsWebhookId === webhookId) {
      setLogsWebhookId(null)
      return
    }
    setLogsWebhookId(webhookId)
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/webhooks/${webhookId}/logs`)
      const data = await res.json()
      setLogs(data.logs || [])
    } catch {
      setLogs([])
    }
    setLogsLoading(false)
  }

  const handleTest = async (webhookId: string) => {
    setTestingId(webhookId)
    setTestResult(null)
    try {
      const res = await fetch(`/api/webhooks/${webhookId}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResult({ id: webhookId, success: data.success, statusCode: data.statusCode })
    } catch {
      setTestResult({ id: webhookId, success: false, statusCode: null })
    }
    setTestingId(null)
    // Refresh logs if viewing them
    if (logsWebhookId === webhookId) {
      const res = await fetch(`/api/webhooks/${webhookId}/logs`)
      const data = await res.json()
      setLogs(data.logs || [])
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

      {/* Nav */}
      <nav className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to={`/${locale}`} className="font-mono text-xl font-bold text-gray-900">FillMyDoc</Link>
        <div className="flex items-center gap-6">
          <Link to={`/${locale}/app`} className="text-sm text-gray-500 hover:text-gray-900">
            {t('landing.nav_cta')}
          </Link>
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-mono text-2xl font-bold text-gray-900">{t('webhooks.title')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('webhooks.subtitle')}</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm) }}
            className="text-sm font-medium bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            {showForm ? t('webhooks.cancel') : t('webhooks.add')}
          </button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="border border-gray-200 rounded-md p-6 mb-8">
            <h2 className="font-medium text-gray-900 mb-4">
              {editingId ? t('webhooks.edit_title') : t('webhooks.add_title')}
            </h2>

            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-4 py-2 mb-4">
                {formError}
              </div>
            )}

            {/* Show secret after creation */}
            {createdSecret && (
              <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-4">
                <p className="text-sm font-medium text-amber-800 mb-1">{t('webhooks.secret_created')}</p>
                <code className="text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded font-mono break-all block">
                  {createdSecret}
                </code>
                <p className="text-xs text-amber-600 mt-1">{t('webhooks.secret_warning')}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('webhooks.name_label')}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder={t('webhooks.name_placeholder')}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('webhooks.url_label')}</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('webhooks.events_label')}</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EVENTS.map(event => (
                    <button
                      key={event}
                      onClick={() => toggleEvent(event)}
                      className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                        formEvents.includes(event)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {t(`webhooks.event_${event.replace('.', '_')}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSubmit}
                  className="text-sm font-medium bg-blue-600 text-white px-5 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  {editingId ? t('webhooks.save') : t('webhooks.create')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Webhooks List */}
        {webhooks.length === 0 && !showForm ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-4">&#128268;</p>
            <p className="text-sm">{t('webhooks.empty')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map(webhook => (
              <div key={webhook.id} className="border border-gray-200 rounded-md">
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4">
                    {/* Active toggle */}
                    <button
                      onClick={() => handleToggleActive(webhook)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        webhook.active ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                      title={webhook.active ? t('webhooks.active') : t('webhooks.inactive')}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        webhook.active ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>

                    <div>
                      <p className="text-sm font-medium text-gray-900">{webhook.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{webhook.url}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Event badges */}
                    <div className="hidden sm:flex gap-1.5 mr-2">
                      {webhook.events.map(event => (
                        <span key={event} className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                          {event}
                        </span>
                      ))}
                    </div>

                    {/* Test button */}
                    <button
                      onClick={() => handleTest(webhook.id)}
                      disabled={testingId === webhook.id}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {testingId === webhook.id ? '...' : t('webhooks.test')}
                    </button>

                    {/* Test result indicator */}
                    {testResult && testResult.id === webhook.id && (
                      <span className={`text-xs font-medium ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResult.success ? `${testResult.statusCode}` : t('webhooks.test_failed')}
                      </span>
                    )}

                    {/* Logs button */}
                    <button
                      onClick={() => handleViewLogs(webhook.id)}
                      className={`text-xs px-3 py-1.5 border rounded-md transition-colors ${
                        logsWebhookId === webhook.id
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {t('webhooks.logs')}
                    </button>

                    {/* Edit button */}
                    <button
                      onClick={() => handleEdit(webhook)}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      {t('webhooks.edit')}
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(webhook.id)}
                      className="text-xs px-3 py-1.5 border border-red-200 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                    >
                      {t('webhooks.delete')}
                    </button>
                  </div>
                </div>

                {/* Secret preview */}
                <div className="px-5 pb-3 -mt-1">
                  <span className="text-[10px] text-gray-400">
                    {t('webhooks.secret_label')}: <code className="font-mono">{webhook.secretPreview}</code>
                  </span>
                </div>

                {/* Logs panel */}
                {logsWebhookId === webhook.id && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                      {t('webhooks.logs_title')}
                    </h3>
                    {logsLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full" />
                      </div>
                    ) : logs.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">{t('webhooks.no_logs')}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-400 border-b border-gray-100">
                              <th className="pb-2 pr-4 font-medium">{t('webhooks.log_event')}</th>
                              <th className="pb-2 pr-4 font-medium">{t('webhooks.log_status')}</th>
                              <th className="pb-2 pr-4 font-medium">{t('webhooks.log_attempt')}</th>
                              <th className="pb-2 font-medium">{t('webhooks.log_date')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map(log => (
                              <tr key={log.id} className="border-b border-gray-50">
                                <td className="py-2 pr-4 font-mono text-gray-600">{log.event}</td>
                                <td className="py-2 pr-4">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${
                                    log.success
                                      ? 'bg-green-50 text-green-700'
                                      : 'bg-red-50 text-red-700'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${log.success ? 'bg-green-500' : 'bg-red-500'}`} />
                                    {log.statusCode || '---'}
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-gray-500">#{log.attempt}</td>
                                <td className="py-2 text-gray-400">
                                  {new Date(log.createdAt).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
