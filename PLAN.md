# FillMyDoc — Plan d'implémentation MVP

## Vue d'ensemble
Web app de génération batch de documents. Upload Word template + CSV → mapping visuel → génère X PDF personnalisés en un zip.

## Architecture

```
┌─────────────────────┐         ┌─────────────────────────────┐
│   Frontend          │         │   Backend (VPS Hetzner)      │
│   React + Vite      │  POST   │   Hono + Node.js             │
│   Tailwind CSS      │ ──────► │                              │
│   Cloudflare Pages  │  /gen   │   docxtemplater (variables)  │
│                     │ ◄────── │   LibreOffice headless (PDF) │
│                     │  .zip   │   archiver (zip)             │
└─────────────────────┘         └─────────────────────────────┘
```

**Flow:**
1. Frontend: user upload .docx + .csv
2. Frontend: parse CSV (PapaParse), extraire variables du .docx (docxtemplater via backend)
3. Frontend: mapping visuel variables ↔ colonnes CSV
4. Frontend: envoie template + CSV + mapping config au backend
5. Backend: docxtemplater remplit chaque document
6. Backend: LibreOffice headless convertit .docx → PDF
7. Backend: archiver crée le zip
8. Backend: renvoie le zip au frontend
9. Frontend: téléchargement automatique

---

## Tâche 1 — Setup projet backend

**But:** Initialiser le serveur Hono avec TypeScript sur Node.js

**Fichiers à créer:**
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/src/index.ts`

**Steps:**
```bash
mkdir -p ~/Desktop/fillmydoc/backend
cd ~/Desktop/fillmydoc/backend
npm init -y
npm install hono @hono/node-server
npm install -D typescript @types/node tsx
```

**`backend/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**`backend/package.json`** — ajouter:
```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**`backend/src/index.ts`:**
```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'

const app = new Hono()

app.use('*', cors())

app.get('/health', (c) => c.json({ status: 'ok' }))

serve({ fetch: app.fetch, port: 3001 })
console.log('FillMyDoc backend running on http://localhost:3001')
```

**Vérification:**
```bash
npm run dev
curl http://localhost:3001/health
# Doit retourner {"status":"ok"}
```

---

## Tâche 2 — Setup projet frontend

**But:** Initialiser le frontend React + Vite + Tailwind

**Steps:**
```bash
cd ~/Desktop/fillmydoc
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
```

**`frontend/vite.config.ts`:**
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
```

**`frontend/src/index.css`:**
```css
@import 'tailwindcss';
```

**`frontend/src/App.tsx`** — remplacer par:
```tsx
function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <h1 className="text-3xl font-bold text-gray-900">FillMyDoc</h1>
    </div>
  )
}
export default App
```

**Vérification:**
```bash
npm run dev
# Ouvrir http://localhost:5173 — doit afficher "FillMyDoc"
```

---

## Tâche 3 — Endpoint d'extraction de variables du template Word

**But:** Le backend reçoit un .docx, extrait toutes les `{variables}`, les renvoie au frontend

**Installer les dépendances:**
```bash
cd ~/Desktop/fillmydoc/backend
npm install docxtemplater pizzip
npm install -D @types/pizzip
```

**Créer `backend/src/routes/template.ts`:**
```typescript
import { Hono } from 'hono'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

const template = new Hono()

template.post('/parse', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('template') as File
  if (!file) return c.json({ error: 'No template file' }, 400)

  const buffer = Buffer.from(await file.arrayBuffer())
  const zip = new PizZip(buffer)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Mode qui ne crash pas sur les variables manquantes
    nullGetter: () => ''
  })

  // Extraire les variables en parsant le XML interne du docx
  const xmlFiles = zip.file(/word\/(document|header|footer)\d*\.xml/)
  const variableRegex = /\{([^{}]+)\}/g
  const variables = new Set<string>()

  for (const xmlFile of xmlFiles) {
    // Le texte dans un docx peut être splitté en plusieurs XML runs
    // On doit d'abord reconstruire le texte complet
    const content = xmlFile.asText()
    let match
    while ((match = variableRegex.exec(content)) !== null) {
      // Ignorer les variables avec des caractères spéciaux (XML tags)
      const varName = match[1].trim()
      if (varName && !varName.includes('<') && !varName.includes('>')) {
        variables.add(varName)
      }
    }
  }

  return c.json({
    variables: Array.from(variables),
    filename: file.name
  })
})

export default template
```

