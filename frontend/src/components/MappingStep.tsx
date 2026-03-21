import { useTranslation } from 'react-i18next'

interface MappingStepProps {
  variables: string[]
  columns: string[]
  mapping: Record<string, string>
  prefix: string
  nameColumn: string
  csvRowCount: number
  onMapChange: (variable: string, column: string) => void
  onPrefixChange: (prefix: string) => void
  onNameColumnChange: (col: string) => void
  onGenerate: () => void
  onSendForSignature: () => void
}

export function MappingStep({
  variables, columns, mapping, prefix, nameColumn,
  csvRowCount, onMapChange, onPrefixChange, onNameColumnChange, onGenerate, onSendForSignature
}: MappingStepProps) {
  const { t } = useTranslation()
  const allMapped = variables.every(v => mapping[v])

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
          {t('mapping.title')}
        </h2>
        <div>
          {variables.map(variable => {
            const isAutoMatched = !!mapping[variable]
            return (
              <div key={variable} className="flex items-center gap-4 border-b border-gray-100 py-3">
                <span className="w-48 font-mono text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded font-medium">
                  {`{${variable}}`}
                </span>
                <span className="text-gray-300">{'\u2192'}</span>
                <div className="flex-1 flex items-center gap-2">
                  <select
                    value={mapping[variable] || ''}
                    onChange={(e) => onMapChange(variable, e.target.value)}
                    className="flex-1 border-0 border-b border-gray-200 rounded-none bg-transparent
                               px-1 py-2 text-sm focus:border-blue-600 focus:ring-0 outline-none"
                  >
                    <option value="">{t('mapping.select_placeholder')}</option>
                    {columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {isAutoMatched && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
          {t('mapping.naming_title')}
        </h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={prefix}
            onChange={(e) => onPrefixChange(e.target.value)}
            placeholder={t('mapping.prefix_placeholder')}
            className="w-48 border-0 border-b border-gray-200 rounded-none bg-transparent
                       px-1 py-2 text-sm focus:border-blue-600 focus:ring-0 outline-none"
          />
          <span className="text-gray-300">_</span>
          <select
            value={nameColumn}
            onChange={(e) => onNameColumnChange(e.target.value)}
            className="flex-1 border-0 border-b border-gray-200 rounded-none bg-transparent
                       px-1 py-2 text-sm focus:border-blue-600 focus:ring-0 outline-none"
          >
            {columns.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
          <span className="text-sm text-gray-300">.pdf</span>
        </div>
        <p className="font-mono text-xs text-gray-400 mt-3">
          {t('mapping.example')}: {prefix || 'document'}_{nameColumn ? `[${nameColumn}]` : '001'}.pdf
        </p>
      </div>

      <button
        onClick={onGenerate}
        disabled={!allMapped}
        className="w-full py-3 rounded-md font-semibold text-white
                   bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300
                   disabled:cursor-not-allowed transition-colors"
      >
        {t('mapping.generate', { count: csvRowCount })}
      </button>
      <button
        onClick={onSendForSignature}
        disabled={!allMapped}
        className="w-full py-3 rounded-md font-medium text-gray-700 border border-gray-300
                   hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400
                   disabled:cursor-not-allowed transition-colors mt-3"
      >
        {t('signing.send_for_signature')}
      </button>
    </div>
  )
}
