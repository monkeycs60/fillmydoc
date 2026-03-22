/**
 * OpenAPI.com EU-SES (Simple Electronic Signature with OTP) integration.
 *
 * Docs: https://console.openapi.com/apis/esignature/documentation
 * Product: https://openapi.com/products/european-esignature
 *
 * Set OPENAPI_ESIGN_TOKEN env var to enable.
 * When not set, the app falls back to local enhanced signing (OTP email + audit trail).
 */

const PROD_BASE = 'https://esignature.openapi.com'
const SANDBOX_BASE = 'https://test.esignature.openapi.com'

function getBaseUrl(): string {
  return process.env.OPENAPI_ESIGN_SANDBOX === 'true' ? SANDBOX_BASE : PROD_BASE
}

function getToken(): string | null {
  return process.env.OPENAPI_ESIGN_TOKEN || null
}

export function isEsignEnabled(): boolean {
  return !!getToken()
}

export interface EsignSigner {
  firstName: string
  lastName: string
  email?: string
  phone?: string
}

export interface EsignRequest {
  /** OpenAPI.com request ID */
  id: string
  /** Current state: WAIT_VALIDATION, COMPLETED, etc. */
  state: string
  /** Signing URL for the signer */
  signingUrl?: string
}

/**
 * Create a signing request via OpenAPI.com EU-SES endpoint.
 * Sends the PDF as base64 and configures the signer with OTP authentication.
 */
export async function createSigningRequest(
  pdfBuffer: Buffer,
  signer: EsignSigner,
  callbackUrl?: string
): Promise<EsignRequest> {
  const token = getToken()
  if (!token) throw new Error('OpenAPI.com e-signature token not configured')

  const base64Pdf = pdfBuffer.toString('base64')

  const body: Record<string, unknown> = {
    title: 'FillMyDoc - Document Signing',
    documents: [
      {
        content: base64Pdf,
        contentType: 'application/pdf',
      }
    ],
    signers: [
      {
        firstName: signer.firstName,
        lastName: signer.lastName,
        ...(signer.email ? { email: signer.email } : {}),
        ...(signer.phone ? { phone: signer.phone } : {}),
        authMethod: signer.email ? 'email' : 'sms',
      }
    ],
  }

  if (callbackUrl) {
    body.callbackUrl = callbackUrl
  }

  const res = await fetch(`${getBaseUrl()}/EU-SES`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenAPI.com EU-SES error (${res.status}): ${error}`)
  }

  const data = await res.json() as Record<string, unknown>

  return {
    id: data.id as string,
    state: (data.state as string) || 'WAIT_VALIDATION',
    signingUrl: data.signingUrl as string | undefined,
  }
}

/**
 * Check the status of a signing request.
 */
export async function getSigningStatus(requestId: string): Promise<{ state: string; signedAt?: string }> {
  const token = getToken()
  if (!token) throw new Error('OpenAPI.com e-signature token not configured')

  const res = await fetch(`${getBaseUrl()}/signatures/${requestId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenAPI.com status check error (${res.status}): ${error}`)
  }

  const data = await res.json() as Record<string, unknown>
  return {
    state: data.state as string,
    signedAt: data.signedAt as string | undefined,
  }
}

/**
 * Download the signed document from OpenAPI.com.
 */
export async function downloadSignedDocument(requestId: string): Promise<Buffer> {
  const token = getToken()
  if (!token) throw new Error('OpenAPI.com e-signature token not configured')

  const res = await fetch(`${getBaseUrl()}/signatures/${requestId}/signedDocument`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenAPI.com download error (${res.status}): ${error}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