**IMPORTANT — Pitfall docxtemplater:** Les variables `{nom}` dans Word peuvent être splittées en plusieurs XML runs (`<w:r>`) par Word. Par exemple `{nom}` peut devenir `{` + `nom` + `}` dans le XML. **Docxtemplater gère ce problème automatiquement lors du render**, mais pour l'extraction, on doit utiliser l'InspectModule ou parser le contenu après que docxtemplater l'a normalisé.

**Approche plus fiable — utiliser docxtemplater lui-même pour extraire:**
```typescript
// Alternative plus fiable pour extraire les variables
import InspectModule from 'docxtemplater/js/inspect-module.js'

template.post('/parse', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('template') as File
  if (!file) return c.json({ error: 'No template file' }, 400)

  const buffer = Buffer.from(await file.arrayBuffer())
  const zip = new PizZip(buffer)

  const inspectModule = new InspectModule()
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [inspectModule]
  })
  doc.render({}) // render vide pour déclencher l'inspection

  const tags = inspectModule.getAllTags()
  // tags = { nom: {}, adresse: {}, conditions: {} }
  const variables = Object.keys(tags)

  return c.json({ variables, filename: file.name })
})
```

**Brancher dans `backend/src/index.ts`:**
```typescript
import template from './routes/template.js'

app.route('/api/template', template)
```

**Vérification:**
- Créer un fichier Word test avec `{nom}` et `{adresse}` dedans
- `curl -F "template=@test.docx" http://localhost:3001/api/template/parse`
- Doit retourner `{"variables":["nom","adresse"],"filename":"test.docx"}`

---

## Tâche 4 — Endpoint de génération batch

**But:** Reçoit template + CSV + mapping → génère les documents remplis → convertit en PDF → renvoie zip

**Installer les dépendances:**
```bash
cd ~/Desktop/fillmydoc/backend
npm install papaparse archiver
npm install -D @types/papaparse @types/archiver
```

