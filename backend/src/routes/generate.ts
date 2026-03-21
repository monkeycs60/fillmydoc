import { Hono } from 'hono'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import Papa from 'papaparse'
import archiver from 'archiver'
import { writeFile, readFile, mkdir, rm } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { db, signingRequests } from '../db/index'

const execFileAsync = promisify(execFile)

const generate = new Hono()

generate.post('/', async (c) => {
  const formData = await c.req.formData()
  const templateFile = formData.get('template') as File
  const csvFile = formData.get('csv') as File
  const mappingJson = formData.get('mapping') as string
  const prefixValue = (formData.get('prefix') as string) || ''
  const nameColumn = formData.get('nameColumn') as string

  if (!templateFile || !csvFile || !mappingJson) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  const mapping: Record<string, string> = JSON.parse(mappingJson)

  const csvText = await csvFile.text()
  const csvResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true
  })
  const rows = csvResult.data

  const templateBuffer = Buffer.from(await templateFile.arrayBuffer())

  const jobId = randomUUID()
  const tmpDir = join('/tmp', 'fillmydoc', jobId)
  const docxDir = join(tmpDir, 'docx')
  const pdfDir = join(tmpDir, 'pdf')
  await mkdir(docxDir, { recursive: true })
  await mkdir(pdfDir, { recursive: true })

  try {
    const fileNames: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      const data: Record<string, string> = {}
      for (const [variable, csvColumn] of Object.entries(mapping)) {
        data[variable] = row[csvColumn] || ''
      }

      const zip = new PizZip(templateBuffer)
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => ''
      })
      doc.render(data)
      const docBuffer = doc.getZip().generate({ type: 'nodebuffer' })

      const fileLabel = nameColumn && row[nameColumn]
        ? row[nameColumn].replace(/[^a-zA-Z0-9À-ÿ_\-\s]/g, '_').trim()
        : String(i + 1).padStart(3, '0')
      const fileName = prefixValue
        ? `${prefixValue}_${fileLabel}`
        : fileLabel

      fileNames.push(fileName)
      await writeFile(join(docxDir, `${fileName}.docx`), docBuffer)
    }

    // Convert all docx to PDF via LibreOffice headless
    const docxFiles = fileNames.map(name => join(docxDir, `${name}.docx`))
    await execFileAsync('soffice', [
      '--headless',
      '--nodefault',
      '--nolockcheck',
      '--nologo',
      '--norestore',
      '--convert-to', 'pdf',
      '--outdir', pdfDir,
      ...docxFiles
    ], { timeout: 120000 })

    // Check if signing mode
    const mode = formData.get('mode') as string

    if (mode === 'sign') {
      // Move PDFs to persistent storage
      const persistDir = join(process.cwd(), 'data', 'pdfs', jobId)
      await mkdir(persistDir, { recursive: true })

      const documents = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const fileLabel = nameColumn && row[nameColumn]
          ? row[nameColumn].replace(/[^a-zA-Z0-9À-ÿ_\-\s]/g, '_').trim()
          : String(i + 1).padStart(3, '0')
        const fileName = prefixValue
          ? `${prefixValue}_${fileLabel}`
          : fileLabel

        const srcPdf = join(pdfDir, `${fileName}.pdf`)
        const destPdf = join(persistDir, `${fileName}.pdf`)

        // Copy PDF to persistent storage
        const pdfContent = await readFile(srcPdf)
        await writeFile(destPdf, pdfContent)

        const signingId = randomUUID()

        // Insert signing request
        db.insert(signingRequests).values({
          id: signingId,
          jobId,
          fileName: `${fileName}.pdf`,
          recipientName: row[nameColumn] || null,
          recipientEmail: null, // could add email column mapping later
          status: 'pending',
          pdfPath: destPdf,
          createdAt: new Date().toISOString()
        }).run()

        documents.push({
          id: signingId,
          fileName: `${fileName}.pdf`,
          recipientName: row[nameColumn] || null,
          status: 'pending',
          signingUrl: `/sign/${signingId}`
        })
      }

      // Cleanup tmp
      await rm(tmpDir, { recursive: true, force: true })

      return c.json({ jobId, documents })
    }

    // Create zip of PDFs
    const archive = archiver('zip', { zlib: { level: 6 } })
    const chunks: Buffer[] = []

    await new Promise<void>((resolve, reject) => {
      archive.on('data', (chunk: Buffer) => chunks.push(chunk))
      archive.on('end', resolve)
      archive.on('error', reject)

      archive.directory(pdfDir, false)
      archive.finalize()
    })

    const zipBuffer = Buffer.concat(chunks)

    await rm(tmpDir, { recursive: true, force: true })

    return new Response(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="fillmydoc_${jobId.slice(0, 8)}.zip"`,
        'Content-Length': String(zipBuffer.length)
      }
    })
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    console.error('Generation error:', error)
    return c.json({ error: 'Generation failed', details: String(error) }, 500)
  }
})

export default generate
