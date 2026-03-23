import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface PreviewPanelProps {
  templateFile: File | null
  csvFile: File | null
  mapping: Record<string, string>
  conditionsMapping: Record<string, string>
  csvRows: Record<string, string>[]
  csvColumns: string[]
  csvRowCount: number
  previewRowIndex: number
  previewUrl: string | null
  previewLoading: boolean
  previewError: string | null
  onRowIndexChange: (index: number) => void
  onGeneratePreview: (
    templateFile: File,
    csvFile: File,
    mapping: Record<string, string>,
    conditionsMapping: Record<string, string>,
    rowIndex: number
  ) => void
}

export function PreviewPanel({
  templateFile,
  csvFile,
  mapping,
  conditionsMapping,
  csvRows,
  csvColumns,
  csvRowCount,
  previewRowIndex,
  previewUrl,
  previewLoading,
  previewError,
  onRowIndexChange,
  onGeneratePreview
}: PreviewPanelProps) {
  const { t } = useTranslation()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const allMapped = Object.values(mapping).some(v => v !== '')

  // Debounced preview trigger
  const triggerPreview = useCallback(() => {
    if (!templateFile || !csvFile || !allMapped) return

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      onGeneratePreview(templateFile, csvFile, mapping, conditionsMapping, previewRowIndex)
    }, 1000)
  }, [templateFile, csvFile, mapping, conditionsMapping, previewRowIndex, allMapped, onGeneratePreview])

  // Auto-refresh when mapping or row changes
  useEffect(() => {
    triggerPreview()
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [triggerPreview])

  // Get a snippet of the current row data for display
  const currentRow = csvRows[previewRowIndex]
  const rowSnippet = currentRow
    ? csvColumns.slice(0, 3).map(col => currentRow[col] || '').filter(Boolean).join(' | ')
    : ''

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setIsCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            {t('preview.title')}
          </span>
          {previewLoading && (
            <div className="animate-spin h-3.5 w-3.5 border-2 border-blue-600 border-t-transparent rounded-full" />
          )}
        </div>
        {previewUrl && !isCollapsed && (
          <span className="text-xs text-gray-400">
            {t('preview.row_of', { current: previewRowIndex + 1, total: csvRowCount })}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="border-t border-gray-200">
          {/* Row selector */}
          {csvRowCount > 1 && (
            <div className="px-4 py-3 bg-white border-b border-gray-100">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-gray-500 whitespace-nowrap">
                  {t('preview.row_label')}
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onRowIndexChange(Math.max(0, previewRowIndex - 1))}
                    disabled={previewRowIndex === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={csvRowCount}
                    value={previewRowIndex + 1}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= 1 && val <= csvRowCount) {
                        onRowIndexChange(val - 1)
                      }
                    }}
                    className="w-16 text-center border border-gray-200 rounded px-2 py-1 text-sm
                               focus:border-blue-500 focus:ring-0 outline-none"
                  />
                  <button
                    onClick={() => onRowIndexChange(Math.min(csvRowCount - 1, previewRowIndex + 1))}
                    disabled={previewRowIndex >= csvRowCount - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <span className="text-xs text-gray-400 ml-1">/ {csvRowCount}</span>
                </div>
                {rowSnippet && (
                  <span className="text-xs text-gray-400 truncate ml-2 max-w-48" title={rowSnippet}>
                    {rowSnippet}
                  </span>
                )}
                <button
                  onClick={() => {
                    if (templateFile && csvFile) {
                      onGeneratePreview(templateFile, csvFile, mapping, conditionsMapping, previewRowIndex)
                    }
                  }}
                  disabled={previewLoading || !allMapped}
                  className="ml-auto p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t('preview.refresh')}
                >
                  <svg className={`w-4 h-4 text-gray-600 ${previewLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Preview content */}
          <div className="bg-gray-50">
            {!allMapped && (
              <div className="flex items-center justify-center py-16 px-4">
                <p className="text-sm text-gray-400 text-center">
                  {t('preview.configure_mapping')}
                </p>
              </div>
            )}

            {allMapped && previewLoading && !previewUrl && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin h-6 w-6 border-2 border-gray-900 border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-sm text-gray-500">{t('preview.generating')}</p>
                </div>
              </div>
            )}

            {previewError && (
              <div className="px-4 py-3 bg-red-50 text-red-600 text-sm">
                {previewError}
              </div>
            )}

            {previewUrl && (
              <div className="relative">
                {previewLoading && (
                  <div className="absolute top-2 right-2 z-10">
                    <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                  </div>
                )}
                <iframe
                  src={previewUrl}
                  className="w-full border-0"
                  style={{ height: '500px' }}
                  title={t('preview.title')}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
