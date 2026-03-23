import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, signingRequests } from '../db/index'
import { readFile, writeFile } from 'fs/promises'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { generateOtp, verifyOtp, hashDocument, appendAuditEvent, parseAuditTrail } from '../services/otp'
import { isEsignEnabled, createSigningRequest, getSigningStatus, downloadSignedDocument } from '../services/esignature'
import { configureDocumentReminders, configureJobReminders } from '../services/reminder'
import { triggerWebhook } from '../services/webhook'

const signing = new Hono()

// ---------------------------------------------------------------------------
// GET /:id — Document info for signing page
// ---------------------------------------------------------------------------
signing.get('/:id', async (c) => {
  const { id } = c.req.param()
  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)

  // Fire document.viewed webhook
  triggerWebhook('document.viewed', {
    documentId: doc.id,
    jobId: doc.jobId,
    fileName: doc.fileName,
    recipientName: doc.recipientName,
    viewedAt: new Date().toISOString(),
  })

  return c.json({
    id: doc.id,
    fileName: doc.fileName,
    recipientName: doc.recipientName,
    recipientEmail: doc.recipientEmail,
    status: doc.status,
    signedAt: doc.signedAt,
    signedByName: doc.signedByName,
    documentHash: doc.documentHash,
    esignProvider: doc.esignProvider,
    esignSigningUrl: doc.esignSigningUrl,
    requiresOtp: !isEsignEnabled(), // local mode requires OTP flow
  })
})

// ---------------------------------------------------------------------------
// GET /:id/pdf — Serve PDF for preview
// ---------------------------------------------------------------------------
signing.get('/:id/pdf', async (c) => {
  const { id } = c.req.param()
  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)

  const pdfPath = doc.status === 'signed' && doc.signedPdfPath
    ? doc.signedPdfPath
    : doc.status === 'esign_completed' && doc.signedPdfPath
      ? doc.signedPdfPath
      : doc.pdfPath

  const pdfBuffer = await readFile(pdfPath)

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.fileName}"`,
    },
  })
})

// ---------------------------------------------------------------------------
// GET /:id/audit — Download audit trail
// ---------------------------------------------------------------------------
signing.get('/:id/audit', async (c) => {
  const { id } = c.req.param()
  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)

  const trail = parseAuditTrail(doc.auditTrail)

  return c.json({
    documentId: doc.id,
    fileName: doc.fileName,
    documentHash: doc.documentHash,
    status: doc.status,
    events: trail,
  })
})

// ---------------------------------------------------------------------------
// POST /:id/request-otp — Send OTP code to signer's email (local mode)
// ---------------------------------------------------------------------------
signing.post('/:id/request-otp', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ email: string; name: string }>()

  if (!body.email || !body.email.includes('@')) {
    return c.json({ error: 'Valid email is required' }, 400)
  }
  if (!body.name || body.name.trim().length < 2) {
    return c.json({ error: 'Name is required (min 2 characters)' }, 400)
  }

  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  if (doc.status === 'signed' || doc.status === 'esign_completed') {
    return c.json({ error: 'Document already signed' }, 400)
  }

  // Generate OTP
  const { code, hash, expiresAt } = generateOtp()

  const signerIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'

  // Update audit trail
  const auditTrail = appendAuditEvent(doc.auditTrail, 'otp_requested', {
    email: body.email,
    name: body.name.trim(),
    ip: signerIp,
  })

  // Store OTP hash in DB
  db.update(signingRequests)
    .set({
      otpCode: hash,
      otpExpiresAt: expiresAt,
      otpAttempts: 0,
      status: 'otp_sent',
      recipientEmail: body.email.trim(),
      auditTrail,
    })
    .where(eq(signingRequests.id, id))
    .run()

  // Send OTP email
  // Try to use a configured SMTP/email service, otherwise log to console
  const emailSent = await sendOtpEmail(body.email.trim(), code, doc.fileName, body.name.trim())

  if (!emailSent) {
    // In dev/test mode, log OTP to console for testing
    console.log(`[OTP] Document ${id}: Code ${code} sent to ${body.email}`)
  }

  return c.json({
    success: true,
    message: 'OTP sent',
    // In dev mode, include OTP for testing (remove in production)
    ...(process.env.NODE_ENV !== 'production' ? { devOtp: code } : {}),
  })
})

