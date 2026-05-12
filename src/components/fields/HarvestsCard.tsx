import type { Harvest } from '@/lib/types'
import { createHarvest, removeHarvest } from '@/app/app/fields/[id]/actions'

interface Props {
  fieldId: string
  harvests: Harvest[]
}

export function HarvestsCard({ fieldId, harvests }: Props) {
  const createBound = createHarvest.bind(null, fieldId)
  const currentYear = new Date().getFullYear()

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6">
      <h2 className="text-lg font-bold text-primary mb-4">Harvests</h2>

      {harvests.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No harvests logged yet.</p>
      ) : (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-left border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
              <th className="py-2 font-semibold">Year</th>
              <th className="py-2 font-semibold">Tons</th>
              <th className="py-2 font-semibold">T/ac</th>
              <th className="py-2 font-semibold">Notes</th>
              <th className="py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {harvests.map((h) => (
              <tr key={h.id} className="border-b border-gray-50">
                <td className="py-2 font-semibold text-primary">{h.harvest_year}</td>
                <td className="py-2">{h.tons_total ?? '—'}</td>
                <td className="py-2">{h.tons_per_acre ?? '—'}</td>
                <td className="py-2 text-gray-600 truncate max-w-xs">{h.notes ?? ''}</td>
                <td className="py-2 text-right">
                  <form action={removeHarvest.bind(null, h.id, fieldId)}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:underline"
                      aria-label="Delete harvest"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details className="mt-2">
        <summary className="text-sm font-semibold text-primary cursor-pointer">
          + Add harvest
        </summary>
        <form action={createBound} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="label" htmlFor="harvest_year">Year</label>
            <input
              id="harvest_year"
              name="harvest_year"
              type="number"
              required
              min={1980}
              max={2100}
              defaultValue={currentYear}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="tons_total">Tons total</label>
            <input
              id="tons_total"
              name="tons_total"
              type="number"
              step="0.01"
              min={0}
              className="input"
              placeholder="e.g. 1850"
            />
          </div>
          <div>
            <label className="label" htmlFor="tons_per_acre">Tons / acre</label>
            <input
              id="tons_per_acre"
              name="tons_per_acre"
              type="number"
              step="0.01"
              min={0}
              className="input"
              placeholder="e.g. 38.5"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full">Add</button>
          </div>
          <div className="sm:col-span-4">
            <label className="label" htmlFor="harvest_notes">Notes</label>
            <input
              id="harvest_notes"
              name="notes"
              type="text"
              maxLength={500}
              className="input"
              placeholder="e.g. wet harvest, second cut, frosted area near east headland"
            />
          </div>
        </form>
      </details>
    </section>
  )
}
