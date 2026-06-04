import Link from 'next/link'
import type { Metadata } from 'next'
import { signUp } from '../actions'

export const metadata: Metadata = { title: 'Start your free trial' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-2xl font-bold text-primary mb-2">Start your free trial</h1>
      <p className="text-sm text-gray-600 mb-6">
        Full access for 14 days. No credit card to start.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form action={signUp} className="space-y-5">
        <div>
          <label className="label" htmlFor="farm_name">Farm name</label>
          <input
            id="farm_name"
            name="farm_name"
            type="text"
            required
            minLength={2}
            maxLength={100}
            className="input"
            placeholder="Vicknair Farms"
          />
        </div>

        <fieldset>
          <legend className="label">Where do you grow?</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="state" value="LA" required className="mt-0.5" />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Louisiana</span>
                <span className="block text-gray-600 text-xs">Parishes · Ho/HoCP/L varieties · post-harvest stubble shave</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="state" value="FL" required className="mt-0.5" />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Florida</span>
                <span className="block text-gray-600 text-xs">Glades counties · CP varieties · pre-harvest burn</span>
              </span>
            </label>
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" placeholder="you@farm.com" />
        </div>

        <div>
          <label className="label" htmlFor="password">Password</label>
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

        <fieldset>
          <legend className="label">Preferred unit</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="units" value="acres" defaultChecked className="mt-0.5" />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Acres</span>
                <span className="block text-gray-600 text-xs">Standard. USDA forms.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="units" value="arpents" className="mt-0.5" />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Arpents</span>
                <span className="block text-gray-600 text-xs">Louisiana. ~0.85 ac per arpent.</span>
              </span>
            </label>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">You can change either of these later in Settings.</p>
        </fieldset>

        <button type="submit" className="btn-primary w-full">
          Create account
        </button>
        <p className="text-xs text-gray-500 text-center">
          We&apos;ll send one email to confirm your address, then you&apos;re in.
        </p>
      </form>

      <p className="mt-6 text-sm text-gray-600 text-center">
        Already have an account? <Link href="/login" className="text-primary font-semibold hover:underline">Log in</Link>
      </p>
    </div>
  )
}
