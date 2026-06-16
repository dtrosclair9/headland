import type { Metadata } from 'next'
import { setNewPassword } from '../actions'

export const metadata: Metadata = { title: 'Set a new password' }

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-2xl font-bold text-primary mb-2">Set a new password</h1>
      <p className="text-sm text-gray-600 mb-6">Choose a new password for your account.</p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={setNewPassword} className="space-y-4">
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            placeholder="Re-enter your password"
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          Update password
        </button>
      </form>
    </div>
  )
}
