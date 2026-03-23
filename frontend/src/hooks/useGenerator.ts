import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'

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
    previewError: null
  })

  const previewAbortRef = useRef<AbortController | null>(null)

  const setTemplate = async(file: File) => {
    const formData = new FormData()
    formData.append('template', file)

    try {
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
        templateConditions: data.conditions || [],
        error: null,
        step: s.csvFile ? 'mapping' : 'upload'
      }))
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
        skipEmptyLines: true
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
          step: s.templateFile && (s.templateVariables.length > 0 || s.templateConditions.length > 0) ? 'mapping' : 'upload'
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

  const setConditionMapping = (condition: string, column: string) => {
    setState(s => ({
      ...s,
      conditionsMapping: { ...s.conditionsMapping, [condition]: column }
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

  const generate = async() => {
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
        error: err instanceof Error ? err.message : 'Unknown error'
      }))
    }
  }

  const sendForSignature = async() => {
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
        signingDocuments: data.documents
      }))
    } catch (err) {
      setState(s => ({
        ...s,
        step: 'mapping',
        error: err instanceof Error ? err.message : 'Unknown error'
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
    setState({
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
      previewError: null
    })
  }

  return {
    state, setTemplate, setCsv, setMapping, setConditionMapping,
    setPrefix, setNameColumn, setEmailColumn, generate, sendForSignature, reset,
    setPreviewRowIndex, generatePreview
  }
}
