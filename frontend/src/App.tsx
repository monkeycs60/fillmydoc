import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { FileUpload } from './components/FileUpload'
import { MappingStep } from './components/MappingStep'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { useGenerator } from './hooks/useGenerator'

function App() {
  const { t } = useTranslation()
  const { locale } = useParams<{ locale: string }>()
  const {
    state, setTemplate, setCsv, setMapping, setConditionMapping,
    setPrefix, setNameColumn, setEmailColumn, generate, sendForSignature, reset,
    setPreviewRowIndex, generatePreview
  } = useGenerator()

  return (
    <div className="min-h-screen bg-white">
      <div className="border-t-2 border-blue-600" />
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-10">
          <h1 className="font-mono text-2xl font-bold text-gray-900">{t('app.title')}</h1>
          <LanguageSwitcher />
        </div>
        <p className="text-gray-400 text-sm -mt-8 mb-10">{t('app.tagline')}</p>

        {state.error && (
          <div className="mb-6 px-4 py-3 border-l-4 border-red-500 bg-red-50 text-red-700 text-sm">
            {state.error}
          </div>
        )}

        {state.step === 'upload' && (
          <div className="space-y-4">
            <FileUpload
              label={t('upload.template_label')}
              accept=".docx"
              file={state.templateFile}
              onFileSelect={setTemplate}
              hint={t('upload.template_hint')}
              icon="template"
            />
            <FileUpload
              label={t('upload.csv_label')}
              accept=".csv"
              file={state.csvFile}
              onFileSelect={setCsv}
              hint={t('upload.csv_hint')}
              icon="csv"
            />
            {state.templateFile && state.csvFile && (state.templateVariables.length > 0 || state.templateConditions.length > 0) && (
              <div className="text-center text-sm text-green-600 space-y-1">
                <p>
                  {t('upload.variables_detected', {
                    count: state.templateVariables.length,
                    rows: state.csvRowCount
                  })}
                </p>
                {state.templateConditions.length > 0 && (
                  <p className="text-amber-600">
                    {t('upload.conditions_detected', {
                      count: state.templateConditions.length
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {state.step === 'mapping' && (
          <div>
            <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
              {t('mapping.back')}
            </button>
            <MappingStep
              variables={state.templateVariables}
              conditions={state.templateConditions}
              columns={state.csvColumns}
              mapping={state.mapping}
              conditionsMapping={state.conditionsMapping}
              prefix={state.prefix}
              nameColumn={state.nameColumn}
              emailColumn={state.emailColumn}
              csvRowCount={state.csvRowCount}
              onMapChange={setMapping}
              onConditionMapChange={setConditionMapping}
              onPrefixChange={setPrefix}
              onNameColumnChange={setNameColumn}
              onEmailColumnChange={setEmailColumn}
              onGenerate={generate}
              onSendForSignature={sendForSignature}
              templateFile={state.templateFile}
              csvFile={state.csvFile}
              csvRows={state.csvRows}
              csvColumns={state.csvColumns}
              previewRowIndex={state.previewRowIndex}
              previewUrl={state.previewUrl}
              previewLoading={state.previewLoading}
              previewError={state.previewError}
              onPreviewRowIndexChange={setPreviewRowIndex}
              onGeneratePreview={generatePreview}
            />
          </div>
        )}

        {state.step === 'generating' && (
          <div className="text-center py-16">
            <div className="animate-spin h-8 w-8 border-2 border-gray-900
                            border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500 text-sm">
              {t('generating.message', { count: state.csvRowCount })}
            </p>
          </div>
        )}

        {state.step === 'done' && (
          <div className="text-center py-16">
            <svg className="w-10 h-10 mx-auto mb-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {state.signingDocuments ? (
              <>
                <p className="text-lg font-medium text-gray-900">
                  {state.signingDocuments.length} documents
                </p>
                <Link
                  to={`/${locale}/signing/${state.jobId}`}
                  className="inline-block mt-6 px-6 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  {t('signing.dashboard_title')}
                </Link>
                <button
                  onClick={reset}
                  className="mt-4 block mx-auto px-6 py-2 border border-gray-300 rounded-md text-sm
                             text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t('done.restart')}
                </button>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-green-700">
                  {t('done.title', { count: state.csvRowCount })}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {t('done.subtitle')}
                </p>
                <button
                  onClick={reset}
                  className="mt-6 px-6 py-2 border border-gray-300 rounded-md text-sm
                             text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t('done.restart')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
