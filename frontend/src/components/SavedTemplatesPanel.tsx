import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SavedTemplate } from '../hooks/useGenerator'

interface SavedTemplatesPanelProps {
  savedTemplates: SavedTemplate[]
  onLoad: (template: SavedTemplate) => void
  onDelete: (id: string) => Promise<boolean>
  onRename: (id: string, name: string) => Promise<SavedTemplate | null>
}

export function SavedTemplatesPanel({ savedTemplates, onLoad, onDelete, onRename }: SavedTemplatesPanelProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (savedTemplates.length === 0) return null

  const startRename = (template: SavedTemplate) => {
    setEditingId(template.id)
    setEditName(template.name)
  }

  const confirmRename = async (id: string) => {
    if (editName.trim()) {
      await onRename(id, editName.trim())
    }
    setEditingId(null)
    setEditName('')
  }

  const confirmDelete = async (id: string) => {
    await onDelete(id)
    setDeletingId(null)
  }

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
        {t('saved_templates.title')}
      </h2>
      <div className="space-y-2">
        {savedTemplates.map(template => (
          <div
            key={template.id}
            className="flex items-center gap-2 border border-gray-100 rounded-lg px-3 py-2.5 group hover:border-blue-200 transition-colors"
          >
            {editingId === template.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename(template.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="flex-1 border-0 border-b border-blue-400 bg-transparent px-1 py-0.5 text-sm focus:ring-0 outline-none"
                  autoFocus
                />
                <button
                  onClick={() => confirmRename(template.id)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {t('saved_templates.confirm')}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  {t('saved_templates.cancel')}
                </button>
              </div>
            ) : deletingId === template.id ? (
              <div className="flex-1 flex items-center gap-2">
                <span className="flex-1 text-sm text-red-600">
                  {t('saved_templates.delete_confirm')}
                </span>
                <button
                  onClick={() => confirmDelete(template.id)}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  {t('saved_templates.confirm')}
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  {t('saved_templates.cancel')}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onLoad(template)}
                  className="flex-1 text-left"
                >
                  <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                    {template.name}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {template.variables.length} {t('saved_templates.variables_count')}
                  </span>
                </button>
                <button
                  onClick={() => startRename(template)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity p-1"
                  title={t('saved_templates.rename')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => setDeletingId(template.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity p-1"
                  title={t('saved_templates.delete')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
