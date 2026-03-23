import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

interface JobSigningStats {
  total: number
  signed: number
  pending: number
}

interface Job {
  id: string
  templateName: string
  csvRowCount: number
  mode: 'download' | 'sign'
  status: string
  createdAt: string
  signingStats: JobSigningStats | null
}

interface Stats {
  totalDocs: number
  totalJobs: number
  totalSigningDocs: number
  signedDocs: number
  signingRate: number
  avgSigningTimeSeconds: number
  avgSigningTimeHours: number
  downloadJobs: number
  signJobs: number
}

interface JobDetail {
  job: Job
  documents: Array<{
    id: string
    fileName: string
    recipientName: string | null
    recipientEmail: string | null
    status: string
    signedAt: string | null
    signedByName: string | null
  }>
}

export function HistoryDashboard() {
  const { t } = useTranslation()
  const { locale } = useParams<{ locale: string }>()

  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Filters
  const [modeFilter, setModeFilter] = useState<string>('')
  const [templateFilter, setTemplateFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Expanded job detail
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', '20')
    if (modeFilter) params.set('mode', modeFilter)
    if (templateFilter) params.set('template', templateFilter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    try {
      const res = await fetch(`/api/history?${params.toString()}`)
      const data = await res.json()
      setJobs(data.jobs || [])
      setTotalPages(data.pagination?.totalPages || 1)
    } catch {
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [page, modeFilter, templateFilter, dateFrom, dateTo])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/history/stats')
      const data = await res.json()
      setStats(data)
    } catch {
      setStats(null)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const toggleExpand = async (jobId: string) => {
    if (expandedJobId === jobId) {
      setExpandedJobId(null)
      setJobDetail(null)
      return
    }

    setExpandedJobId(jobId)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/history/${jobId}`)
      const data = await res.json()
      setJobDetail(data)
    } catch {
      setJobDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const formatDate = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleDateString(locale === 'de' ? 'de-DE' : locale === 'es' ? 'es-ES' : locale === 'en' ? 'en-GB' : 'fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatAvgTime = (hours: number): string => {
    if (hours === 0) return '-'
    if (hours < 1) {
      const minutes = Math.round(hours * 60)
      return `${minutes}min`
    }
    return `${hours}h`
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
        return 'text-green-600'
      case 'otp_sent':
      case 'esign_pending':
        return 'text-amber-600'
      default:
        return 'text-gray-400'
    }
  }

  const handleFilterReset = () => {
    setModeFilter('')
    setTemplateFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="border-t-2 border-blue-600" />

      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to={`/${locale}`} className="font-mono text-xl font-bold text-gray-900">FillMyDoc</Link>
        <div className="flex items-center gap-8">
          <Link to={`/${locale}/app`} className="text-sm text-gray-500 hover:text-gray-900">
            {t('landing.nav_cta')}
          </Link>
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-mono text-2xl font-bold text-gray-900">{t('history.title')}</h1>
            <p className="text-sm text-gray-400 mt-1">{t('history.subtitle')}</p>
          </div>
          <Link
            to={`/${locale}/app`}
            className="text-sm font-medium bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            {t('history.new_generation')}
          </Link>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-50 rounded-md p-5">
              <p className="text-2xl font-bold text-gray-900">{stats.totalDocs}</p>
              <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">{t('history.stat_total_docs')}</p>
            </div>
            <div className="bg-gray-50 rounded-md p-5">
              <p className="text-2xl font-bold text-gray-900">{stats.totalJobs}</p>
              <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">{t('history.stat_total_jobs')}</p>
            </div>
            <div className="bg-green-50 rounded-md p-5">
              <p className="text-2xl font-bold text-green-600">{stats.signingRate}%</p>
              <p className="text-xs text-green-600 uppercase tracking-wider mt-1">{t('history.stat_signing_rate')}</p>
            </div>
            <div className="bg-blue-50 rounded-md p-5">
              <p className="text-2xl font-bold text-blue-600">{formatAvgTime(stats.avgSigningTimeHours)}</p>
              <p className="text-xs text-blue-600 uppercase tracking-wider mt-1">{t('history.stat_avg_time')}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="border border-gray-200 rounded-md p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('history.filter_mode')}</label>
              <select
                value={modeFilter}
                onChange={(e) => { setModeFilter(e.target.value); setPage(1) }}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700"
              >
                <option value="">{t('history.filter_all')}</option>
                <option value="download">{t('history.mode_download')}</option>
                <option value="sign">{t('history.mode_sign')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('history.filter_template')}</label>
              <input
                type="text"
                value={templateFilter}
                onChange={(e) => { setTemplateFilter(e.target.value); setPage(1) }}
                placeholder={t('history.filter_template_placeholder')}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 w-48"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('history.filter_date_from')}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">{t('history.filter_date_to')}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700"
              />
            </div>
            <button
              onClick={handleFilterReset}
              className="text-xs text-gray-400 hover:text-gray-600 pb-1.5"
            >
              {t('history.filter_reset')}
            </button>
          </div>
        </div>

        {/* Job list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">{t('history.empty')}</p>
            <Link
              to={`/${locale}/app`}
              className="inline-block mt-4 text-sm text-blue-600 hover:text-blue-700"
            >
              {t('history.empty_cta')}
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-0">
              {jobs.map((job) => (
                <div key={job.id} className="border-b border-gray-100">
                  <button
                    onClick={() => toggleExpand(job.id)}
                    className="w-full text-left py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors px-2 -mx-2 rounded"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${job.mode === 'sign' ? 'bg-blue-500' : 'bg-gray-400'}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {job.templateName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatDate(job.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500 font-mono">
                        {job.csvRowCount} {t('history.docs')}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        job.mode === 'sign'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {job.mode === 'sign' ? t('history.mode_sign') : t('history.mode_download')}
                      </span>
                      {job.signingStats && (
                        <span className="text-xs text-gray-400">
                          {job.signingStats.signed}/{job.signingStats.total}
                        </span>
                      )}
                      <span className="text-gray-300 text-lg">
                        {expandedJobId === job.id ? '\u2212' : '+'}
                      </span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expandedJobId === job.id && (
                    <div className="pb-4 px-2">
                      {job.mode === 'sign' && job.signingStats && (
                        <div className="mb-4">
                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3">
                            <div
                              className="h-1.5 bg-green-500 rounded-full transition-all"
                              style={{
                                width: `${job.signingStats.total > 0
                                  ? (job.signingStats.signed / job.signingStats.total) * 100
                                  : 0}%`,
                              }}
                            />
                          </div>
                          <div className="flex gap-4 text-xs text-gray-400 mb-3">
                            <span>{t('signing.dashboard_signed')}: {job.signingStats.signed}</span>
                            <span>{t('signing.dashboard_pending')}: {job.signingStats.pending}</span>
                          </div>
                          <Link
                            to={`/${locale}/signing/${job.id}`}
                            className="inline-block text-xs px-3 py-1.5 border border-blue-200 rounded-md text-blue-700 hover:bg-blue-50 transition-colors"
                          >
                            {t('history.view_signing_dashboard')}
                          </Link>
                        </div>
                      )}

                      {detailLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full" />
                        </div>
                      ) : jobDetail && jobDetail.documents.length > 0 ? (
                        <div className="bg-gray-50 rounded-md p-3">
                          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t('history.documents')}</p>
                          <div className="space-y-0">
                            {jobDetail.documents.map((doc) => (
                              <div key={doc.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <p className="text-xs font-medium text-gray-700">
                                      {doc.recipientName || doc.fileName}
                                    </p>
                                    {doc.recipientEmail && (
                                      <p className="text-xs text-gray-400">{doc.recipientEmail}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium ${getStatusColor(doc.status)}`}>
                                    {getStatusLabel(doc.status)}
                                  </span>
                                  {doc.signedAt && (
                                    <span className="text-xs text-gray-300">
                                      {formatDate(doc.signedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : job.mode === 'download' ? (
                        <p className="text-xs text-gray-400 py-2">{t('history.download_completed')}</p>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="text-sm px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t('history.prev')}
                </button>
                <span className="text-sm text-gray-400">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="text-sm px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t('history.next')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
