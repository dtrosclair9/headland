import Image from 'next/image'
import {
  createScoutingPin,
  removeScoutingPin,
} from '@/app/app/fields/[id]/actions'
import {
  SCOUTING_CATEGORY_GROUPS,
  SCOUTING_CATEGORY_LABEL,
  type ScoutingPinRow,
} from '@/lib/scouting'

interface Props {
  fieldId: string
  centroidLng: number
  centroidLat: number
  pins: ScoutingPinRow[]
}

export function ScoutingCard({ fieldId, centroidLng, centroidLat, pins }: Props) {
  const createBound = createScoutingPin.bind(null, fieldId)

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6">
      <h2 className="text-lg font-bold text-primary mb-4">Scouting</h2>

      {pins.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No scouting notes yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {pins.map((p) => (
            <li
              key={p.id}
              className="border border-gray-100 rounded-lg overflow-hidden flex flex-col"
            >
              {p.photo_url && (
                <div className="relative aspect-video bg-gray-100">
                  <Image
                    src={p.photo_url}
                    alt={SCOUTING_CATEGORY_LABEL[p.category]}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-3 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-primary">
                    {SCOUTING_CATEGORY_LABEL[p.category]}
                  </span>
                  <form action={removeScoutingPin.bind(null, p.id, fieldId)}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:underline"
                      aria-label="Delete pin"
                    >
                      Delete
                    </button>
                  </form>
                </div>
                {p.note && (
                  <p className="text-sm text-gray-700 mb-2 leading-snug">{p.note}</p>
                )}
                <p className="mt-auto text-xs text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}{' '}
                  · {p.lat.toFixed(5)}°, {p.lng.toFixed(5)}°
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-2">
        <summary className="text-sm font-semibold text-primary cursor-pointer">
          + Add scouting note
        </summary>
        <form
          action={createBound}
          encType="multipart/form-data"
          className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" name="category" required className="input">
              {SCOUTING_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="photo">
              Photo (camera or file)
            </label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              capture="environment"
              className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-light file:cursor-pointer"
            />
          </div>

          {/* Pins aren't shown on a map anywhere yet, so asking a farmer to
              type GPS numbers was pure friction — notes pin to the block. */}
          <input type="hidden" name="lat" value={centroidLat.toFixed(6)} />
          <input type="hidden" name="lng" value={centroidLng.toFixed(6)} />

          <div className="sm:col-span-2">
            <label className="label" htmlFor="scout_note">Note</label>
            <textarea
              id="scout_note"
              name="note"
              rows={3}
              maxLength={1000}
              className="input"
              placeholder="Spot description, weed species, treatment plan..."
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between">
            <p className="text-xs text-gray-500">Saved to this block.</p>
            <button type="submit" className="btn-primary">Add note</button>
          </div>
        </form>
      </details>
    </section>
  )
}
