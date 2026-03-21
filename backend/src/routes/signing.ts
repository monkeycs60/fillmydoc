import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, signingRequests } from '../db/index'
import { readFile, writeFile } from 'fs/promises'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const signing = new Hono()

// Get document info + PDF for signing page
signing.get('/:id', async (c) => {
  const { id } = c.req.param()

  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)

  return c.json({
    id: doc.id,
    fileName: doc.fileName,
    recipientName: doc.recipientName,
    status: doc.status,
    signedAt: doc.signedAt,
    signedByName: doc.signedByName
  })
})

// Serve the PDF for preview
signing.get('/:id/pdf', async (c) => {
  const { id } = c.req.param()

  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)

  const pdfPath = doc.status === 'signed' && doc.signedPdfPath ? doc.signedPdfPath : doc.pdfPath
  const pdfBuffer = await readFile(pdfPath)

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.fileName}"`
    }
  })
})

// Sign the document
signing.post('/:id/sign', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ name: string }>()

  if (!body.name || body.name.trim().length < 2) {
    return c.json({ error: 'Name is required (min 2 characters)' }, 400)
  }

  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, id)).get()

  if (!doc) return c.json({ error: 'Document not found' }, 404)
  if (doc.status === 'signed') return c.json({ error: 'Document already signed' }, 400)

  // Read the PDF
  const pdfBytes = await readFile(doc.pdfPath)
  const pdfDoc = await PDFDocument.load(pdfBytes)

  // Add signature to the last page
  const pages = pdfDoc.getPages()
  const lastPage = pages[pages.length - 1]
  const { height } = lastPage.getSize()

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const signerIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
  const signedAt = new Date()
  const dateStr = signedAt.toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris'
  })

  // Draw signature block at the bottom of the last page
  const sigY = 60

  // Background box
  lastPage.drawRectangle({
    x: 30,
    y: sigY - 10,
    width: 350,
    height: 55,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.5,
  })

  // Signature text
  lastPage.drawText(`Signé électroniquement par : ${body.name.trim()}`, {
    x: 40,
    y: sigY + 28,
    size: 9,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  })

  lastPage.drawText(`Date : ${dateStr}`, {
    x: 40,
    y: sigY + 14,
    size: 8,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  lastPage.drawText(`IP : ${signerIp} — ID : ${id.slice(0, 8)}`, {
    x: 40,
    y: sigY,
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })

  // Save signed PDF
  const signedPdfBytes = await pdfDoc.save()
  const signedPath = doc.pdfPath.replace('.pdf', '_signed.pdf')
  await writeFile(signedPath, signedPdfBytes)

  // Update database
  db.update(signingRequests)
    .set({
      status: 'signed',
      signedByName: body.name.trim(),
      signedAt: signedAt.toISOString(),
      signedIp: signerIp,
      signedPdfPath: signedPath
    })
    .where(eq(signingRequests.id, id))
    .run()

  return c.json({
    success: true,
    signedAt: signedAt.toISOString(),
    signedByName: body.name.trim()
  })
})

// Get all documents for a job (dashboard)
signing.get('/job/:jobId', async (c) => {
  const { jobId } = c.req.param()

  const docs = db.select().from(signingRequests).where(eq(signingRequests.jobId, jobId)).all()

  return c.json({
    jobId,
    documents: docs.map(d => ({
      id: d.id,
      fileName: d.fileName,
      recipientName: d.recipientName,
      status: d.status,
      signedAt: d.signedAt,
      signedByName: d.signedByName,
      signingUrl: `/sign/${d.id}`
    }))
  })
})

export default signing
