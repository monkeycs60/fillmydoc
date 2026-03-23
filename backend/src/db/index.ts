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
    recipient_phone TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    signed_by_name TEXT,
    signed_at TEXT,
    signed_ip TEXT,
    signed_user_agent TEXT,
    pdf_path TEXT NOT NULL,
    signed_pdf_path TEXT,
    document_hash TEXT,
    otp_code TEXT,
    otp_expires_at TEXT,
    otp_attempts INTEGER DEFAULT 0,
    esign_provider TEXT,
    esign_request_id TEXT,
    esign_signing_url TEXT,
    audit_trail TEXT,
    created_at TEXT NOT NULL
  )
`)

// Migrate existing tables — add new columns if missing
const columns = sqlite.prepare("PRAGMA table_info(signing_requests)").all() as Array<{ name: string }>
const columnNames = new Set(columns.map(c => c.name))
const migrations: Array<[string, string]> = [
  ['recipient_phone', 'TEXT'],
  ['signed_user_agent', 'TEXT'],
  ['document_hash', 'TEXT'],
  ['otp_code', 'TEXT'],
  ['otp_expires_at', 'TEXT'],
  ['otp_attempts', 'INTEGER DEFAULT 0'],
  ['esign_provider', 'TEXT'],
  ['esign_request_id', 'TEXT'],
  ['esign_signing_url', 'TEXT'],
  ['audit_trail', 'TEXT'],
  ['email_sent_at', 'TEXT'],
]
for (const [col, type] of migrations) {
  if (!columnNames.has(col)) {
    sqlite.exec(`ALTER TABLE signing_requests ADD COLUMN ${col} ${type}`)
  }
}

export { signingRequests }
