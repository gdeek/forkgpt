// Tiny IndexedDB helper for storing attachment blobs
// Stores blobs under store 'attachments' with key `${messageId}:${attachmentId}`

const DB_NAME = 'forkgpt-idb'
const DB_VERSION = 1
const STORE = 'attachments'

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const putAttachmentBlob = async (messageId: string, attachmentId: string, blob: Blob): Promise<void> => {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const key = `${messageId}:${attachmentId}`
    tx.objectStore(STORE).put(blob, key)
  })
}

export const getAttachmentBlob = async (messageId: string, attachmentId: string): Promise<Blob | undefined> => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    tx.onerror = () => reject(tx.error)
    const key = `${messageId}:${attachmentId}`
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as Blob | undefined)
    req.onerror = () => reject(req.error)
  })
}

