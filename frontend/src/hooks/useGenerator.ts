import { useState, useRef, useEffect, useCallback } from 'react'
import Papa from 'papaparse'

export interface SavedTemplate {
  id: string
  name: string
  templateHash: string | null
  variables: string[]
  conditions: string[]
  mapping: Record<string, string>
  conditionsMapping: Record<string, string>
  prefix: string
  nameColumn: string
  emailColumn: string
  createdAt: string
  updatedAt: string
}

export interface GeneratorState {
  templateFile: File | null
  csvFile: File | null
  templateVariables: string[]
  templateConditions: string[]
  csvColumns: string[]
  csvRows: Record<string, string>[]
  csvRowCount: number
  mapping: Record<string, string>
  conditionsMapping: Record<string, string>
  prefix: string
  nameColumn: string
  emailColumn: string
  step: 'upload' | 'mapping' | 'generating' | 'done'
  error: string | null
  jobId: string | null
  signingDocuments: Array<{ id: string; fileName: string; recipientName: string | null; status: string; signingUrl: string }> | null
  previewRowIndex: number
  previewUrl: string | null
  previewLoading: boolean
  previewError: string | null
  savedTemplates: SavedTemplate[]
  templateHash: string | null
  matchedTemplate: SavedTemplate | null
  savedTemplatesLoaded: boolean
}

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export function useGenerator() {
  const [state, setState] = useState<GeneratorState>({
    templateFile: null,
    csvFile: null,
    templateVariables: [],
    templateConditions: [],
    csvColumns: [],
    csvRows: [],
    csvRowCount: 0,
    mapping: {},
    conditionsMapping: {},
    prefix: '',
    nameColumn: '',
    emailColumn: '',
    step: 'upload',
    error: null,
    jobId: null,
    signingDocuments: null,
    previewRowIndex: 0,
    previewUrl: null,
    previewLoading: false,
    previewError: null,
    savedTemplates: [],
    templateHash: null,
    matchedTemplate: null,
    savedTemplatesLoaded: false,
  })

  const previewAbortRef = useRef<AbortController | null>(null)

  // Load saved templates on mount
  const loadSavedTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-templates')
      const data = await res.json()
      setState(s => ({
        ...s,
        savedTemplates: data.templates || [],
        savedTemplatesLoaded: true,
      }))
    } catch {
      setState(s => ({ ...s, savedTemplatesLoaded: true }))
    }
  }, [])

  useEffect(() => {
    loadSavedTemplates()
  }, [loadSavedTemplates])

  const matchTemplateByHash = useCallback(async (hash: string) => {
    try {
      const res = await fetch(`/api/saved-templates/match/${hash}`)
      const data = await res.json()
      if (data.match) {
        setState(s => ({ ...s, matchedTemplate: data.match }))
      }
    } catch {
      // silently ignore match failures
    }
  }, [])

  const setTemplate = async (file: File) => {
    const formData = new FormData()
    formData.append('template', file)

    try {
      const [res, hash] = await Promise.all([
        fetch('/api/template/parse', { method: 'POST', body: formData }),
        computeFileHash(file),
      ])
      const data = await res.json()

      if (data.error) {
        setState(s => ({ ...s, error: data.error }))
        return
      }

      setState(s => ({
        ...s,
        templateFile: file,
        templateVariables: data.variables,
        templateConditions: data.conditions || [],
        templateHash: hash,
        matchedTemplate: null,
        error: null,
        step: s.csvFile ? 'mapping' : 'upload',
      }))

      // Check for auto-match
      matchTemplateByHash(hash)
    } catch {
      setState(s => ({ ...s, error: 'Failed to parse template' }))
    }
  }

  const setCsv = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      })

      const columns = result.meta.fields || []

      setState(s => {
        const autoMapping: Record<string, string> = {}
        for (const variable of s.templateVariables) {
          const match = columns.find(
            col => col.toLowerCase().trim() === variable.toLowerCase().trim()
          )
          if (match) autoMapping[variable] = match
        }

        const autoConditionsMapping: Record<string, string> = {}
        for (const condition of s.templateConditions) {
          const match = columns.find(
            col => col.toLowerCase().trim() === condition.toLowerCase().trim()
          )
          if (match) autoConditionsMapping[condition] = match
        }

        return {
          ...s,
          csvFile: file,
          csvColumns: columns,
          csvRows: result.data,
          csvRowCount: result.data.length,
          mapping: { ...s.mapping, ...autoMapping },
          conditionsMapping: { ...s.conditionsMapping, ...autoConditionsMapping },
          nameColumn: columns[0] || '',
          error: null,
          step: s.templateFile && (s.templateVariables.length > 0 || s.templateConditions.length > 0) ? 'mapping' : 'upload',
        }
      })
    }
    reader.readAsText(file)
  }

  const setMapping = (variable: string, column: string) => {
    setState(s => ({
      ...s,
      mapping: { ...s.mapping, [variable]: column },
    }))
  }

  const setConditionMapping = (condition: string, column: string) => {
    setState(s => ({
      ...s,
      conditionsMapping: { ...s.conditionsMapping, [condition]: column },
    }))
  }

  const setPrefix = (prefix: string) => setState(s => ({ ...s, prefix }))
  const setNameColumn = (col: string) => setState(s => ({ ...s, nameColumn: col }))
  const setEmailColumn = (col: string) => setState(s => ({ ...s, emailColumn: col }))

  const setPreviewRowIndex = (index: number) => {
    setState(s => ({ ...s, previewRowIndex: index }))
  }

  const generatePreview = useCallback(async (
    templateFile: File,
    csvFile: File,
    mapping: Record<string, string>,
    conditionsMapping: Record<string, string>,
    rowIndex: number
  ) => {
    // Abort any in-flight preview request
    if (previewAbortRef.current) {
      previewAbortRef.current.abort()
    }

    const abortController = new AbortController()
    previewAbortRef.current = abortController

    // Check that at least one variable is mapped
    const hasMappings = Object.values(mapping).some(v => v !== '')
    if (!hasMappings) {
      return
    }

    setState(s => ({ ...s, previewLoading: true, previewError: null }))

    try {
      const formData = new FormData()
      formData.append('template', templateFile)
      formData.append('csv', csvFile)
      formData.append('mapping', JSON.stringify(mapping))
      formData.append('conditions', JSON.stringify(conditionsMapping))
      formData.append('rowIndex', String(rowIndex))

      const res = await fetch('/api/generate/preview', {
        method: 'POST',
        body: formData,
        signal: abortController.signal
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Preview generation failed')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      setState(s => {
        // Revoke old preview URL
        if (s.previewUrl) {
          URL.revokeObjectURL(s.previewUrl)
        }
        return { ...s, previewUrl: url, previewLoading: false, previewError: null }
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return // Silently ignore aborted requests
      }
      setState(s => ({
        ...s,
        previewLoading: false,
        previewError: err instanceof Error ? err.message : 'Preview failed'
      }))
    }
  }, [])

  const saveTemplate = async (name: string) => {
    try {
      const res = await fetch('/api/saved-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          templateHash: state.templateHash,
          variables: state.templateVariables,
          conditions: state.templateConditions,
          mapping: state.mapping,
          conditionsMapping: state.conditionsMapping,
          prefix: state.prefix,
          nameColumn: state.nameColumn,
          emailColumn: state.emailColumn,
        }),
      })
      const data = await res.json()

      if (res.ok) {
        setState(s => ({
          ...s,
          savedTemplates: [...s.savedTemplates, data],
          matchedTemplate: data,
        }))
        return data as SavedTemplate
      }
      return null
    } catch {
      return null
    }
  }

  const updateSavedTemplate = async (id: string, updates: Partial<Pick<SavedTemplate, 'name' | 'mapping' | 'conditionsMapping' | 'prefix' | 'nameColumn' | 'emailColumn'>>) => {
    try {
      const res = await fetch(`/api/saved-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()

      if (res.ok) {
        setState(s => ({
          ...s,
          savedTemplates: s.savedTemplates.map(t => t.id === id ? data : t),
          matchedTemplate: s.matchedTemplate?.id === id ? data : s.matchedTemplate,
        }))
        return data as SavedTemplate
      }
      return null
    } catch {
      return null
    }
  }

  const deleteSavedTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/saved-templates/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setState(s => ({
          ...s,
          savedTemplates: s.savedTemplates.filter(t => t.id !== id),
          matchedTemplate: s.matchedTemplate?.id === id ? null : s.matchedTemplate,
        }))
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const loadSavedTemplate = (template: SavedTemplate) => {
    setState(s => ({
      ...s,
      mapping: template.mapping,
      conditionsMapping: template.conditionsMapping,
      prefix: template.prefix,
      nameColumn: template.nameColumn,
      emailColumn: template.emailColumn,
      matchedTemplate: template,
    }))
  }

  const dismissMatch = () => {
    setState(s => ({ ...s, matchedTemplate: null }))
  }

  const generate = async () => {
    if (!state.templateFile || !state.csvFile) return

    setState(s => ({ ...s, step: 'generating', error: null }))

    try {
      const formData = new FormData()
      formData.append('template', state.templateFile)
      formData.append('csv', state.csvFile)
      formData.append('mapping', JSON.stringify(state.mapping))
      formData.append('conditions', JSON.stringify(state.conditionsMapping))
      formData.append('prefix', state.prefix)
      formData.append('nameColumn', state.nameColumn)
      if (state.emailColumn) formData.append('emailColumn', state.emailColumn)

      const res = await fetch('/api/generate', { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Generation failed')
      }

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
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }

  const sendForSignature = async () => {
    if (!state.templateFile || !state.csvFile) return

    setState(s => ({ ...s, step: 'generating', error: null }))

    try {
      const formData = new FormData()
      formData.append('template', state.templateFile)
      formData.append('csv', state.csvFile)
      formData.append('mapping', JSON.stringify(state.mapping))
      formData.append('conditions', JSON.stringify(state.conditionsMapping))
      formData.append('prefix', state.prefix)
      formData.append('nameColumn', state.nameColumn)
      if (state.emailColumn) formData.append('emailColumn', state.emailColumn)
      formData.append('mode', 'sign')

      const res = await fetch('/api/generate', { method: 'POST', body: formData })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Generation failed')
      }

      const data = await res.json()

      setState(s => ({
        ...s,
        step: 'done',
        jobId: data.jobId,
        signingDocuments: data.documents,
      }))
    } catch (err) {
      setState(s => ({
        ...s,
        step: 'mapping',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }

  const reset = () => {
    // Clean up preview URL
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl)
    }
    if (previewAbortRef.current) {
      previewAbortRef.current.abort()
    }
    setState(s => ({
      templateFile: null,
      csvFile: null,
      templateVariables: [],
      templateConditions: [],
      csvColumns: [],
      csvRows: [],
      csvRowCount: 0,
      mapping: {},
      conditionsMapping: {},
      prefix: '',
      nameColumn: '',
      emailColumn: '',
      step: 'upload',
      error: null,
      jobId: null,
      signingDocuments: null,
      previewRowIndex: 0,
      previewUrl: null,
      previewLoading: false,
      previewError: null,
      savedTemplates: s.savedTemplates,
      templateHash: null,
      matchedTemplate: null,
      savedTemplatesLoaded: s.savedTemplatesLoaded,
    }))
  }

  return {
    state,
    setTemplate,
    setCsv,
    setMapping,
    setConditionMapping,
    setPrefix,
    setNameColumn,
    setEmailColumn,
    generate,
    sendForSignature,
    reset,
    setPreviewRowIndex,
    generatePreview,
    saveTemplate,
    updateSavedTemplate,
    deleteSavedTemplate,
    loadSavedTemplate,
    dismissMatch,
  }
}
