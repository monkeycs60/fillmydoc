/**
 * Simple interval-based scheduler for processing reminders.
 *
 * Runs processReminders() every hour. Skips if RESEND_API_KEY is not set
 * (but still logs in dev mode for testing).
 */

import { processReminders } from './reminder'

const INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let intervalHandle: ReturnType<typeof setInterval> | null = null

/** Start the reminder scheduler */
export function startScheduler(): void {
  if (intervalHandle) {
    console.log('[Scheduler] Already running, skipping start')
    return
  }

  console.log('[Scheduler] Starting reminder scheduler (every 1 hour)')

  // Run once immediately on startup (after a short delay to let the DB initialize)
  setTimeout(async () => {
    console.log('[Scheduler] Running initial reminder check...')
    try {
      const result = await processReminders()
      console.log(`[Scheduler] Initial check complete: ${result.sent} sent, ${result.errors} errors`)
    } catch (error) {
      console.error('[Scheduler] Initial check error:', error)
    }
  }, 5000)

  // Then run every hour
  intervalHandle = setInterval(async () => {
    console.log(`[Scheduler] Running reminder check at ${new Date().toISOString()}`)
    try {
      const result = await processReminders()
      if (result.sent > 0 || result.errors > 0) {
        console.log(`[Scheduler] Reminder check: ${result.sent} sent, ${result.errors} errors`)
      }
    } catch (error) {
      console.error('[Scheduler] Reminder processing error:', error)
    }
  }, INTERVAL_MS)
}

/** Stop the reminder scheduler */
export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log('[Scheduler] Stopped')
  }
}
