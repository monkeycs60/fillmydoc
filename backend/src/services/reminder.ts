/**
 * Reminder service for pending signing requests.
 *
 * Sends reminder emails to recipients who have not yet signed their documents.
 * Configurable intervals (default: J+3, J+7, J+14) with a maximum reminder count.
 */

import { db, signingRequests } from '../db/index'
import { eq } from 'drizzle-orm'
import { appendAuditEvent } from './otp'

// Default reminder intervals in days after document creation
const DEFAULT_INTERVALS = [3, 7, 14]

/** Parse reminder intervals from JSON string, falling back to defaults */
function parseIntervals(json: string | null): number[] {
  if (!json) return DEFAULT_INTERVALS
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed) && parsed.every((n: unknown) => typeof n === 'number' && n > 0)) {
      return parsed.sort((a: number, b: number) => a - b)
    }
    return DEFAULT_INTERVALS
  } catch {
    return DEFAULT_INTERVALS
  }
}

/** Compute the next reminder date based on creation date and intervals */
function computeNextReminderAt(
  createdAt: string,
  reminderCount: number,
  intervals: number[]
): string | null {
  if (reminderCount >= intervals.length) return null

  const created = new Date(createdAt)
  const daysOffset = intervals[reminderCount]
  const next = new Date(created.getTime() + daysOffset * 24 * 60 * 60 * 1000)
  return next.toISOString()
}

/** Schedule reminders for a document (called after creation) */
export function scheduleReminders(
  documentId: string,
  intervals?: number[],
  maxReminders?: number
): void {
  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, documentId)).get()
  if (!doc) return

  const resolvedIntervals = intervals || DEFAULT_INTERVALS
  const resolvedMax = maxReminders ?? resolvedIntervals.length

  const nextReminderAt = computeNextReminderAt(doc.createdAt, 0, resolvedIntervals)

  db.update(signingRequests)
    .set({
      reminderIntervals: JSON.stringify(resolvedIntervals),
      maxReminders: resolvedMax,
      nextReminderAt,
      reminderCount: 0,
    })
    .where(eq(signingRequests.id, documentId))
    .run()
}

