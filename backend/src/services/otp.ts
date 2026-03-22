/**
 * Simple OTP (One-Time Password) service for email-based verification.
 * Used in local enhanced signing mode (when OpenAPI.com is not configured).
 *
 * OTP codes are 6-digit numbers, valid for 10 minutes, max 5 attempts.
 */

import { createHash, randomInt } from 'crypto'

const OTP_LENGTH = 6
const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

/** Generate a 6-digit OTP code */
export function generateOtp(): { code: string; hash: string; expiresAt: string } {
  const code = String(randomInt(100000, 999999))
  const hash = hashOtp(code)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()
  return { code, hash, expiresAt }
}

/** Hash an OTP code for storage (SHA-256) */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

/** Verify an OTP code against its hash */
export function verifyOtp(
  code: string,
  storedHash: string,
  expiresAt: string,
  attempts: number
): { valid: boolean; error?: string } {
  if (attempts >= MAX_ATTEMPTS) {
    return { valid: false, error: 'too_many_attempts' }
  }

  if (new Date(expiresAt) < new Date()) {
    return { valid: false, error: 'otp_expired' }
  }

  const inputHash = hashOtp(code)
  if (inputHash !== storedHash) {
    return { valid: false, error: 'invalid_otp' }
  }

  return { valid: true }
}

/** Compute SHA-256 hash of a file buffer */
export function hashDocument(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Build an audit event entry */
export function createAuditEvent(
  action: string,
  details: Record<string, string | number | boolean | null>
): { timestamp: string; action: string; details: Record<string, string | number | boolean | null> } {
  return {
    timestamp: new Date().toISOString(),
    action,
    details,
  }
}

/** Parse stored audit trail JSON, returning empty array on failure */
export function parseAuditTrail(json: string | null): Array<ReturnType<typeof createAuditEvent>> {
  if (!json) return []
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}

/** Append an event to the audit trail and return the updated JSON string */
export function appendAuditEvent(
  existingJson: string | null,
  action: string,
  details: Record<string, string | number | boolean | null>
): string {
  const trail = parseAuditTrail(existingJson)
  trail.push(createAuditEvent(action, details))
  return JSON.stringify(trail)
}
