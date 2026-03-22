import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface SigningDoc {
  id: string
  fileName: string
  recipientName: string | null
  recipientEmail: string | null
  status: string
  signedAt: string | null
  signedByName: string | null
  documentHash: string | null
  esignProvider: string | null
  esignSigningUrl: string | null
  requiresOtp: boolean
}

type SigningStep = 'loading' | 'identity' | 'otp' | 'signing' | 'esign_redirect' | 'signed' | 'error'

export function SigningPage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [doc, setDoc] = useState<SigningDoc | null>(null)
  const [step, setStep] = useState<SigningStep>('loading')
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [devOtp, setDevOtp] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/signing/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
          setStep('error')
        } else {
          setDoc(data)
          if (data.status === 'signed' || data.status === 'esign_completed') {
            setStep('signed')
          } else if (data.status === 'otp_sent') {
            setSignerEmail(data.recipientEmail || '')
            setStep('otp')
          } else if (data.status === 'esign_pending' && data.esignSigningUrl) {
            setStep('esign_redirect')
          } else {
            setSignerEmail(data.recipientEmail || '')
            setStep('identity')
          }
        }
      })
      .catch(() => {
        setError('Failed to load document')
        setStep('error')
      })
  }, [token])

  // Request OTP
  const handleRequestOtp = async () => {
    if (!signerName.trim() || signerName.trim().length < 2) return
    if (!signerEmail.trim() || !signerEmail.includes('@')) return

    setError(null)
    setStep('signing')

    try {
      const res = await fetch(`/api/signing/${token}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signerEmail.trim(), name: signerName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.devOtp) setDevOtp(data.devOtp)
      setStep('otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP')
      setStep('identity')
    }
  }

  // Verify OTP
  const handleVerifyOtp = async () => {
    if (!otpCode.trim() || otpCode.trim().length !== 6) return

    setError(null)
    setStep('signing')

    try {
      const res = await fetch(`/api/signing/${token}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpCode.trim(), name: signerName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setDoc(prev => prev ? {
        ...prev,
        status: 'signed',
        signedAt: data.signedAt,
        signedByName: data.signedByName,
        documentHash: data.documentHash,
      } : null)
      setStep('signed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
      setStep('otp')
    }
  }

  // Simple sign (backward compat or OpenAPI.com mode)
  const handleSimpleSign = async () => {
    if (!signerName.trim() || signerName.trim().length < 2) return

    setError(null)
    setStep('signing')

    try {
      const res = await fetch(`/api/signing/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signerName.trim(), email: signerEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.mode === 'esign' && data.signingUrl) {
        setDoc(prev => prev ? { ...prev, esignSigningUrl: data.signingUrl, status: 'esign_pending' } : null)
        setStep('esign_redirect')
        return
      }

      setDoc(prev => prev ? {
        ...prev,
        status: 'signed',
        signedAt: data.signedAt,
        signedByName: data.signedByName,
        documentHash: data.documentHash,
      } : null)
      setStep('signed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed')
      setStep('identity')
    }
  }

  // Loading
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Error (no doc loaded)
  if (step === 'error' && !doc) {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-t-2 border-blue-600" />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <p className="text-gray-500">{t('signing.not_found')}</p>
        </div>
      </div>
    )
  }

  if (!doc) return null

  return (
    <div className="min-h-screen bg-white">
      <div className="border-t-2 border-blue-600" />

      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-mono text-2xl font-bold text-gray-900">{t('signing.page_title')}</h1>
          <span className="text-sm text-gray-400 font-mono">{doc.fileName}</span>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 border-l-4 border-red-500 bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* PDF Preview */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            {t('signing.preview_label')}
          </p>
          <div className="border border-gray-200 rounded-md overflow-hidden" style={{ height: '500px' }}>
            <iframe
              src={`/api/signing/${token}/pdf`}
              className="w-full h-full"
              title="PDF Preview"
            />
          </div>
        </div>

        {/* Step: Identity (name + email) */}
        {step === 'identity' && (
          <div className="border border-gray-200 rounded-md p-6">
            {/* Security badge */}
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                {t('signing.secure_signing')}
              </span>
            </div>

            <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
              {t('signing.sign_label')}
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={t('signing.sign_placeholder')}
              className="w-full border-0 border-b border-gray-200 rounded-none bg-transparent px-0 py-2 text-lg focus:border-blue-600 focus:ring-0 outline-none mb-4"
            />

            {doc.requiresOtp && (
              <>
                <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
                  {t('signing.email_label')}
                </label>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder={t('signing.email_placeholder')}
                  className="w-full border-0 border-b border-gray-200 rounded-none bg-transparent px-0 py-2 text-lg focus:border-blue-600 focus:ring-0 outline-none mb-4"
                />
              </>
            )}

            <p className="text-xs text-gray-400 mb-6">
              {doc.requiresOtp ? t('signing.otp_disclaimer') : t('signing.sign_disclaimer')}
            </p>

            <button
              onClick={doc.requiresOtp ? handleRequestOtp : handleSimpleSign}
              disabled={
                signerName.trim().length < 2 ||
                (doc.requiresOtp && (!signerEmail.trim() || !signerEmail.includes('@')))
              }
              className="w-full py-3 rounded-md font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {doc.requiresOtp ? t('signing.send_otp_button') : t('signing.sign_button')}
            </button>
          </div>
        )}

        {/* Step: OTP Verification */}
        {step === 'otp' && (
          <div className="border border-gray-200 rounded-md p-6">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-gray-100">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                {t('signing.otp_verification')}
              </span>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              {t('signing.otp_sent_message', { email: signerEmail })}
            </p>

            {devOtp && (
              <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
                DEV MODE — OTP: <span className="font-mono font-bold">{devOtp}</span>
              </div>
            )}

            <label className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 block">
              {t('signing.otp_label')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full border-0 border-b border-gray-200 rounded-none bg-transparent px-0 py-2 text-2xl text-center font-mono tracking-[0.5em] focus:border-blue-600 focus:ring-0 outline-none mb-6"
            />

            <button
              onClick={handleVerifyOtp}
              disabled={otpCode.trim().length !== 6}
              className="w-full py-3 rounded-md font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors mb-3"
            >
              {t('signing.verify_and_sign')}
            </button>

            <button
              onClick={() => {
                setOtpCode('')
                setDevOtp(null)
                handleRequestOtp()
              }}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {t('signing.resend_otp')}
            </button>
          </div>
        )}

        {/* Step: Signing in progress */}
        {step === 'signing' && (
          <div className="border border-gray-200 rounded-md p-8 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-gray-900 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm text-gray-500">{t('signing.processing')}</p>
          </div>
        )}

        {/* Step: E-sign redirect (OpenAPI.com) */}
        {step === 'esign_redirect' && doc.esignSigningUrl && (
          <div className="border border-blue-200 bg-blue-50/30 rounded-md p-6 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <p className="font-medium text-blue-800 mb-2">{t('signing.esign_redirect_title')}</p>
            <p className="text-sm text-blue-700 mb-4">{t('signing.esign_redirect_message')}</p>
            <a
              href={doc.esignSigningUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              {t('signing.esign_redirect_button')}
            </a>
          </div>
        )}

        {/* Step: Signed */}
        {step === 'signed' && (
          <div className="border border-green-200 bg-green-50/30 rounded-md p-6 text-center">
            <svg className="w-10 h-10 mx-auto mb-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="font-medium text-green-800 mb-1">{t('signing.signed_title')}</p>
            <p className="text-sm text-green-700">
              {t('signing.signed_message', {
                name: doc.signedByName,
                date: doc.signedAt ? new Date(doc.signedAt).toLocaleDateString() : '',
              })}
            </p>
            {doc.documentHash && (
              <p className="text-xs text-green-600/60 font-mono mt-2">
                SHA-256: {doc.documentHash.slice(0, 16)}...
              </p>
            )}
            <a
              href={`/api/signing/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 px-6 py-2 border border-green-300 rounded-md text-sm text-green-800 hover:bg-green-50 transition-colors"
            >
              {t('signing.download_signed')}
            </a>
            <a
              href={`/api/signing/${token}/audit`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 px-6 py-2 text-xs text-green-600 hover:text-green-800 transition-colors"
            >
              {t('signing.download_audit')}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
