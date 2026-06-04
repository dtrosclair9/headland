import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { hasActiveSubscription, isInTrial, trialDaysLeft } from '@/lib/billing'
import { updateOrgSettings, updatePassword } from './actions'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const { error, saved } = await searchParams
  const isOwner = org.role === 'owner'

  return (
    <div className="container-wide py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-primary mb-6">Settings</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {saved && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-700">
          {saved === 'password' ? 'Password updated.' : 'Settings saved.'}
        </div>
      )}

      <form action={updateOrgSettings} className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
        <div>
          <label className="label" htmlFor="name">Farm name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={100}
            defaultValue={org.name}
            className="input"
            disabled={!isOwner}
          />
        </div>

        <fieldset>
          <legend className="label">State</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="state"
                value="LA"
                defaultChecked={org.state === 'LA'}
                disabled={!isOwner}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Louisiana</span>
                <span className="block text-gray-600 text-xs">Ho/HoCP/L varieties · post-harvest stubble shave</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="state"
                value="FL"
                defaultChecked={org.state === 'FL'}
                disabled={!isOwner}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Florida</span>
                <span className="block text-gray-600 text-xs">CP varieties · pre-harvest burn</span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Preferred unit</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="units_default"
                value="acres"
                defaultChecked={org.units_default === 'acres'}
                disabled={!isOwner}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Acres</span>
                <span className="block text-gray-600 text-xs">Standard. USDA forms.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-gray-200 p-3 hover:border-primary cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="units_default"
                value="arpents"
                defaultChecked={org.units_default === 'arpents'}
                disabled={!isOwner}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="block font-semibold text-primary">Arpents</span>
                <span className="block text-gray-600 text-xs">Louisiana. ~0.85 ac per arpent.</span>
              </span>
            </label>
          </div>
        </fieldset>

        {!isOwner && (
          <p className="text-xs text-gray-500">Only the farm owner can change these settings.</p>
        )}

        <button type="submit" className="btn-primary" disabled={!isOwner}>
          Save changes
        </button>
      </form>

      <form action={updatePassword} className="mt-6 bg-white border border-gray-100 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-primary">Password</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Set or change your password so you can log in without waiting on an email.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              placeholder="Re-type it"
            />
          </div>
        </div>
        <button type="submit" className="btn-primary">Save password</button>
      </form>

      <div className="mt-8 text-xs text-gray-500">
        Plan:{' '}
        <span className="font-medium text-gray-700">
          {hasActiveSubscription(org)
            ? `Headland (${org.subscription_status})`
            : isInTrial(org)
            ? `Free trial — ${trialDaysLeft(org)} day${trialDaysLeft(org) === 1 ? '' : 's'} left`
            : 'Trial ended'}
        </span>
        {' · '}
        Created: <span className="font-medium text-gray-700">{new Date(org.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  )
}
