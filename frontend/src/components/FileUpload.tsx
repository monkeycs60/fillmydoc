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
