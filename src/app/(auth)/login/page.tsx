import Link from 'next/link'
import type { Metadata } from 'next'
import { signIn, signInWithLink } from '../actions'

export const metadata: Metadata = { title: 'Log in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-2xl font-bold text-primary mb-2">Log in</h1>
      <p className="text-sm text-gray-600 mb-6">Welcome back.</p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={signIn} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@farm.com" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" placeholder="Your password" />
        </div>
        <button type="submit" className="btn-primary w-full">
          Log in
        </button>
      </form>

      <details className="mt-6">
        <summary className="text-sm text-gray-500 cursor-pointer hover:text-primary text-center list-none">
          Trouble logging in? Email me a one-time link instead
        </summary>
        <form action={signInWithLink} className="mt-3 space-y-3">
          <input
            id="link_email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="you@farm.com"
          />
          <button type="submit" className="w-full text-sm font-semibold rounded-md border-2 border-primary text-primary px-3 py-2 hover:bg-primary/5">
            Send me a login link
          </button>
          <p className="text-xs text-gray-400 text-center">
            No password yet? Email yourself a one-time link, then set one in Settings.
          </p>
        </form>
      </details>

      <p className="mt-6 text-sm text-gray-600 text-center">
        New here? <Link href="/signup" className="text-primary font-semibold hover:underline">Start free</Link>
      </p>
    </div>
  )
}
