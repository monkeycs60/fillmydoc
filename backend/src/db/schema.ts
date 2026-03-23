import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const signingRequests = sqliteTable('signing_requests', {
  id: text('id').primaryKey(), // UUID
  jobId: text('job_id').notNull(), // groups documents from the same generation
  fileName: text('file_name').notNull(),
  recipientName: text('recipient_name'), // from CSV data
  recipientEmail: text('recipient_email'), // for OTP verification
  recipientPhone: text('recipient_phone'), // optional phone
  status: text('status').notNull().default('pending'), // pending | otp_sent | otp_verified | signed | esign_pending | esign_completed
  signedByName: text('signed_by_name'), // name typed by signer
  signedAt: text('signed_at'), // ISO timestamp
  signedIp: text('signed_ip'),
  signedUserAgent: text('signed_user_agent'), // browser user-agent
  pdfPath: text('pdf_path').notNull(), // path to unsigned PDF
  signedPdfPath: text('signed_pdf_path'), // path to signed PDF
  documentHash: text('document_hash'), // SHA-256 hash of original PDF
  otpCode: text('otp_code'), // hashed OTP code
  otpExpiresAt: text('otp_expires_at'), // ISO timestamp
  otpAttempts: integer('otp_attempts').default(0), // failed OTP attempts
  esignProvider: text('esign_provider'), // 'openapi' | null
  esignRequestId: text('esign_request_id'), // external provider request ID
  esignSigningUrl: text('esign_signing_url'), // external signing URL
  auditTrail: text('audit_trail'), // JSON array of audit events
  emailSentAt: text('email_sent_at'), // ISO timestamp of when signing email was sent
  createdAt: text('created_at').notNull(),
})
