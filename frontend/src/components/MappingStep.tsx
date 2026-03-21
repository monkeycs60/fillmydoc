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
}

export function MappingStep({
  variables, columns, mapping, prefix, nameColumn,
  csvRowCount, onMapChange, onPrefixChange, onNameColumnChange, onGenerate
}: MappingStepProps) {
  const allMapped = variables.every(v => mapping[v])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Mapping des variables
        </h2>
        <div className="space-y-3">
          {variables.map(variable => (
            <div key={variable} className="flex items-center gap-4">
              <span className="w-48 text-sm font-mono bg-gray-100 px-3 py-2 rounded">
                {`{${variable}}`}
              </span>
              <span className="text-gray-400">→</span>
              <select
                value={mapping[variable] || ''}
                onChange={(e) => onMapChange(variable, e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">-- Choisir une colonne --</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Nommage des fichiers
        </h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={prefix}
            onChange={(e) => onPrefixChange(e.target.value)}
            placeholder="Préfixe (ex: contrat)"
            className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <span className="text-gray-400">_</span>
          <select
            value={nameColumn}
            onChange={(e) => onNameColumnChange(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {columns.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
          <span className="text-sm text-gray-400">.pdf</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Exemple: {prefix || 'document'}_{nameColumn ? `[${nameColumn}]` : '001'}.pdf
        </p>
      </div>

      <button
        onClick={onGenerate}
        disabled={!allMapped}
        className="w-full py-3 rounded-xl font-semibold text-white
                   bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300
                   disabled:cursor-not-allowed transition-colors"
      >
        Générer {csvRowCount} documents PDF
      </button>
    </div>
  )
}