**Créer `backend/src/routes/generate.ts`:**
```typescript
import { Hono } from 'hono'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import Papa from 'papaparse'
import archiver from 'archiver'
import { writeFile, readFile, mkdir, rm } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'

const execFileAsync = promisify(execFile)

const generate = new Hono()

generate.post('/', async (c) => {
  const formData = await c.req.formData()
  const templateFile = formData.get('template') as File
  const csvFile = formData.get('csv') as File
  const mappingJson = formData.get('mapping') as string // JSON string
  const prefixValue = formData.get('prefix') as string || ''
  const nameColumn = formData.get('nameColumn') as string // colonne CSV pour nommer les fichiers

  if (!templateFile || !csvFile || !mappingJson) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  // Parse le mapping: { variableWord: colonneCSV }
  const mapping: Record<string, string> = JSON.parse(mappingJson)

  // Parse le CSV
  const csvText = await csvFile.text()
  const csvResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true
  })
  const rows = csvResult.data

  // Lire le template
  const templateBuffer = Buffer.from(await templateFile.arrayBuffer())

  // Créer un dossier temp pour cette génération
  const jobId = randomUUID()
  const tmpDir = join('/tmp', 'fillmydoc', jobId)
  const docxDir = join(tmpDir, 'docx')
  const pdfDir = join(tmpDir, 'pdf')
  await mkdir(docxDir, { recursive: true })
  await mkdir(pdfDir, { recursive: true })

  try {
    // Générer chaque document
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      // Construire les données pour docxtemplater à partir du mapping
      const data: Record<string, string> = {}
      for (const [variable, csvColumn] of Object.entries(mapping)) {
        data[variable] = row[csvColumn] || ''
      }

      // Remplir le template
      const zip = new PizZip(templateBuffer)
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => ''
      })
      doc.render(data)
      const docBuffer = doc.getZip().generate({ type: 'nodebuffer' })

      // Nommer le fichier
      const fileLabel = nameColumn && row[nameColumn]
        ? row[nameColumn].replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_')
        : String(i + 1).padStart(3, '0')
      const fileName = prefixValue
        ? `${prefixValue}_${fileLabel}`
        : fileLabel

      await writeFile(join(docxDir, `${fileName}.docx`), docBuffer)
    }

    // Convertir tous les .docx en PDF via LibreOffice headless
    await execFileAsync('soffice', [
      '--headless',
      '--nodefault',
      '--nolockcheck',
      '--nologo',
      '--norestore',
      '--convert-to', 'pdf',
      '--outdir', pdfDir,
      ...rows.map((_, i) => {
        const row = rows[i]
        const fileLabel = nameColumn && row[nameColumn]
          ? row[nameColumn].replace(/[^a-zA-Z0-9À-ÿ_-]/g, '_')
          : String(i + 1).padStart(3, '0')
        const fileName = prefixValue ? `${prefixValue}_${fileLabel}` : fileLabel
        return join(docxDir, `${fileName}.docx`)
      })
    ], { timeout: 120000 }) // 2 min timeout

    // Créer le zip des PDF
    const archive = archiver('zip', { zlib: { level: 6 } })
    const chunks: Buffer[] = []

    await new Promise<void>((resolve, reject) => {
      archive.on('data', (chunk) => chunks.push(chunk))
      archive.on('end', resolve)
      archive.on('error', reject)

      // Ajouter tous les PDF au zip
      archive.directory(pdfDir, false)
      archive.finalize()
    })

    const zipBuffer = Buffer.concat(chunks)

    // Cleanup
    await rm(tmpDir, { recursive: true, force: true })

    // Renvoyer le zip
    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="fillmydoc_${jobId.slice(0, 8)}.zip"`,
        'Content-Length': String(zipBuffer.length)
      }
    })
  } catch (error) {
    // Cleanup en cas d'erreur
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    console.error('Generation error:', error)
    return c.json({ error: 'Generation failed' }, 500)
  }
})

export default generate
```

**Brancher dans `backend/src/index.ts`:**
```typescript
import generate from './routes/generate.js'

app.route('/api/generate', generate)
```

**Vérification:**
- Créer un Word test avec `{nom}` et `{ville}`
- Créer un CSV: `nom,ville\nAlice,Paris\nBob,Lyon`
- ```bash
  curl -X POST http://localhost:3001/api/generate \
    -F "template=@test.docx" \
    -F "csv=@test.csv" \
    -F 'mapping={"nom":"nom","ville":"ville"}' \
    -F "nameColumn=nom" \
    -F "prefix=contrat" \
    --output result.zip
  ```
- Dézipper `result.zip` → doit contenir `contrat_Alice.pdf` et `contrat_Bob.pdf`

---

## Tâche 5 — UI: Upload des fichiers et parsing

**But:** Interface d'upload Word + CSV avec drag & drop, parsing côté client du CSV pour extraire les headers

**Installer PapaParse côté frontend:**
```bash
cd ~/Desktop/fillmydoc/frontend
npm install papaparse
npm install -D @types/papaparse
```

**Créer `frontend/src/components/FileUpload.tsx`:**
```tsx
import { useCallback } from 'react'

interface FileUploadProps {
  label: string
  accept: string
  file: File | null
  onFileSelect: (file: File) => void
  hint: string
}

export function FileUpload({ label, accept, file, onFileSelect, hint }: FileUploadProps) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) onFileSelect(droppedFile)
  }, [onFileSelect])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) onFileSelect(selectedFile)
  }, [onFileSelect])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center
                 hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        id={`upload-${label}`}
      />
      <label htmlFor={`upload-${label}`} className="cursor-pointer">
        {file ? (
          <div>
            <p className="text-lg font-medium text-green-700">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-medium text-gray-700">{label}</p>
            <p className="text-sm text-gray-400 mt-1">{hint}</p>
          </div>
        )}
      </label>
    </div>
  )
}
```

**Créer `frontend/src/hooks/useGenerator.ts`:**
```tsx
import { useState } from 'react'
import Papa from 'papaparse'

