import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db, webhooks, webhookLogs } from '../db/index'
import { generateWebhookSecret, sendTestWebhook } from '../services/webhook'

const VALID_EVENTS = ['document.signed', 'document.viewed', 'job.completed'] as const

const webhooksRouter = new Hono()

// ---------------------------------------------------------------------------
// GET / — List all webhooks
// ---------------------------------------------------------------------------
webhooksRouter.get('/', (c) => {
  const all = db.select().from(webhooks).orderBy(desc(webhooks.createdAt)).all()

  return c.json({
    webhooks: all.map(w => ({
      id: w.id,
      name: w.name,
      url: w.url,
      events: JSON.parse(w.events),
      active: w.active,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      // Don't expose the full secret — show only last 8 chars
      secretPreview: '...' + w.secret.slice(-8),
    })),
  })
})

// ---------------------------------------------------------------------------
// POST / — Create a new webhook
// ---------------------------------------------------------------------------
webhooksRouter.post('/', async (c) => {
  const body = await c.req.json<{ name: string; url: string; events: string[] }>()

  if (!body.name || body.name.trim().length < 1) {
    return c.json({ error: 'Name is required' }, 400)
  }
  if (!body.url || !isValidUrl(body.url)) {
    return c.json({ error: 'A valid HTTPS URL is required' }, 400)
  }
  if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return c.json({ error: 'At least one event is required' }, 400)
  }

  const invalidEvents = body.events.filter(e => !(VALID_EVENTS as readonly string[]).includes(e))
  if (invalidEvents.length > 0) {
    return c.json({ error: `Invalid events: ${invalidEvents.join(', ')}` }, 400)
  }

  const id = randomUUID()
  const secret = generateWebhookSecret()
  const now = new Date().toISOString()

  db.insert(webhooks)
    .values({
      id,
      name: body.name.trim(),
      url: body.url.trim(),
      secret,
      events: JSON.stringify(body.events),
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  return c.json({
    id,
    name: body.name.trim(),
    url: body.url.trim(),
    events: body.events,
    active: true,
    secret, // Show the full secret only on creation
    createdAt: now,
  }, 201)
})

// ---------------------------------------------------------------------------
// PUT /:id — Update a webhook
// ---------------------------------------------------------------------------
webhooksRouter.put('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json<{ name?: string; url?: string; events?: string[]; active?: boolean }>()

  const existing = db.select().from(webhooks).where(eq(webhooks.id, id)).get()
  if (!existing) return c.json({ error: 'Webhook not found' }, 404)

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }

  if (body.name !== undefined) {
    if (body.name.trim().length < 1) return c.json({ error: 'Name is required' }, 400)
    updates.name = body.name.trim()
  }
  if (body.url !== undefined) {
    if (!isValidUrl(body.url)) return c.json({ error: 'A valid HTTPS URL is required' }, 400)
    updates.url = body.url.trim()
  }
  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return c.json({ error: 'At least one event is required' }, 400)
    }
    const invalidEvents = body.events.filter(e => !(VALID_EVENTS as readonly string[]).includes(e))
    if (invalidEvents.length > 0) {
      return c.json({ error: `Invalid events: ${invalidEvents.join(', ')}` }, 400)
    }
    updates.events = JSON.stringify(body.events)
  }
  if (body.active !== undefined) {
    updates.active = body.active
  }

  db.update(webhooks)
    .set(updates)
    .where(eq(webhooks.id, id))
    .run()

  const updated = db.select().from(webhooks).where(eq(webhooks.id, id)).get()!

  return c.json({
    id: updated.id,
    name: updated.name,
    url: updated.url,
    events: JSON.parse(updated.events),
    active: updated.active,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    secretPreview: '...' + updated.secret.slice(-8),
  })
})

// ---------------------------------------------------------------------------
// DELETE /:id — Delete a webhook and its logs
// ---------------------------------------------------------------------------
webhooksRouter.delete('/:id', (c) => {
  const { id } = c.req.param()

  const existing = db.select().from(webhooks).where(eq(webhooks.id, id)).get()
  if (!existing) return c.json({ error: 'Webhook not found' }, 404)

  db.delete(webhookLogs).where(eq(webhookLogs.webhookId, id)).run()
  db.delete(webhooks).where(eq(webhooks.id, id)).run()

  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// GET /:id/logs — Get logs for a webhook
// ---------------------------------------------------------------------------
webhooksRouter.get('/:id/logs', (c) => {
  const { id } = c.req.param()

  const existing = db.select().from(webhooks).where(eq(webhooks.id, id)).get()
  if (!existing) return c.json({ error: 'Webhook not found' }, 404)

  const logs = db
    .select()
    .from(webhookLogs)
    .where(eq(webhookLogs.webhookId, id))
    .orderBy(desc(webhookLogs.createdAt))
    .limit(100)
    .all()

  return c.json({
    logs: logs.map(l => ({
      id: l.id,
      event: l.event,
      statusCode: l.statusCode,
      success: l.success,
      attempt: l.attempt,
      response: l.response?.slice(0, 500),
      createdAt: l.createdAt,
    })),
  })
})

// ---------------------------------------------------------------------------
// POST /:id/test — Send a test webhook
// ---------------------------------------------------------------------------
webhooksRouter.post('/:id/test', async (c) => {
  const { id } = c.req.param()

  const webhook = db.select().from(webhooks).where(eq(webhooks.id, id)).get()
  if (!webhook) return c.json({ error: 'Webhook not found' }, 404)

  const result = await sendTestWebhook(webhook)

  return c.json({
    success: result.success,
    statusCode: result.statusCode,
    response: result.response?.slice(0, 500),
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export default webhooksRouter
