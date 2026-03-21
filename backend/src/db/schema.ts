import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const signingRequests = sqliteTable('signing_requests', {
  id: text('id').primaryKey(), // UUID
  jobId: text('job_id').notNull(), // groups documents from the same generation
  fileName: text('file_name').notNull(),
  recipientName: text('recipient_name'), // from CSV data
  recipientEmail: text('recipient_email'), // optional, from CSV
  status: text('status').notNull().default('pending'), // pending | signed
  signedByName: text('signed_by_name'), // name typed by signer
  signedAt: text('signed_at'), // ISO timestamp
  signedIp: text('signed_ip'),
  pdfPath: text('pdf_path').notNull(), // path to unsigned PDF
  signedPdfPath: text('signed_pdf_path'), // path to signed PDF
  createdAt: text('created_at').notNull(),
})
