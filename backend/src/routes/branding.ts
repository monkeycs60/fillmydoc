import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, branding } from '../db/index'
import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const brandingRoutes = new Hono()

const BRANDING_DIR = join(process.cwd(), 'data', 'branding')

// Ensure branding directory exists
async function ensureBrandingDir() {
  await mkdir(BRANDING_DIR, { recursive: true })
}

// ---------------------------------------------------------------------------
// GET / — Get current branding config
// ---------------------------------------------------------------------------
brandingRoutes.get('/', async (c) => {
  const config = db.select().from(branding).where(eq(branding.id, 'default')).get()

  if (!config) {
    return c.json({
      primaryColor: '#2563eb',
      companyName: null,
      hasLogo: false,
    })
  }

  return c.json({
    primaryColor: config.primaryColor || '#2563eb',
    companyName: config.companyName || null,
    hasLogo: !!config.logoPath && existsSync(config.logoPath),
    updatedAt: config.updatedAt,
  })
})

// ---------------------------------------------------------------------------
// PUT / — Update branding config (JSON body: primaryColor, companyName)
// ---------------------------------------------------------------------------
brandingRoutes.put('/', async (c) => {
  const body = await c.req.json<{ primaryColor?: string; companyName?: string }>()

  // Validate primary color (hex format)
  if (body.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(body.primaryColor)) {
    return c.json({ error: 'Invalid color format. Use hex format like #2563eb' }, 400)
  }

  const config = db.select().from(branding).where(eq(branding.id, 'default')).get()

  if (!config) {
    db.insert(branding).values({
      id: 'default',
      primaryColor: body.primaryColor || '#2563eb',
      companyName: body.companyName || null,
      updatedAt: new Date().toISOString(),
    }).run()
  } else {
    db.update(branding)
      .set({
        primaryColor: body.primaryColor ?? config.primaryColor,
        companyName: body.companyName !== undefined ? (body.companyName || null) : config.companyName,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(branding.id, 'default'))
      .run()
  }

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// POST /logo — Upload logo (FormData with image file)
// ---------------------------------------------------------------------------
brandingRoutes.post('/logo', async (c) => {
  await ensureBrandingDir()

  const formData = await c.req.formData()
  const file = formData.get('logo')

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No logo file provided' }, 400)
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'Invalid file type. Accepted: PNG, JPEG, SVG' }, 400)
  }

  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    return c.json({ error: 'File too large. Maximum 2MB.' }, 400)
  }

  // Determine extension
  const ext = file.type === 'image/svg+xml' ? 'svg'
    : file.type === 'image/png' ? 'png'
    : 'jpg'

  const logoPath = join(BRANDING_DIR, `logo.${ext}`)

  // Remove old logo files
  for (const oldExt of ['png', 'jpg', 'jpeg', 'svg']) {
    const oldPath = join(BRANDING_DIR, `logo.${oldExt}`)
    if (existsSync(oldPath)) {
      await unlink(oldPath)
    }
  }

  // Save new logo
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(logoPath, buffer)

  // Update DB
  db.update(branding)
    .set({
      logoPath,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(branding.id, 'default'))
    .run()

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// DELETE /logo — Remove logo
// ---------------------------------------------------------------------------
brandingRoutes.delete('/logo', async (c) => {
  const config = db.select().from(branding).where(eq(branding.id, 'default')).get()

  if (config?.logoPath && existsSync(config.logoPath)) {
    await unlink(config.logoPath)
  }

  db.update(branding)
    .set({
      logoPath: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(branding.id, 'default'))
    .run()

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// GET /logo — Serve logo file
// ---------------------------------------------------------------------------
brandingRoutes.get('/logo', async (c) => {
  const config = db.select().from(branding).where(eq(branding.id, 'default')).get()

  if (!config?.logoPath || !existsSync(config.logoPath)) {
    return c.json({ error: 'No logo found' }, 404)
  }

  const logoBuffer = await readFile(config.logoPath)

  const ext = config.logoPath.split('.').pop()?.toLowerCase()
  const contentType = ext === 'svg' ? 'image/svg+xml'
    : ext === 'png' ? 'image/png'
    : 'image/jpeg'

  return new Response(logoBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

export default brandingRoutes
