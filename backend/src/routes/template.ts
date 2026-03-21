import { Hono } from 'hono'
import PizZip from 'pizzip'

const template = new Hono()

template.post('/parse', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('template') as File
  if (!file) return c.json({ error: 'No template file' }, 400)

  const buffer = Buffer.from(await file.arrayBuffer())
  const zip = new PizZip(buffer)

  // Extract variables by parsing the XML content of the docx
  const xmlFiles = Object.keys(zip.files).filter(f =>
    f.match(/word\/(document|header\d*|footer\d*)\.xml$/)
  )

  const variables = new Set<string>()

  for (const xmlPath of xmlFiles) {
    const content = zip.file(xmlPath)?.asText() || ''
    // docxtemplater uses {variable} syntax
    // But Word splits text across XML runs, so we need to strip XML tags first
    const textOnly = content.replace(/<[^>]+>/g, '')
    const regex = /\{([^{}#/]+)\}/g
    let match
    while ((match = regex.exec(textOnly)) !== null) {
      const varName = match[1].trim()
      if (varName && !varName.includes(' ')) {
        variables.add(varName)
      }
    }
  }

  return c.json({
    variables: Array.from(variables),
    filename: file.name
  })
})

export default template