export interface GeneratorState {
  templateFile: File | null
  csvFile: File | null
  templateVariables: string[]
  csvColumns: string[]
  csvRowCount: number
  mapping: Record<string, string>
  prefix: string
  nameColumn: string
  step: 'upload' | 'mapping' | 'preview' | 'generating' | 'done'
  error: string | null
}

export function useGenerator() {
  const [state, setState] = useState<GeneratorState>({
    templateFile: null,
    csvFile: null,
    templateVariables: [],
    csvColumns: [],
    csvRowCount: 0,
    mapping: {},
    prefix: '',
    nameColumn: '',
    step: 'upload',
    error: null
  })

  const setTemplate = async (file: File) => {
    // Envoyer au backend pour extraire les variables
    const formData = new FormData()
    formData.append('template', file)
    const res = await fetch('/api/template/parse', { method: 'POST', body: formData })
    const data = await res.json()

    if (data.error) {
      setState(s => ({ ...s, error: data.error }))
      return
    }

    setState(s => ({
      ...s,
      templateFile: file,
      templateVariables: data.variables,
      error: null,
      // Passer au step mapping si CSV déjà uploadé
      step: s.csvFile ? 'mapping' : 'upload'
    }))
  }

  const setCsv = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true
      })

      const columns = result.meta.fields || []

      setState(s => {
        // Auto-match: si un nom de variable == un nom de colonne
        const autoMapping: Record<string, string> = {}
        for (const variable of s.templateVariables) {
          const match = columns.find(
            col => col.toLowerCase().trim() === variable.toLowerCase().trim()
          )
          if (match) autoMapping[variable] = match
        }

        return {
          ...s,
          csvFile: file,
          csvColumns: columns,
          csvRowCount: result.data.length,
          mapping: autoMapping,
          nameColumn: columns[0] || '',
          error: null,
          step: s.templateFile ? 'mapping' : 'upload'
        }
      })
    }
    reader.readAsText(file)
  }

  const setMapping = (variable: string, column: string) => {
    setState(s => ({
      ...s,
      mapping: { ...s.mapping, [variable]: column }
    }))
  }

  const setPrefix = (prefix: string) => setState(s => ({ ...s, prefix }))
  const setNameColumn = (col: string) => setState(s => ({ ...s, nameColumn: col }))

  const generate = async () => {
    if (!state.templateFile || !state.csvFile) return

    setState(s => ({ ...s, step: 'generating', error: null }))

    try {
      const formData = new FormData()
      formData.append('template', state.templateFile)
      formData.append('csv', state.csvFile)
      formData.append('mapping', JSON.stringify(state.mapping))
      formData.append('prefix', state.prefix)
      formData.append('nameColumn', state.nameColumn)

      const res = await fetch('/api/generate', { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Generation failed')
      }

      // Télécharger le zip
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fillmydoc_${Date.now()}.zip`
      a.click()
      URL.revokeObjectURL(url)

      setState(s => ({ ...s, step: 'done' }))
    } catch (err) {
      setState(s => ({
        ...s,
        step: 'mapping',
        error: err instanceof Error ? err.message : 'Unknown error'
      }))
    }
  }

  const reset = () => setState({
    templateFile: null,
    csvFile: null,
    templateVariables: [],
    csvColumns: [],
    csvRowCount: 0,
    mapping: {},
    prefix: '',
    nameColumn: '',
    step: 'upload',
    error: null
  })

  return { state, setTemplate, setCsv, setMapping, setPrefix, setNameColumn, generate, reset }
}
```

**Vérification:**
- Les hooks compilent sans erreur
- Le composant FileUpload s'affiche correctement

---

## Tâche 6 — UI: Écran de mapping visuel

**But:** Interface de mapping variables ↔ colonnes CSV avec dropdowns, nommage des fichiers, et bouton générer

**Créer `frontend/src/components/MappingStep.tsx`:**
```tsx
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
      {/* Mapping des variables */}
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
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
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

      {/* Nommage des fichiers */}
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
            className="w-48 border rounded-lg px-3 py-2 text-sm"
          />
          <span className="text-gray-400">_</span>
          <select
            value={nameColumn}
            onChange={(e) => onNameColumnChange(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          >
            {columns.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
          <span className="text-sm text-gray-400">.pdf</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Exemple: {prefix || 'document'}_{nameColumn ? `[${nameColumn}]` : '001'}.pdf
        </p>
      </div>

      {/* Bouton générer */}
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
```

**Vérification:**
- Les dropdowns affichent les colonnes CSV
- L'auto-match remplit les colonnes qui correspondent
- Le bouton est disabled tant que toutes les variables ne sont pas mappées

---

## Tâche 7 — UI: Assemblage App.tsx complet

**But:** Assembler tous les composants dans un flow step-by-step

**Réécrire `frontend/src/App.tsx`:**
```tsx
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
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">FillMyDoc</h1>
          <p className="text-gray-500 mt-2">
            Template Word + CSV → documents PDF en un clic
          </p>
        </div>

        {/* Erreur */}
        {state.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {state.error}
          </div>
        )}

        {/* Step: Upload */}
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

        {/* Step: Mapping */}
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

        {/* Step: Generating */}
        {state.step === 'generating' && (
          <div className="text-center py-16">
            <div className="animate-spin h-10 w-10 border-4 border-blue-500
                            border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">
              Génération de {state.csvRowCount} documents en cours...
            </p>
          </div>
        )}

        {/* Step: Done */}
        {state.step === 'done' && (
          <div className="text-center py-16">
            <p className="text-2xl mb-2">✓</p>
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
```

**Vérification:**
- Le flow complet fonctionne: upload → mapping → générer → download zip
- Tester avec un Word template et un CSV de 3 lignes
- Vérifier que les PDF sont correctement remplis

---

## Tâche 8 — Setup VPS Hetzner et déploiement

**But:** Déployer le backend sur un VPS Hetzner avec LibreOffice headless

**Steps sur le VPS (après création Hetzner Cloud, Debian 12, €4/mois):**
```bash
# Installer les dépendances système
sudo apt update && sudo apt install -y nodejs npm libreoffice-writer-nogui

# Vérifier LibreOffice
soffice --headless --version

# Cloner le repo (ou scp les fichiers)
# cd ~/fillmydoc/backend
# npm install
# npm run build
# npm start
```

**Nginx reverse proxy (optionnel mais recommandé):**
```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# /etc/nginx/sites-available/fillmydoc
server {
    server_name api.fillmydoc.com;
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        client_max_body_size 50M;
    }
}
```

**PM2 pour garder le process en vie:**
```bash
npm install -g pm2
pm2 start dist/index.js --name fillmydoc
pm2 save
pm2 startup
```

**Frontend — déployer sur Cloudflare Pages:**
```bash
cd frontend
npm run build
# Connecter le repo GitHub à Cloudflare Pages
# Build command: npm run build
# Output directory: dist
```

**Variables d'environnement frontend (production):**
Dans `frontend/.env.production`:
```
VITE_API_URL=https://api.fillmydoc.com
```

Adapter les fetch dans `useGenerator.ts` pour utiliser `import.meta.env.VITE_API_URL || ''` comme base URL.

**Vérification:**
- `curl https://api.fillmydoc.com/health` retourne OK
- Le frontend sur fillmydoc.com peut générer des documents
- LibreOffice convertit correctement les .docx en PDF sur le VPS

---

## Ordre d'exécution recommandé

| # | Tâche | Durée estimée | Dépend de |
|---|-------|--------------|-----------|
| 1 | Setup backend | 15 min | — |
| 2 | Setup frontend | 15 min | — |
| 3 | Endpoint extraction variables | 45 min | 1 |
| 4 | Endpoint génération batch | 1h30 | 1, 3 |
| 5 | UI upload + parsing | 45 min | 2 |
| 6 | UI mapping visuel | 45 min | 5 |
| 7 | Assemblage App.tsx | 30 min | 5, 6 |
| 8 | Déploiement VPS | 1h | 1-7 |

**Total estimé: ~6h de dev** — faisable en un weekend.