// ---------------------------------------------------------------------------
// POST /:id/verify-otp — Verify OTP and complete local signing
// ---------------------------------------------------------------------------
signing.post('/:id/verify-otp', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ otp: string; name: string }>()

  if (!body.otp || body.otp.trim().length !== 6) {
    return c.json({ error: 'Valid 6-digit OTP is required' }, 400)
  }
  if (!body.name || body.name.trim().length < 2) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  if (doc.status === 'signed' || doc.status === 'esign_completed') {
    return c.json({ error: 'Document already signed' }, 400)
  }
  if (doc.status !== 'otp_sent') {
    return c.json({ error: 'OTP not requested. Please request an OTP first.' }, 400)
  }
  if (!doc.otpCode || !doc.otpExpiresAt) {
    return c.json({ error: 'No OTP found. Please request a new one.' }, 400)
  }

  const signerIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const userAgent = c.req.header('user-agent') || 'unknown'

  // Verify OTP
  const result = verifyOtp(body.otp.trim(), doc.otpCode, doc.otpExpiresAt, doc.otpAttempts || 0)

  if (!result.valid) {
    // Increment attempts
    db.update(signingRequests)
      .set({
        otpAttempts: (doc.otpAttempts || 0) + 1,
        auditTrail: appendAuditEvent(doc.auditTrail, 'otp_failed', {
          ip: signerIp,
          reason: result.error || 'invalid',
        }),
      })
      .where(eq(signingRequests.id, id))
      .run()

    const errorMessages: Record<string, string> = {
      too_many_attempts: 'Too many failed attempts. Please request a new OTP.',
      otp_expired: 'OTP has expired. Please request a new one.',
      invalid_otp: 'Invalid OTP code.',
    }

    return c.json({ error: errorMessages[result.error || ''] || 'Invalid OTP' }, 400)
  }

  // OTP verified — proceed to sign the document
  const signedAt = new Date()
  const dateStr = signedAt.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  })

  // Read and sign the PDF
  const pdfBytes = await readFile(doc.pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)

  const pages = pdfDoc.getPages()
  const lastPage = pages[pages.length - 1]
  const { width } = lastPage.getSize()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Enhanced signature block
  const sigY = 45
  const boxWidth = Math.min(width - 60, 500)

  // Background box with border
  lastPage.drawRectangle({
    x: 30,
    y: sigY - 15,
    width: boxWidth,
    height: 80,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: rgb(0.2, 0.4, 0.7),
    borderWidth: 1,
  })

  // Title line
  lastPage.drawText('SIGNATURE ELECTRONIQUE', {
    x: 40,
    y: sigY + 50,
    size: 7,
    font: boldFont,
    color: rgb(0.2, 0.4, 0.7),
  })

  // Signer info
  lastPage.drawText(`Signé par : ${body.name.trim()}`, {
    x: 40,
    y: sigY + 36,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  })

  lastPage.drawText(`Email vérifié : ${doc.recipientEmail || 'N/A'}`, {
    x: 40,
    y: sigY + 23,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  lastPage.drawText(`Date : ${dateStr}`, {
    x: 40,
    y: sigY + 10,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  lastPage.drawText(`Vérification : OTP email | IP : ${signerIp}`, {
    x: 40,
    y: sigY - 3,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })

  // Document hash + ID
  const docHash = doc.documentHash || hashDocument(pdfBytes)
  lastPage.drawText(`Hash SHA-256 : ${docHash.slice(0, 32)}... | ID : ${id.slice(0, 8)}`, {
    x: 40,
    y: sigY - 13,
    size: 6,
    font,
    color: rgb(0.6, 0.6, 0.6),
  })

  // Save signed PDF
  const signedPdfBytes = await pdfDoc.save()
  const signedPath = doc.pdfPath.replace('.pdf', '_signed.pdf')
  await writeFile(signedPath, signedPdfBytes)

  // Final audit trail
  const auditTrail = appendAuditEvent(doc.auditTrail, 'document_signed', {
    name: body.name.trim(),
    email: doc.recipientEmail || 'N/A',
    ip: signerIp,
    userAgent,
    method: 'otp_email',
    documentHash: docHash,
  })

  // Update database
  db.update(signingRequests)
    .set({
      status: 'signed',
      signedByName: body.name.trim(),
      signedAt: signedAt.toISOString(),
      signedIp: signerIp,
      signedUserAgent: userAgent,
      signedPdfPath: signedPath,
      otpCode: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      auditTrail,
    })
    .where(eq(signingRequests.id, id))
    .run()

  // Fire document.signed webhook
  triggerWebhook('document.signed', {
    documentId: doc.id,
    jobId: doc.jobId,
    fileName: doc.fileName,
    recipientName: body.name.trim(),
    recipientEmail: doc.recipientEmail,
    signedAt: signedAt.toISOString(),
    method: 'otp_email',
  })

  // Check if all documents in the job are signed
  checkJobCompletion(doc.jobId)

  return c.json({
    success: true,
    signedAt: signedAt.toISOString(),
    signedByName: body.name.trim(),
    documentHash: docHash,
  })
})

// ---------------------------------------------------------------------------
// POST /:id/sign — Legacy simple sign (kept for backward compat) + OpenAPI.com mode
// ---------------------------------------------------------------------------
signing.post('/:id/sign', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ name: string; email?: string }>()

  if (!body.name || body.name.trim().length < 2) {
    return c.json({ error: 'Name is required (min 2 characters)' }, 400)
  }

  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  if (doc.status === 'signed' || doc.status === 'esign_completed') {
    return c.json({ error: 'Document already signed' }, 400)
  }

  const signerIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const userAgent = c.req.header('user-agent') || 'unknown'

  // If OpenAPI.com is enabled, create an external signing request
  if (isEsignEnabled()) {
    try {
      const pdfBuffer = await readFile(doc.pdfPath)
      const nameParts = body.name.trim().split(' ')
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ') || firstName

      const esignResult = await createSigningRequest(pdfBuffer, {
        firstName,
        lastName,
        email: body.email || doc.recipientEmail || undefined,
      })

      const auditTrail = appendAuditEvent(doc.auditTrail, 'esign_request_created', {
        provider: 'openapi',
        requestId: esignResult.id,
        name: body.name.trim(),
        ip: signerIp,
      })

      db.update(signingRequests)
        .set({
          status: 'esign_pending',
          esignProvider: 'openapi',
          esignRequestId: esignResult.id,
          esignSigningUrl: esignResult.signingUrl || null,
          signedByName: body.name.trim(),
          recipientEmail: body.email || doc.recipientEmail,
          auditTrail,
        })
        .where(eq(signingRequests.id, id))
        .run()

      return c.json({
        success: true,
        mode: 'esign',
        signingUrl: esignResult.signingUrl,
        esignRequestId: esignResult.id,
      })
    } catch (error) {
      console.error('OpenAPI.com e-sign error:', error)
      return c.json({
        error: 'E-signature service error',
        details: error instanceof Error ? error.message : String(error),
      }, 500)
    }
  }

  // Local mode: if OTP was verified (status=otp_sent won't reach here normally),
  // fall through to simple signing as backward compat
  const signedAt = new Date()
  const dateStr = signedAt.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  })

  const pdfBytes = await readFile(doc.pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pages = pdfDoc.getPages()
  const lastPage = pages[pages.length - 1]
  const { width } = lastPage.getSize()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const sigY = 45
  const boxWidth = Math.min(width - 60, 500)

  lastPage.drawRectangle({
    x: 30,
    y: sigY - 15,
    width: boxWidth,
    height: 80,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: rgb(0.2, 0.4, 0.7),
    borderWidth: 1,
  })

  lastPage.drawText('SIGNATURE ELECTRONIQUE', {
    x: 40,
    y: sigY + 50,
    size: 7,
    font: boldFont,
    color: rgb(0.2, 0.4, 0.7),
  })

  lastPage.drawText(`Signé par : ${body.name.trim()}`, {
    x: 40,
    y: sigY + 36,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  })

  lastPage.drawText(`Date : ${dateStr}`, {
    x: 40,
    y: sigY + 23,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  lastPage.drawText(`IP : ${signerIp} | ID : ${id.slice(0, 8)}`, {
    x: 40,
    y: sigY + 10,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })

  const docHash = hashDocument(pdfBytes)
  lastPage.drawText(`Hash SHA-256 : ${docHash.slice(0, 32)}...`, {
    x: 40,
    y: sigY - 3,
    size: 6,
    font,
    color: rgb(0.6, 0.6, 0.6),
  })

  const signedPdfBytes = await pdfDoc.save()
  const signedPath = doc.pdfPath.replace('.pdf', '_signed.pdf')
  await writeFile(signedPath, signedPdfBytes)

  const auditTrail = appendAuditEvent(doc.auditTrail, 'document_signed', {
    name: body.name.trim(),
    ip: signerIp,
    userAgent,
    method: 'simple',
    documentHash: docHash,
  })

  db.update(signingRequests)
    .set({
      status: 'signed',
      signedByName: body.name.trim(),
      signedAt: signedAt.toISOString(),
      signedIp: signerIp,
      signedUserAgent: userAgent,
      signedPdfPath: signedPath,
      documentHash: docHash,
      auditTrail,
    })
    .where(eq(signingRequests.id, id))
    .run()

  // Fire document.signed webhook
  triggerWebhook('document.signed', {
    documentId: doc.id,
    jobId: doc.jobId,
    fileName: doc.fileName,
    recipientName: body.name.trim(),
    recipientEmail: doc.recipientEmail,
    signedAt: signedAt.toISOString(),
    method: 'simple',
  })

  // Check if all documents in the job are signed
  checkJobCompletion(doc.jobId)

  return c.json({
    success: true,
    signedAt: signedAt.toISOString(),
    signedByName: body.name.trim(),
    documentHash: docHash,
  })
})

// ---------------------------------------------------------------------------
// POST /:id/esign-check — Check/complete OpenAPI.com signing status
// ---------------------------------------------------------------------------
signing.post('/:id/esign-check', async (c) => {
  const { id } = c.req.param()
  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  if (doc.status !== 'esign_pending') {
    return c.json({ status: doc.status })
  }
  if (!doc.esignRequestId) {
    return c.json({ error: 'No e-sign request found' }, 400)
  }

  try {
    const status = await getSigningStatus(doc.esignRequestId)

    if (status.state === 'COMPLETED') {
      // Download the signed document
      const signedPdfBuffer = await downloadSignedDocument(doc.esignRequestId)
      const signedPath = doc.pdfPath.replace('.pdf', '_signed.pdf')
      await writeFile(signedPath, signedPdfBuffer)

      const auditTrail = appendAuditEvent(doc.auditTrail, 'esign_completed', {
        provider: 'openapi',
        requestId: doc.esignRequestId,
        signedAt: status.signedAt || new Date().toISOString(),
      })

      db.update(signingRequests)
        .set({
          status: 'esign_completed',
          signedAt: status.signedAt || new Date().toISOString(),
          signedPdfPath: signedPath,
          auditTrail,
        })
        .where(eq(signingRequests.id, id))
        .run()

      // Fire document.signed webhook
      triggerWebhook('document.signed', {
        documentId: doc.id,
        jobId: doc.jobId,
        fileName: doc.fileName,
        recipientName: doc.signedByName,
        recipientEmail: doc.recipientEmail,
        signedAt: status.signedAt || new Date().toISOString(),
        method: 'esign',
        provider: 'openapi',
      })

      // Check if all documents in the job are signed
      checkJobCompletion(doc.jobId)

      return c.json({ status: 'esign_completed', signedAt: status.signedAt })
    }

    return c.json({ status: 'esign_pending', state: status.state })
  } catch (error) {
    console.error('E-sign status check error:', error)
    return c.json({
      error: 'Failed to check e-sign status',
      details: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})

// ---------------------------------------------------------------------------
// GET /job/:jobId/export — Export signing status as CSV
// ---------------------------------------------------------------------------
signing.get('/job/:jobId/export', async (c) => {
  const { jobId } = c.req.param()
  const docs = db.select().from(signingRequests).where(eq(signingRequests.jobId, jobId)).all()

  if (docs.length === 0) {
    return c.json({ error: 'No documents found for this job' }, 404)
  }

  const escapeCsv = (value: string | null | undefined): string => {
    if (value == null) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const headers = ['Recipient Name', 'Email', 'Status', 'Signed At', 'Signed By', 'Created At']
  const rows = docs.map(d => [
    escapeCsv(d.recipientName),
    escapeCsv(d.recipientEmail),
    escapeCsv(d.status),
    escapeCsv(d.signedAt),
    escapeCsv(d.signedByName),
    escapeCsv(d.createdAt),
  ].join(','))

  const csv = [headers.join(','), ...rows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="signing-export-${jobId}.csv"`,
    },
  })
})

// ---------------------------------------------------------------------------
// GET /job/:jobId — Dashboard: list all documents for a job
// ---------------------------------------------------------------------------
signing.get('/job/:jobId', async (c) => {
  const { jobId } = c.req.param()
  const docs = db.select().from(signingRequests).where(eq(signingRequests.jobId, jobId)).all()

  return c.json({
    jobId,
    documents: docs.map(d => ({
      id: d.id,
      fileName: d.fileName,
      recipientName: d.recipientName,
      recipientEmail: d.recipientEmail,
      status: d.status,
      signedAt: d.signedAt,
      signedByName: d.signedByName,
      documentHash: d.documentHash,
      esignProvider: d.esignProvider,
      emailSentAt: d.emailSentAt,
      signingUrl: `/sign/${d.id}`,
      reminderCount: d.reminderCount ?? 0,
      maxReminders: d.maxReminders ?? 3,
      lastReminderAt: d.lastReminderAt,
      nextReminderAt: d.nextReminderAt,
      createdAt: d.createdAt,
    })),
  })
})

// ---------------------------------------------------------------------------
// POST /:id/send-email — Send signing invitation email for a single document
// ---------------------------------------------------------------------------
signing.post('/:id/send-email', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ baseUrl?: string; locale?: string }>().catch(() => ({} as { baseUrl?: string; locale?: string }))

  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  if (doc.status === 'signed' || doc.status === 'esign_completed') {
    return c.json({ error: 'Document already signed' }, 400)
  }
  if (!doc.recipientEmail) {
    return c.json({ error: 'No recipient email for this document' }, 400)
  }

  const baseUrl = body.baseUrl || process.env.APP_URL || 'http://localhost:5173'
  const locale = body.locale || 'fr'
  const signingUrl = `${baseUrl}/${locale}/sign/${doc.id}`

  const sent = await sendSigningEmail(
    doc.recipientEmail,
    doc.recipientName || doc.recipientEmail,
    doc.fileName,
    signingUrl,
    locale,
  )

  if (!sent) {
    return c.json({ error: 'Failed to send email. Check email configuration.' }, 500)
  }

  const now = new Date().toISOString()
  const auditTrail = appendAuditEvent(doc.auditTrail, 'email_invitation_sent', {
    email: doc.recipientEmail,
    sentAt: now,
  })

  db.update(signingRequests)
    .set({ emailSentAt: now, auditTrail })
    .where(eq(signingRequests.id, id))
    .run()

  return c.json({ success: true, emailSentAt: now })
})

// ---------------------------------------------------------------------------
// POST /job/:jobId/send-emails — Send signing emails for all pending docs in a job
// ---------------------------------------------------------------------------
signing.post('/job/:jobId/send-emails', async (c) => {
  const { jobId } = c.req.param()
  const body = await c.req.json<{ baseUrl?: string; locale?: string }>().catch(() => ({} as { baseUrl?: string; locale?: string }))

  const docs = db.select().from(signingRequests).where(eq(signingRequests.jobId, jobId)).all()

  if (docs.length === 0) {
    return c.json({ error: 'No documents found for this job' }, 404)
  }

  const baseUrl = body.baseUrl || process.env.APP_URL || 'http://localhost:5173'
  const locale = body.locale || 'fr'

  const results: Array<{ id: string; email: string | null; success: boolean; error?: string }> = []

  for (const doc of docs) {
    // Skip already signed documents
    if (doc.status === 'signed' || doc.status === 'esign_completed') {
      results.push({ id: doc.id, email: doc.recipientEmail, success: false, error: 'already_signed' })
      continue
    }

    // Skip documents without email
    if (!doc.recipientEmail) {
      results.push({ id: doc.id, email: null, success: false, error: 'no_email' })
      continue
    }

    const signingUrl = `${baseUrl}/${locale}/sign/${doc.id}`

    const sent = await sendSigningEmail(
      doc.recipientEmail,
      doc.recipientName || doc.recipientEmail,
      doc.fileName,
      signingUrl,
      locale,
    )

    if (sent) {
      const now = new Date().toISOString()
      const auditTrail = appendAuditEvent(doc.auditTrail, 'email_invitation_sent', {
        email: doc.recipientEmail,
        sentAt: now,
      })

      db.update(signingRequests)
        .set({ emailSentAt: now, auditTrail })
        .where(eq(signingRequests.id, doc.id))
        .run()

      results.push({ id: doc.id, email: doc.recipientEmail, success: true })
    } else {
      results.push({ id: doc.id, email: doc.recipientEmail, success: false, error: 'send_failed' })
    }
  }

  const sentCount = results.filter(r => r.success).length
  const failedCount = results.filter(r => !r.success && r.error !== 'already_signed').length

  return c.json({ success: true, sent: sentCount, failed: failedCount, results })
})

// ---------------------------------------------------------------------------
// Helper: Send signing invitation email
// ---------------------------------------------------------------------------
async function sendSigningEmail(
  email: string,
  recipientName: string,
  fileName: string,
  signingUrl: string,
  locale: string,
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.log(`[EMAIL] No RESEND_API_KEY — would send signing email to ${email} with link ${signingUrl}`)
    return false
  }

  // Localized strings
  const i18n: Record<string, { subject: string; greeting: string; body: string; cta: string; footer: string; expiry: string }> = {
    fr: {
      subject: `FillMyDoc — Document a signer : ${fileName}`,
      greeting: `Bonjour ${recipientName},`,
      body: `Vous avez ete invite(e) a signer le document <strong>${fileName}</strong>. Cliquez sur le bouton ci-dessous pour consulter et signer le document.`,
      cta: 'Signer le document',
      footer: 'Si vous n\'avez pas demande cette signature, vous pouvez ignorer cet email.',
      expiry: 'Ce lien est personnel et unique.',
    },
    en: {
      subject: `FillMyDoc — Document to sign: ${fileName}`,
      greeting: `Hello ${recipientName},`,
      body: `You have been invited to sign the document <strong>${fileName}</strong>. Click the button below to review and sign the document.`,
      cta: 'Sign the document',
      footer: 'If you did not request this signature, you can ignore this email.',
      expiry: 'This link is personal and unique.',
    },
    es: {
      subject: `FillMyDoc — Documento para firmar: ${fileName}`,
      greeting: `Hola ${recipientName},`,
      body: `Ha sido invitado/a a firmar el documento <strong>${fileName}</strong>. Haga clic en el boton de abajo para revisar y firmar el documento.`,
      cta: 'Firmar el documento',
      footer: 'Si no solicito esta firma, puede ignorar este correo.',
      expiry: 'Este enlace es personal y unico.',
    },
    de: {
      subject: `FillMyDoc — Dokument zur Unterschrift: ${fileName}`,
      greeting: `Hallo ${recipientName},`,
      body: `Sie wurden eingeladen, das Dokument <strong>${fileName}</strong> zu unterschreiben. Klicken Sie auf die Schaltflache unten, um das Dokument zu prufen und zu unterschreiben.`,
      cta: 'Dokument unterschreiben',
      footer: 'Wenn Sie diese Unterschrift nicht angefordert haben, konnen Sie diese E-Mail ignorieren.',
      expiry: 'Dieser Link ist personlich und einzigartig.',
    },
  }

  const strings = i18n[locale] || i18n['fr']

  try {
    const fromEmail = process.env.EMAIL_FROM || 'FillMyDoc <noreply@fillmydoc.com>'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: strings.subject,
        html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff;">
            <div style="border-top: 3px solid #2563eb; padding: 32px 0;">
              <h2 style="color: #111827; font-size: 20px; margin: 0 0 4px; font-weight: 700;">FillMyDoc</h2>
              <p style="color: #6b7280; font-size: 13px; margin: 0 0 28px;">Signature electronique</p>

              <p style="color: #374151; font-size: 15px; margin: 0 0 16px;">${strings.greeting}</p>
              <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 28px;">
                ${strings.body}
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${signingUrl}"
                   style="display: inline-block; background: #2563eb; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 6px;">
                  ${strings.cta}
                </a>
              </div>

              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px 16px; margin: 24px 0;">
                <p style="color: #6b7280; font-size: 12px; margin: 0 0 6px;">${strings.expiry}</p>
                <p style="color: #9ca3af; font-size: 11px; margin: 0; word-break: break-all;">${signingUrl}</p>
              </div>

              <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">
                ${strings.footer}
              </p>
            </div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`Resend signing email error (${res.status}):`, errorBody)
      return false
    }

    return true
  } catch (error) {
    console.error('Resend signing email error:', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// POST /:id/configure-reminders — Configure reminders for a single document
// ---------------------------------------------------------------------------
signing.post('/:id/configure-reminders', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    maxReminders?: number
    intervals?: number[]
    enabled?: boolean
  }>()

  const success = configureDocumentReminders(id, {
    maxReminders: body.maxReminders,
    intervals: body.intervals,
    enabled: body.enabled,
  })

  if (!success) return c.json({ error: 'Document not found' }, 404)
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// POST /job/:jobId/configure-reminders — Configure reminders for all docs in a job
// ---------------------------------------------------------------------------
signing.post('/job/:jobId/configure-reminders', async (c) => {
  const { jobId } = c.req.param()
  const body = await c.req.json<{
    maxReminders?: number
    intervals?: number[]
    enabled?: boolean
  }>()

  const updated = configureJobReminders(jobId, {
    maxReminders: body.maxReminders,
    intervals: body.intervals,
    enabled: body.enabled,
  })

  return c.json({ success: true, updated })
})

// ---------------------------------------------------------------------------
// Helper: Send OTP email
// ---------------------------------------------------------------------------
async function sendOtpEmail(
  email: string,
  code: string,
  fileName: string,
  signerName: string
): Promise<boolean> {
  // If SMTP_URL or RESEND_API_KEY is configured, send a real email
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      const fromEmail = process.env.EMAIL_FROM || 'FillMyDoc <noreply@fillmydoc.com>'
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `FillMyDoc — Code de vérification : ${code}`,
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
              <div style="border-top: 3px solid #2563eb; padding: 32px 0;">
                <h2 style="color: #111; font-size: 20px; margin: 0 0 8px;">FillMyDoc</h2>
                <p style="color: #666; font-size: 14px; margin: 0 0 24px;">Code de vérification pour signature</p>

                <p style="color: #333; font-size: 14px;">Bonjour ${signerName},</p>
                <p style="color: #333; font-size: 14px;">
                  Vous avez été invité(e) à signer le document <strong>${fileName}</strong>.
                </p>

                <div style="background: #f0f4ff; border: 1px solid #d0d8f0; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                  <p style="color: #666; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Votre code</p>
                  <p style="color: #111; font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 0; font-family: monospace;">${code}</p>
                </div>

                <p style="color: #999; font-size: 12px;">
                  Ce code expire dans 10 minutes. Si vous n'avez pas demandé cette vérification, ignorez cet email.
                </p>
              </div>
            </div>
          `,
        }),
      })

      return res.ok
    } catch (error) {
      console.error('Resend email error:', error)
      return false
    }
  }

  // No email service configured — fall back to console
  return false
}

// ---------------------------------------------------------------------------
// Helper: Check if all documents in a job are signed, trigger job.completed
// ---------------------------------------------------------------------------
function checkJobCompletion(jobId: string): void {
  try {
    const docs = db.select().from(signingRequests).where(eq(signingRequests.jobId, jobId)).all()
    const allSigned = docs.every(d => d.status === 'signed' || d.status === 'esign_completed')

    if (allSigned && docs.length > 0) {
      triggerWebhook('job.completed', {
        jobId,
        totalDocuments: docs.length,
        completedAt: new Date().toISOString(),
        documents: docs.map(d => ({
          documentId: d.id,
          fileName: d.fileName,
          recipientName: d.recipientName,
          signedAt: d.signedAt,
          status: d.status,
        })),
      })
    }
  } catch (error) {
    console.error('[Webhook] Error checking job completion:', error)
  }
}

export default signing
