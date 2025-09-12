import type { AttachmentMeta, AttachmentKind } from '../types'
import { putAttachmentBlob, getAttachmentBlob } from './idb'

export const MAX_ATTACHMENTS = 5
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024 // 50MB
export const IMAGE_MAX_WIDTH = 1024
export const LARGE_FILE_SUMMARY_THRESHOLD = 25 * 1024 * 1024 // 25MB

export const sniffKind = (mime: string, name: string): AttachmentKind => {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('text/') || /\.(txt|md|csv|json|js|ts|py|html?|xml|yml|yaml|sql|log)$/i.test(name)) return 'text'
  return 'other'
}

export const toDataUrl = (blob: Blob): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result))
  r.onerror = () => rej(r.error)
  r.readAsDataURL(blob)
})

export const compressImage = async (file: File): Promise<Blob> => {
  const dataUrl = await toDataUrl(file)
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const scale = Math.min(1, IMAGE_MAX_WIDTH / img.width)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const quality = 0.8
  const out = await new Promise<Blob>((res) => c.toBlob(b => res(b!), 'image/jpeg', quality))
  return out
}

// Dynamic PDF.js loader via CDN (avoids adding package dependency)
let pdfjsPromise: Promise<any> | null = null
const loadPdfjs = () => {
  if (!pdfjsPromise) {
    const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build'
    pdfjsPromise = import(`${base}/pdf.mjs`).then((mod: any) => {
      try {
        // Tell PDF.js where to load the worker from (required in many envs)
        if (mod && mod.GlobalWorkerOptions) {
          mod.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`
        }
      } catch {}
      return mod
    })
  }
  return pdfjsPromise
}

export const extractPdf = async (arrayBuffer: ArrayBuffer): Promise<{ text: string; pageImages: string[] }> => {
  const pdfjs = await loadPdfjs()
  const task = await pdfjs.getDocument({ data: arrayBuffer }).promise
  let text = ''
  const images: string[] = []
  for (let i = 1; i <= task.numPages; i++) {
    const page = await task.getPage(i)
    const content = await page.getTextContent().catch(() => ({ items: [] }))
    const items = (content?.items ?? []) as any[]
    if (items.length > 0) {
      const pageText = items.map(it => it.str ?? '').join(' ')
      text += `\n\n[PDF Page ${i}]\n${pageText}`
    } else {
      // no text layer: rasterize page as image
      const viewport = page.getViewport({ scale: IMAGE_MAX_WIDTH / page.getViewport({ scale: 1 }).width })
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvasContext: ctx as any, viewport }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.8))
    }
  }
  return { text: text.trim(), pageImages: images }
}

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export const buildFileTextChunks = (name: string, content: string, maxCharsPerChunk = 4800): string[] => {
  const header = `--- file: ${name} ---\n`
  const chunks: string[] = []
  for (let i = 0; i < content.length; i += maxCharsPerChunk) {
    const body = content.slice(i, i + maxCharsPerChunk)
    chunks.push(`${header}\n${body}`)
  }
  return chunks
}

export const readBlob = async (messageId: string, meta: AttachmentMeta): Promise<Blob | undefined> => {
  return getAttachmentBlob(messageId, meta.id)
}

export const prepareAttachmentParts = async (messageId: string, meta: AttachmentMeta): Promise<ContentPart[]> => {
  const blob = await readBlob(messageId, meta)
  if (!blob) return []
  if (meta.kind === 'image') {
    const dataUrl = await toDataUrl(blob)
    return [{ type: 'image_url', image_url: { url: dataUrl } }]
  }
  if (meta.kind === 'pdf') {
    const buf = await blob.arrayBuffer()
    const { text, pageImages } = await extractPdf(buf)
    const parts: ContentPart[] = []
    for (const chunk of buildFileTextChunks(meta.name, text)) parts.push({ type: 'text', text: chunk })
    for (const img of pageImages) parts.push({ type: 'image_url', image_url: { url: img } })
    return parts
  }
  if (meta.kind === 'text') {
    const text = await blob.text()
    return buildFileTextChunks(meta.name, text).map(t => ({ type: 'text', text: t }))
  }
  // other - block
  return [{ type: 'text', text: `Attachment ${meta.name} (${meta.mime}) is not supported for context and was skipped.` }]
}

export const storeNewAttachment = async (messageId: string, file: File): Promise<AttachmentMeta> => {
  const kind = sniffKind(file.type, file.name)
  let blob: Blob = file
  let previewDataUrl: string | undefined
  if (kind === 'image') {
    blob = await compressImage(file)
    previewDataUrl = await toDataUrl(blob)
  }
  // Store blob
  const id = crypto.randomUUID()
  const blobKey = `${messageId}:${id}`
  await putAttachmentBlob(messageId, id, blob)
  const meta: AttachmentMeta = { id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', kind, blobKey, previewDataUrl }
  return meta
}
