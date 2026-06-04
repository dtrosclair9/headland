import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import { getField } from '@/lib/fields'
import { listSections } from '@/lib/sections'
import { getFieldCycleHistory } from '@/lib/rotation'
import { listApplications, listHarvests } from '@/lib/records'
import { listScoutingPins } from '@/lib/scouting'
import { listBlockTasks } from '@/lib/block-tasks'
import { listVarietiesForState, findVariety, isRipenerSensitive } from '@/lib/varieties'
import { formatArea } from '@/lib/units'
import { fetchWeather } from '@/lib/weather'
import { isSentinelHubConfigured } from '@/lib/sentinel-hub'
import { updateField, deleteField } from './actions'
import { HarvestsCard } from '@/components/fields/HarvestsCard'
import { ApplicationsCard } from '@/components/fields/ApplicationsCard'
import { ScoutingCard } from '@/components/fields/ScoutingCard'
import { TodoCard } from '@/components/fields/TodoCard'
import { WeatherCard } from '@/components/fields/WeatherCard'
import { FieldImageryCard } from '@/components/fields/FieldImageryCard'

export const metadata: Metadata = { title: 'Block' }

const RATOON_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'plant_cane', label: 'Plant cane' },
  { value: 'first_stubble', label: '1st stubble' },
  { value: 'second_stubble', label: '2nd stubble' },
  { value: 'third_stubble', label: '3rd stubble' },
  { value: 'fourth_stubble', label: '4th stubble' },
  { value: 'fifth_stubble_plus', label: '5th stubble' },
  { value: 'sixth_stubble_plus', label: '6th+ stubble' },
  { value: 'fallow', label: 'Fallow' },
]

const RATOON_LABEL: Record<string, string> = Object.fromEntries(
  RATOON_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
)

export default async function FieldDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { id } = await params
  const { org } = await requireUserAndOrg()
  const field = await getField(id)
  if (!field || field.org_id !== org.id) notFound()

  const [{ error, saved }, harvests, applications, scoutingPins, tasks, weather, sections, cycleHistory] = await Promise.all([
    searchParams,
    listHarvests(id),
    listApplications(id),
    listScoutingPins(id),
    listBlockTasks(id),
    fetchWeather(field.centroid_lat, field.centroid_lng),
    listSections(org.id),
    getFieldCycleHistory(id),
  ])

  const varieties = listVarietiesForState(org.state)
  const currentVariety = findVariety(field.variety)
  const ripenerSensitive = isRipenerSensitive(field.variety)
  const area = formatArea(Number(field.acreage_cached || 0), org.units_default)

  const isOwner = org.role === 'owner'
  const updateAction = updateField.bind(null, field.id)
  const deleteAction = deleteField.bind(null, field.id)

  const savedLabel =
    saved === 'harvest' ? 'Harvest added.' :
    saved === 'op' ? 'Operation logged.' :
    saved === 'scout' ? 'Scouting note added.' :
    saved === 'todo' ? 'To-do added.' :
    saved === '1' ? 'Saved.' : null

  return (
    <div className="container-wide py-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/app/map" className="text-sm text-gray-500 hover:text-primary">
            ← Back to map
          </Link>
          <h1 className="text-2xl font-bold text-primary mt-1">{field.name}</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {area.primary} <span className="text-gray-400">· {area.alt}</span>
          </p>
        </div>
        <a
          href={`/fields/${field.id}/print`}
          target="_blank"
          rel="noreferrer"
          className="btn-primary text-sm"
        >
          Print
        </a>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {savedLabel && (
        <div className="rounded-md bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-700">
          {savedLabel}
        </div>
      )}

      {ripenerSensitive && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          ⚠ <strong>{currentVariety?.code}</strong> is glyphosate-ripener sensitive.
          Don&apos;t apply Roundup as a chemical ripener on this field.
        </div>
      )}

      <form action={updateAction} className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
        <div>
          <label className="label" htmlFor="name">Block name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={1}
            maxLength={100}
            defaultValue={field.name}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="variety">
            Variety
            {org.state && (
              <span className="font-normal text-gray-500"> ({org.state} releases)</span>
            )}
          </label>
          <input
            id="variety"
            name="variety"
            type="text"
            list="variety-options"
            defaultValue={field.variety ?? ''}
            placeholder="Pick from the list or type your own"
            className="input"
          />
          <datalist id="variety-options">
            {varieties.map((v) => (
              <option key={v.code} value={v.code}>
                {[v.series, v.status, v.soil, v.ripener_sensitive ? 'ripener-sensitive' : null]
                  .filter(Boolean)
                  .join(' · ')}
              </option>
            ))}
          </datalist>
          {currentVariety?.notes && (
            <p className="mt-1 text-xs text-gray-500">{currentVariety.notes}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="plant_date">Plant date</label>
            <input
              id="plant_date"
              name="plant_date"
              type="date"
              defaultValue={field.plant_date ?? ''}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="current_ratoon">Current cut</label>
            <select
              id="current_ratoon"
              name="current_ratoon"
              defaultValue={field.current_ratoon ?? ''}
              className="input"
            >
              {RATOON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="section_id">
            Section
            {sections.length === 0 && (
              <span className="font-normal text-gray-400">
                {' '}— <Link href="/app/sections" className="text-primary hover:underline">create one</Link> to group blocks by location
              </span>
            )}
          </label>
          <select
            id="section_id"
            name="section_id"
            defaultValue={field.section_id ?? ''}
            className="input"
          >
            <option value="">— Unassigned</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            maxLength={2000}
            defaultValue={field.notes ?? ''}
            placeholder="Drainage issues, soil quirks, neighbor's gate code, anything you want on the printout..."
            className="input"
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button type="submit" className="btn-primary">Save</button>
          {isOwner && (
            <button
              type="submit"
              formAction={deleteAction}
              className="text-sm text-red-600 hover:underline"
            >
              Delete block
            </button>
          )}
        </div>
      </form>

      {cycleHistory.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h2 className="text-base font-bold text-primary mb-3">Cycle history</h2>
          <ul className="space-y-2">
            {cycleHistory.map((h) => (
              <li key={h.id} className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-gray-700 w-12 shrink-0">{h.crop_year}</span>
                <span className="text-gray-600">
                  {h.previous_stage ? RATOON_LABEL[h.previous_stage] ?? h.previous_stage : '—'}
                  <span className="text-gray-400"> → </span>
                  <span className="font-medium text-primary">
                    {RATOON_LABEL[h.new_stage] ?? h.new_stage}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            Recorded automatically each time this block is rotated to the next cycle.
          </p>
        </div>
      )}

      <TodoCard fieldId={field.id} tasks={tasks} />
      <WeatherCard weather={weather} />
      <FieldImageryCard fieldId={field.id} configured={isSentinelHubConfigured()} />
      <HarvestsCard fieldId={field.id} harvests={harvests} />
      <ApplicationsCard
        fieldId={field.id}
        applications={applications}
        varietyIsRipenerSensitive={ripenerSensitive}
      />
      <ScoutingCard
        fieldId={field.id}
        centroidLng={field.centroid_lng}
        centroidLat={field.centroid_lat}
        pins={scoutingPins}
      />
    </div>
  )
}
