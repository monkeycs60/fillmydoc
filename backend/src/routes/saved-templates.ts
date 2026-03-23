import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, savedTemplates } from '../db/index'
import { randomUUID } from 'crypto'

const savedTemplatesRoute = new Hono()

// ---------------------------------------------------------------------------
// GET / — List all saved templates
// ---------------------------------------------------------------------------
savedTemplatesRoute.get('/', async (c) => {
  const templates = db.select().from(savedTemplates).all()

  return c.json({
    templates: templates.map(t => ({
      id: t.id,
      name: t.name,
      templateHash: t.templateHash,
      variables: JSON.parse(t.variables || '[]'),
      conditions: JSON.parse(t.conditions || '[]'),
      mapping: JSON.parse(t.mapping || '{}'),
      conditionsMapping: JSON.parse(t.conditionsMapping || '{}'),
      prefix: t.prefix || '',
      nameColumn: t.nameColumn || '',
      emailColumn: t.emailColumn || '',
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  })
})

// ---------------------------------------------------------------------------
// POST / — Save a new template config
// ---------------------------------------------------------------------------
savedTemplatesRoute.post('/', async (c) => {
  const body = await c.req.json<{
    name: string
    templateHash?: string
    variables: string[]
    conditions?: string[]
    mapping: Record<string, string>
    conditionsMapping?: Record<string, string>
    prefix?: string
    nameColumn?: string
    emailColumn?: string
  }>()

  if (!body.name || body.name.trim().length === 0) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const now = new Date().toISOString()
  const id = randomUUID()

  db.insert(savedTemplates).values({
    id,
    name: body.name.trim(),
    templateHash: body.templateHash || null,
    variables: JSON.stringify(body.variables || []),
    conditions: JSON.stringify(body.conditions || []),
    mapping: JSON.stringify(body.mapping || {}),
    conditionsMapping: JSON.stringify(body.conditionsMapping || {}),
    prefix: body.prefix || '',
    nameColumn: body.nameColumn || '',
    emailColumn: body.emailColumn || '',
    createdAt: now,
    updatedAt: now,
  }).run()

  return c.json({
    id,
    name: body.name.trim(),
    templateHash: body.templateHash || null,
    variables: body.variables || [],
    conditions: body.conditions || [],
    mapping: body.mapping || {},
    conditionsMapping: body.conditionsMapping || {},
    prefix: body.prefix || '',
    nameColumn: body.nameColumn || '',
    emailColumn: body.emailColumn || '',
    createdAt: now,
    updatedAt: now,
  }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — Update a saved template (rename, update mapping)
// ---------------------------------------------------------------------------
savedTemplatesRoute.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{
    name?: string
    templateHash?: string
    variables?: string[]
    conditions?: string[]
    mapping?: Record<string, string>
    conditionsMapping?: Record<string, string>
    prefix?: string
    nameColumn?: string
    emailColumn?: string
  }>()

  const existing = db.select().from(savedTemplates).where(eq(savedTemplates.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Saved template not found' }, 404)
  }

  const now = new Date().toISOString()

  const updates: Record<string, string | null> = { updatedAt: now }

  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.templateHash !== undefined) updates.templateHash = body.templateHash
  if (body.variables !== undefined) updates.variables = JSON.stringify(body.variables)
  if (body.conditions !== undefined) updates.conditions = JSON.stringify(body.conditions)
  if (body.mapping !== undefined) updates.mapping = JSON.stringify(body.mapping)
  if (body.conditionsMapping !== undefined) updates.conditionsMapping = JSON.stringify(body.conditionsMapping)
  if (body.prefix !== undefined) updates.prefix = body.prefix
  if (body.nameColumn !== undefined) updates.nameColumn = body.nameColumn
  if (body.emailColumn !== undefined) updates.emailColumn = body.emailColumn

  db.update(savedTemplates)
    .set(updates)
    .where(eq(savedTemplates.id, id))
    .run()

  const updated = db.select().from(savedTemplates).where(eq(savedTemplates.id, id)).get()!

  return c.json({
    id: updated.id,
    name: updated.name,
    templateHash: updated.templateHash,
    variables: JSON.parse(updated.variables || '[]'),
    conditions: JSON.parse(updated.conditions || '[]'),
    mapping: JSON.parse(updated.mapping || '{}'),
    conditionsMapping: JSON.parse(updated.conditionsMapping || '{}'),
    prefix: updated.prefix || '',
    nameColumn: updated.nameColumn || '',
    emailColumn: updated.emailColumn || '',
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  })
})

// ---------------------------------------------------------------------------
// DELETE /:id — Delete a saved template
// ---------------------------------------------------------------------------
savedTemplatesRoute.delete('/:id', async (c) => {
  const { id } = c.req.param()

  const existing = db.select().from(savedTemplates).where(eq(savedTemplates.id, id)).get()
  if (!existing) {
    return c.json({ error: 'Saved template not found' }, 404)
  }

  db.delete(savedTemplates).where(eq(savedTemplates.id, id)).run()

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// GET /match/:hash — Find saved template by template hash (for auto-detection)
// ---------------------------------------------------------------------------
savedTemplatesRoute.get('/match/:hash', async (c) => {
  const { hash } = c.req.param()

  const match = db.select().from(savedTemplates)
    .where(eq(savedTemplates.templateHash, hash))
    .get()

  if (!match) {
    return c.json({ match: null })
  }

  return c.json({
    match: {
      id: match.id,
      name: match.name,
      templateHash: match.templateHash,
      variables: JSON.parse(match.variables || '[]'),
      conditions: JSON.parse(match.conditions || '[]'),
      mapping: JSON.parse(match.mapping || '{}'),
      conditionsMapping: JSON.parse(match.conditionsMapping || '{}'),
      prefix: match.prefix || '',
      nameColumn: match.nameColumn || '',
      emailColumn: match.emailColumn || '',
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
    },
  })
})

export default savedTemplatesRoute
