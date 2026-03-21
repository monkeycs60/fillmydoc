import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { signingRequests } from './schema'
import { join } from 'path'
import { mkdirSync } from 'fs'

const dataDir = join(process.cwd(), 'data')
mkdirSync(dataDir, { recursive: true })

const sqlite = new Database(join(dataDir, 'fillmydoc.db'))
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite)

// Create table if not exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS signing_requests (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    recipient_name TEXT,
    recipient_email TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    signed_by_name TEXT,
    signed_at TEXT,
    signed_ip TEXT,
    pdf_path TEXT NOT NULL,
    signed_pdf_path TEXT,
    created_at TEXT NOT NULL
  )
`)

export { signingRequests }
