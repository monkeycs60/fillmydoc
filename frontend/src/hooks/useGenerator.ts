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
  step: 'upload' | 'mapping' | 'generating' | 'done'
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

        return {
          ...s,
          csvFile: file,
          csvColumns: columns,
          csvRowCount: result.data.length,
          mapping: { ...s.mapping, ...autoMapping },
          nameColumn: columns[0] || '',
          error: null,
          step: s.templateFile && s.templateVariables.length > 0 ? 'mapping' : 'upload'
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

  const generate = async() => {
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
