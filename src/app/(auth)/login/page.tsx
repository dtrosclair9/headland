import Link from 'next/link'
import type { Metadata } from 'next'
import { signIn } from '../actions'

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
      <p className="text-sm text-gray-600 mb-6">
        Welcome back. We&apos;ll email you a magic link.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={signIn} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" placeholder="you@farm.com" />
        </div>
        <button type="submit" className="btn-primary w-full">
          Send magic link
        </button>
      </form>

      <p className="mt-6 text-sm text-gray-600 text-center">
        New here? <Link href="/signup" className="text-primary font-semibold hover:underline">Start free</Link>
      </p>
    </div>
  )
}
