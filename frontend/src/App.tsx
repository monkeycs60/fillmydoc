import { FileUpload } from './components/FileUpload'
import { MappingStep } from './components/MappingStep'
import { useGenerator } from './hooks/useGenerator'

function App() {
  const {
    state, setTemplate, setCsv, setMapping,
    setPrefix, setNameColumn, generate, reset
  } = useGenerator()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">FillMyDoc</h1>
          <p className="text-gray-500 mt-2">
            Template Word + CSV → documents PDF en un clic
          </p>
        </div>

        {state.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {state.error}
          </div>
        )}

        {state.step === 'upload' && (
          <div className="space-y-4">
            <FileUpload
              label="Template Word"
              accept=".docx"
              file={state.templateFile}
              onFileSelect={setTemplate}
              hint="Glissez votre .docx avec des {variables}"
            />
            <FileUpload
              label="Fichier CSV"
              accept=".csv"
              file={state.csvFile}
              onFileSelect={setCsv}
              hint="Glissez votre .csv avec les données"
            />
            {state.templateFile && state.csvFile && state.templateVariables.length > 0 && (
              <p className="text-center text-sm text-green-600">
                {state.templateVariables.length} variables détectées,{' '}
                {state.csvRowCount} lignes dans le CSV
              </p>
            )}
          </div>
        )}

        {state.step === 'mapping' && (
          <div>
            <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
              ← Recommencer
            </button>
            <MappingStep
              variables={state.templateVariables}
              columns={state.csvColumns}
              mapping={state.mapping}
              prefix={state.prefix}
              nameColumn={state.nameColumn}
              csvRowCount={state.csvRowCount}
              onMapChange={setMapping}
              onPrefixChange={setPrefix}
              onNameColumnChange={setNameColumn}
              onGenerate={generate}
            />
          </div>
        )}

        {state.step === 'generating' && (
          <div className="text-center py-16">
            <div className="animate-spin h-10 w-10 border-4 border-blue-500
                            border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">
              Génération de {state.csvRowCount} documents en cours...
            </p>
          </div>
        )}

        {state.step === 'done' && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">✓</div>
            <p className="text-lg font-medium text-green-700">
              {state.csvRowCount} documents générés !
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Le zip a été téléchargé automatiquement.
            </p>
            <button
              onClick={reset}
              className="mt-6 px-6 py-2 bg-gray-100 rounded-lg text-sm
                         hover:bg-gray-200 transition-colors"
            >
              Générer d'autres documents
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
