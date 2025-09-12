import React from 'react'
import type { AttachmentMeta } from '../types'

type Props = {
  pending: File[]
  metas: AttachmentMeta[]
  onSelectFiles: (files: FileList | File[]) => void
  onRemovePending: (index: number) => void
  onRemoveMeta?: (id: string) => void
  compact?: boolean
}

export const AttachmentPicker: React.FC<Props> = ({ pending, metas, onSelectFiles, onRemovePending, compact }) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault()
    if (e.dataTransfer?.files?.length) onSelectFiles(e.dataTransfer.files)
  }
  const onPaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    const files: File[] = []
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length) onSelectFiles(files)
  }
  return (
    <div onDragOver={(e)=>{e.preventDefault()}} onDrop={onDrop} onPaste={onPaste}>
      <div className={`flex items-center gap-2 ${compact ? 'mb-0' : 'mb-2'}`}>
        <button
          className="px-2 py-1 border rounded text-sm"
          onClick={() => {
            if (inputRef.current) {
              // Reset value so selecting the same file again still triggers onChange
              inputRef.current.value = ''
              inputRef.current.click()
            }
          }}
        >Attach</button>
        {!compact && (<div className="text-xs text-gray-500">Drop files here or click Attach (max 5, total ≤ 50MB)</div>)}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e)=>{
            if (e.target.files) onSelectFiles(e.target.files)
            // Clear after selection so the same file can be selected again later
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
      </div>
      {(pending.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pending.map((f, i) => (
            <div key={i} className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 dark:border-gray-700">
              <span>{f.name} ({Math.round(f.size/1024)} KB)</span>
              <button className="ml-2 underline" onClick={()=>onRemovePending(i)}>remove</button>
            </div>
          ))}
        </div>
      )}
      {(metas.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {metas.map(m => (
            <div key={m.id} className="border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 dark:border-gray-700 flex items-center gap-2">
              {m.previewDataUrl ? (<img src={m.previewDataUrl} alt={m.name} className="w-10 h-10 object-cover rounded" />) : null}
              <span className="truncate max-w-[200px]" title={m.name}>{m.name}</span>
              <span className="text-gray-500">({Math.round(m.size/1024)} KB)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
