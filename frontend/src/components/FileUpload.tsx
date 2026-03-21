import { useCallback } from 'react'

interface FileUploadProps {
  label: string
  accept: string
  file: File | null
  onFileSelect: (file: File) => void | Promise<void>
  hint: string
  icon?: 'template' | 'csv'
}

export function FileUpload({ label, accept, file, onFileSelect, hint, icon }: FileUploadProps) {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) onFileSelect(droppedFile)
  }, [onFileSelect])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) onFileSelect(selectedFile)
  }, [onFileSelect])

  const iconChar = icon === 'csv' ? '\u{1F4CA}' : '\u{1F4C4}'

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`border border-dashed rounded-md p-10 text-center transition-colors cursor-pointer ${
        file
          ? 'border-green-400 bg-green-50/30'
          : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
      }`}
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
            <div className="text-2xl mb-2">{iconChar}</div>
            <p className="font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div>
            <div className="text-2xl mb-2">{iconChar}</div>
            <p className="font-medium text-gray-700">{label}</p>
            <p className="text-xs text-gray-400 mt-1">{hint}</p>
          </div>
        )}
      </label>
    </div>
  )
}
