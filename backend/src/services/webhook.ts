/**
 * Webhook service — fire-and-forget webhook delivery with HMAC-SHA256 signing
 * and automatic retry on failure (3 attempts, exponential backoff).
 */

import { createHmac, randomBytes, randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db, webhooks, webhookLogs } from '../db/index'

export type WebhookEvent = 'document.signed' | 'document.viewed' | 'job.completed'

interface WebhookPayload {
  event: WebhookEvent
  timestamp: string
  data: Record<string, unknown>
}

/** Generate a 32-byte hex secret for HMAC signing */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

/** Compute HMAC-SHA256 signature for a payload */
function signPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Trigger webhooks for a given event. Fire-and-forget — does not block the caller.
 */
export function triggerWebhook(event: WebhookEvent, data: Record<string, unknown>): void {
  // Run async without awaiting so we don't block the signing flow
  void triggerWebhookAsync(event, data)
}

async function triggerWebhookAsync(event: WebhookEvent, data: Record<string, unknown>): Promise<void> {
  try {
    const activeWebhooks = db
      .select()
      .from(webhooks)
      .where(eq(webhooks.active, true))
      .all()

    for (const webhook of activeWebhooks) {
      // Check if this webhook subscribes to this event
      let subscribedEvents: string[]
      try {
        subscribedEvents = JSON.parse(webhook.events)
      } catch {
        continue
      }

      if (!subscribedEvents.includes(event)) continue

      // Send webhook (fire-and-forget per webhook)
      void sendWebhookWithRetry(webhook, event, data)
    }
  } catch (error) {
    console.error('[Webhook] Error triggering webhooks:', error)
  }
}

async function sendWebhookWithRetry(
  webhook: { id: string; url: string; secret: string; name: string },
  event: WebhookEvent,
  data: Record<string, unknown>,
  maxAttempts = 3
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  }
  const payloadStr = JSON.stringify(payload)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const logId = randomUUID()
    let statusCode: number | null = null
    let responseBody: string | null = null
    let success = false

    try {
      const signature = signPayload(payloadStr, webhook.secret)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Id': logId,
          'User-Agent': 'FillMyDoc-Webhook/1.0',
        },
        body: payloadStr,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      statusCode = res.status
      try {
        responseBody = (await res.text()).slice(0, 2000) // truncate response
      } catch {
        responseBody = null
      }

      success = res.ok // 2xx status
    } catch (error) {
      responseBody = error instanceof Error ? error.message : String(error)
    }

    // Log the attempt
    try {
      db.insert(webhookLogs)
        .values({
          id: logId,
          webhookId: webhook.id,
          event,
          payload: payloadStr,
          statusCode,
          response: responseBody,
          success,
          attempt,
          createdAt: new Date().toISOString(),
        })
        .run()
    } catch (logError) {
      console.error('[Webhook] Failed to log webhook attempt:', logError)
    }

    if (success) {
      return // delivered successfully
    }

    // If not the last attempt, wait with exponential backoff: 1s, 4s, 16s
    if (attempt < maxAttempts) {
      const delayMs = Math.pow(4, attempt - 1) * 1000
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  console.error(`[Webhook] Failed to deliver ${event} to ${webhook.url} after ${maxAttempts} attempts`)
}

/**
 * Send a test webhook to verify connectivity.
 * Returns the log entry for immediate feedback.
 */
export async function sendTestWebhook(
  webhook: { id: string; url: string; secret: string; name: string }
): Promise<{ success: boolean; statusCode: number | null; response: string | null }> {
  const event = 'document.signed' as WebhookEvent
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      documentId: 'test-doc-id',
      jobId: 'test-job-id',
      recipientName: 'Test User',
      signedAt: new Date().toISOString(),
    },
  }
  const payloadStr = JSON.stringify(payload)
  const signature = signPayload(payloadStr, webhook.secret)

  const logId = randomUUID()
  let statusCode: number | null = null
  let responseBody: string | null = null
  let success = false

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event,
        'X-Webhook-Id': logId,
        'User-Agent': 'FillMyDoc-Webhook/1.0',
      },
      body: payloadStr,
      signal: controller.signal,
    })

    clearTimeout(timeout)
    statusCode = res.status
    try {
      responseBody = (await res.text()).slice(0, 2000)
    } catch {
      responseBody = null
    }
    success = res.ok
  } catch (error) {
    responseBody = error instanceof Error ? error.message : String(error)
  }

  // Log the test attempt
  try {
    db.insert(webhookLogs)
      .values({
        id: logId,
        webhookId: webhook.id,
        event: 'test',
        payload: payloadStr,
        statusCode,
        response: responseBody,
        success,
        attempt: 1,
        createdAt: new Date().toISOString(),
      })
      .run()
  } catch (logError) {
    console.error('[Webhook] Failed to log test webhook:', logError)
  }

  return { success, statusCode, response: responseBody }
}
