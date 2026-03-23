import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, signingRequests, branding } from '../db/index'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { PDFDocument, PDFImage, rgb, StandardFonts } from 'pdf-lib'
import { generateOtp, verifyOtp, hashDocument, appendAuditEvent, parseAuditTrail } from '../services/otp'
import { isEsignEnabled, createSigningRequest, getSigningStatus, downloadSignedDocument } from '../services/esignature'

// ---------------------------------------------------------------------------
// Helper: Parse hex color to rgb values (0-1 range)
// ---------------------------------------------------------------------------
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  }
}

// ---------------------------------------------------------------------------
// Helper: Get branding config from DB
// ---------------------------------------------------------------------------
function getBrandingConfig() {
  return db.select().from(branding).where(eq(branding.id, 'default')).get()
}

// ---------------------------------------------------------------------------
// Helper: Draw branded signature block on PDF
// ---------------------------------------------------------------------------
async function drawSignatureBlock(
  pdfDoc: Awaited<ReturnType<typeof PDFDocument.load>>,
  opts: {
    signerName: string
    email: string
    dateStr: string
    signerIp: string
    verificationMethod: string
    docHash: string
    docId: string
  }
) {
  const brandingConfig = getBrandingConfig()
  const primaryHex = brandingConfig?.primaryColor || '#2563eb'
  const companyName = brandingConfig?.companyName || null
  const { r, g, b } = hexToRgb(primaryHex)

  const pages = pdfDoc.getPages()
  const lastPage = pages[pages.length - 1]
  const { width } = lastPage.getSize()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const sigY = 45
  const boxWidth = Math.min(width - 60, 500)

  // Determine if we have a logo to embed
  let logoImage: PDFImage | null = null
  let logoWidth = 0
  let logoHeight = 0

  if (brandingConfig?.logoPath && existsSync(brandingConfig.logoPath)) {
    try {
      const logoBytes = await readFile(brandingConfig.logoPath)
      const ext = brandingConfig.logoPath.split('.').pop()?.toLowerCase()
      if (ext === 'png') {
        logoImage = await pdfDoc.embedPng(logoBytes)
      } else if (ext === 'jpg' || ext === 'jpeg') {
        logoImage = await pdfDoc.embedJpg(logoBytes)
      }
      // SVG is not natively supported by pdf-lib, skip

      if (logoImage) {
        const dims = logoImage.scale(1)
        const maxH = 25
        const scale = maxH / dims.height
        logoWidth = dims.width * scale
        logoHeight = maxH
      }
    } catch (err) {
      console.error('Failed to embed logo in PDF:', err)
    }
  }

  // Increase box height if logo present
  const boxHeight = logoImage ? 95 : 80

  // Background box with branded border
  lastPage.drawRectangle({
    x: 30,
    y: sigY - 15,
    width: boxWidth,
    height: boxHeight,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: rgb(r, g, b),
    borderWidth: 1,
  })

  let currentY = sigY + (logoImage ? 65 : 50)

  // Logo + title line
  if (logoImage) {
    lastPage.drawImage(logoImage, {
      x: 40,
      y: currentY - 2,
      width: logoWidth,
      height: logoHeight,
    })

    // Title next to logo
    const titleX = 40 + logoWidth + 8
    lastPage.drawText(companyName ? `${companyName} — SIGNATURE ELECTRONIQUE` : 'SIGNATURE ELECTRONIQUE', {
      x: titleX,
      y: currentY + 7,
      size: 7,
      font: boldFont,
      color: rgb(r, g, b),
    })
    currentY -= 15
  } else {
    lastPage.drawText(companyName ? `${companyName} — SIGNATURE ELECTRONIQUE` : 'SIGNATURE ELECTRONIQUE', {
      x: 40,
      y: currentY,
      size: 7,
      font: boldFont,
      color: rgb(r, g, b),
    })
  }

  // Signer info
  currentY -= 14
  lastPage.drawText(`Signe par : ${opts.signerName}`, {
    x: 40,
    y: currentY,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  })

  currentY -= 13
  lastPage.drawText(`Email verifie : ${opts.email}`, {
    x: 40,
    y: currentY,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  currentY -= 13
  lastPage.drawText(`Date : ${opts.dateStr}`, {
    x: 40,
    y: currentY,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  currentY -= 13
  lastPage.drawText(`Verification : ${opts.verificationMethod} | IP : ${opts.signerIp}`, {
    x: 40,
    y: currentY,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })

  currentY -= 10
  lastPage.drawText(`Hash SHA-256 : ${opts.docHash.slice(0, 32)}... | ID : ${opts.docId.slice(0, 8)}`, {
    x: 40,
    y: currentY,
    size: 6,
    font,
    color: rgb(0.6, 0.6, 0.6),
  })
}

const signing = new Hono()

// ---------------------------------------------------------------------------
// GET /:id — Document info for signing page
// ---------------------------------------------------------------------------
signing.get('/:id', async (c) => {
  const { id } = c.req.param()
  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)

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

  const docHash = doc.documentHash || hashDocument(pdfBytes)

  // Draw branded signature block
  await drawSignatureBlock(pdfDoc, {
    signerName: body.name.trim(),
    email: doc.recipientEmail || 'N/A',
    dateStr,
    signerIp,
    verificationMethod: 'OTP email',
    docHash,
    docId: id,
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

  const docHash = hashDocument(pdfBytes)

  // Draw branded signature block
  await drawSignatureBlock(pdfDoc, {
    signerName: body.name.trim(),
    email: doc.recipientEmail || 'N/A',
    dateStr,
    signerIp,
    verificationMethod: 'simple',
    docHash,
    docId: id,
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
      signingUrl: `/sign/${d.id}`,
    })),
  })
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

export default signing
