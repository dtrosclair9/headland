import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Check your email' }

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; mode?: string }>
}) {
  const { email, mode } = await searchParams
  const isReset = mode === 'reset'
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-accent/15 flex items-center justify-center">
        <svg className="w-6 h-6 text-accent-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-primary mb-2">Check your email</h1>
      <p className="text-sm text-gray-600">
        {isReset ? (
          <>
            {email ? (
              <>We sent a password-reset link to <strong>{email}</strong>.</>
            ) : (
              <>We sent you a password-reset link.</>
            )}
            <br />
            Click it from this device to choose a new password.
          </>
        ) : (
          <>
            {email ? (
              <>We sent a magic sign-in link to <strong>{email}</strong>.</>
            ) : (
              <>We sent you a magic sign-in link.</>
            )}
            <br />
            Click it from this device — the link signs you in automatically.
          </>
        )}
      </p>
      <div className="mt-4 rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
        Don&apos;t see it within a minute? <strong>Check your spam or junk folder</strong> — and
        mark it &ldquo;Not spam&rdquo; so future Headland emails land in your inbox.
      </div>
      <p className="mt-6 text-xs text-gray-500">
        Wrong address? <Link href="/login" className="underline">Try again</Link>
      </p>
    </div>
  )
}