/** Build the reminder email HTML */
function buildReminderEmailHtml(
  recipientName: string,
  fileName: string,
  signingUrl: string,
  daysSinceCreation: number,
  reminderNumber: number,
  maxReminders: number,
  lang: string = 'fr'
): string {
  const translations: Record<string, {
    subject: string
    greeting: string
    reminderText: string
    daysSince: string
    ctaButton: string
    footer: string
    reminderCount: string
  }> = {
    fr: {
      subject: 'Rappel : document en attente de signature',
      greeting: 'Bonjour',
      reminderText: 'Vous avez un document en attente de signature.',
      daysSince: `Ce document a ete cree il y a ${daysSinceCreation} jour(s).`,
      ctaButton: 'Signer le document',
      footer: 'Ceci est un rappel automatique. Si vous avez deja signe ce document, veuillez ignorer cet email.',
      reminderCount: `Rappel ${reminderNumber}/${maxReminders}`,
    },
    en: {
      subject: 'Reminder: document awaiting signature',
      greeting: 'Hello',
      reminderText: 'You have a document awaiting your signature.',
      daysSince: `This document was created ${daysSinceCreation} day(s) ago.`,
      ctaButton: 'Sign the document',
      footer: 'This is an automatic reminder. If you have already signed this document, please ignore this email.',
      reminderCount: `Reminder ${reminderNumber}/${maxReminders}`,
    },
    es: {
      subject: 'Recordatorio: documento pendiente de firma',
      greeting: 'Hola',
      reminderText: 'Tiene un documento pendiente de firma.',
      daysSince: `Este documento fue creado hace ${daysSinceCreation} dia(s).`,
      ctaButton: 'Firmar el documento',
      footer: 'Este es un recordatorio automatico. Si ya ha firmado este documento, ignore este correo.',
      reminderCount: `Recordatorio ${reminderNumber}/${maxReminders}`,
    },
    de: {
      subject: 'Erinnerung: Dokument wartet auf Unterschrift',
      greeting: 'Hallo',
      reminderText: 'Ein Dokument wartet auf Ihre Unterschrift.',
      daysSince: `Dieses Dokument wurde vor ${daysSinceCreation} Tag(en) erstellt.`,
      ctaButton: 'Dokument unterschreiben',
      footer: 'Dies ist eine automatische Erinnerung. Wenn Sie dieses Dokument bereits unterschrieben haben, ignorieren Sie bitte diese E-Mail.',
      reminderCount: `Erinnerung ${reminderNumber}/${maxReminders}`,
    },
  }

  const t = translations[lang] || translations.fr

  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="border-top: 3px solid #ea580c; padding: 32px 0;">
        <h2 style="color: #111; font-size: 20px; margin: 0 0 4px;">FillMyDoc</h2>
        <p style="color: #ea580c; font-size: 12px; font-weight: 600; margin: 0 0 24px; text-transform: uppercase; letter-spacing: 1px;">${t.reminderCount}</p>

        <p style="color: #333; font-size: 14px;">${t.greeting} ${recipientName},</p>
        <p style="color: #333; font-size: 14px;">${t.reminderText}</p>

        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="color: #9a3412; font-size: 13px; margin: 0 0 4px; font-weight: 600;">${fileName}</p>
          <p style="color: #c2410c; font-size: 12px; margin: 0;">${t.daysSince}</p>
        </div>

        <a href="${signingUrl}" style="display: inline-block; background: #ea580c; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">${t.ctaButton}</a>

        <p style="color: #999; font-size: 11px; margin-top: 24px; line-height: 1.5;">${t.footer}</p>
      </div>
    </div>
  `
}

/** Get the email subject line for a reminder */
function getReminderSubject(lang: string = 'fr'): string {
  const subjects: Record<string, string> = {
    fr: 'FillMyDoc — Rappel : document en attente de signature',
    en: 'FillMyDoc — Reminder: document awaiting signature',
    es: 'FillMyDoc — Recordatorio: documento pendiente de firma',
    de: 'FillMyDoc — Erinnerung: Dokument wartet auf Unterschrift',
  }
  return subjects[lang] || subjects.fr
}

/** Send a single reminder email via Resend */
async function sendReminderEmail(
  email: string,
  recipientName: string,
  fileName: string,
  signingUrl: string,
  daysSinceCreation: number,
  reminderNumber: number,
  maxReminders: number
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return false

  try {
    const fromEmail = process.env.EMAIL_FROM || 'FillMyDoc <noreply@fillmydoc.com>'
    const html = buildReminderEmailHtml(
      recipientName,
      fileName,
      signingUrl,
      daysSinceCreation,
      reminderNumber,
      maxReminders
    )
    const subject = getReminderSubject()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject,
        html,
      }),
    })

    return res.ok
  } catch (error) {
    console.error('[Reminder] Email send error:', error)
    return false
  }
}

/** Process all due reminders — called periodically by the scheduler */
export async function processReminders(): Promise<{ sent: number; errors: number }> {
  const now = new Date().toISOString()
  let sent = 0
  let errors = 0

  // Statuses that mean the document is still awaiting signature
  const pendingStatuses = ['pending', 'otp_sent', 'esign_pending']

  // Find all documents where:
  // - status is pending/otp_sent/esign_pending
  // - nextReminderAt <= now
  // - reminderCount < maxReminders
  // - recipientEmail is set
  const allPending = db.select().from(signingRequests).all()

  const dueDocs = allPending.filter(doc => {
    if (!pendingStatuses.includes(doc.status)) return false
    if (!doc.nextReminderAt) return false
    if (doc.nextReminderAt > now) return false
    if (!doc.recipientEmail) return false
    const reminderCount = doc.reminderCount ?? 0
    const maxReminders = doc.maxReminders ?? 3
    if (reminderCount >= maxReminders) return false
    return true
  })

  const baseUrl = process.env.APP_URL || 'http://localhost:5173'

  for (const doc of dueDocs) {
    const reminderCount = doc.reminderCount ?? 0
    const maxReminders = doc.maxReminders ?? 3
    const intervals = parseIntervals(doc.reminderIntervals ?? null)
    const daysSinceCreation = Math.floor(
      (Date.now() - new Date(doc.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    const newReminderCount = reminderCount + 1
    const signingUrl = `${baseUrl}/fr/sign/${doc.id}`

    const emailSent = await sendReminderEmail(
      doc.recipientEmail!,
      doc.recipientName || doc.recipientEmail!,
      doc.fileName,
      signingUrl,
      daysSinceCreation,
      newReminderCount,
      maxReminders
    )

    if (emailSent) {
      sent++
      console.log(`[Reminder] Sent reminder ${newReminderCount}/${maxReminders} for doc ${doc.id} to ${doc.recipientEmail}`)
    } else {
      errors++
      // In dev mode (no RESEND_API_KEY), still count it and advance the state
      if (!process.env.RESEND_API_KEY) {
        console.log(`[Reminder] (dev) Would send reminder ${newReminderCount}/${maxReminders} for doc ${doc.id} to ${doc.recipientEmail}`)
        sent++
        errors--
      } else {
        console.error(`[Reminder] Failed to send reminder for doc ${doc.id}`)
        continue // Don't update count on failure
      }
    }

    // Compute next reminder date
    const nextReminderAt = computeNextReminderAt(doc.createdAt, newReminderCount, intervals)

    // Update audit trail
    const auditTrail = appendAuditEvent(doc.auditTrail, 'reminder_sent', {
      reminderNumber: newReminderCount,
      maxReminders,
      email: doc.recipientEmail!,
      daysSinceCreation,
    })

    db.update(signingRequests)
      .set({
        reminderCount: newReminderCount,
        lastReminderAt: new Date().toISOString(),
        nextReminderAt: nextReminderAt,
        auditTrail,
      })
      .where(eq(signingRequests.id, doc.id))
      .run()
  }

  return { sent, errors }
}

/** Update reminder configuration for a single document */
export function configureDocumentReminders(
  documentId: string,
  config: { maxReminders?: number; intervals?: number[]; enabled?: boolean }
): boolean {
  const doc = db.select().from(signingRequests).where(eq(signingRequests.id, documentId)).get()
  if (!doc) return false

  // If explicitly disabled, clear next reminder
  if (config.enabled === false) {
    db.update(signingRequests)
      .set({ nextReminderAt: null })
      .where(eq(signingRequests.id, documentId))
      .run()
    return true
  }

  const intervals = config.intervals || parseIntervals(doc.reminderIntervals ?? null)
  const maxReminders = config.maxReminders ?? doc.maxReminders ?? 3
  const reminderCount = doc.reminderCount ?? 0

  const nextReminderAt = reminderCount < maxReminders
    ? computeNextReminderAt(doc.createdAt, reminderCount, intervals)
    : null

  db.update(signingRequests)
    .set({
      maxReminders,
      reminderIntervals: JSON.stringify(intervals),
      nextReminderAt,
    })
    .where(eq(signingRequests.id, documentId))
    .run()

  return true
}

/** Update reminder configuration for all documents in a job */
export function configureJobReminders(
  jobId: string,
  config: { maxReminders?: number; intervals?: number[]; enabled?: boolean }
): number {
  const docs = db.select().from(signingRequests).where(eq(signingRequests.jobId, jobId)).all()
  let updated = 0
  for (const doc of docs) {
    if (configureDocumentReminders(doc.id, config)) updated++
  }
  return updated
}
