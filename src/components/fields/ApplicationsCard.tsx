import type { Application } from '@/lib/types'
import {
  createApplication,
  removeApplication,
} from '@/app/app/fields/[id]/actions'
import { OPERATION_TYPE_GROUPS, OPERATION_TYPE_LABEL } from '@/lib/records'

interface Props {
  fieldId: string
  applications: Application[]
  varietyIsRipenerSensitive: boolean
}

export function ApplicationsCard({
  fieldId,
  applications,
  varietyIsRipenerSensitive,
}: Props) {
  const createBound = createApplication.bind(null, fieldId)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6">
      <h2 className="text-lg font-bold text-primary mb-4">Operations</h2>

      {applications.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No operations logged yet.</p>
      ) : (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-left border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wider">
              <th className="py-2 font-semibold">Date</th>
              <th className="py-2 font-semibold">Type</th>
              <th className="py-2 font-semibold">Product</th>
              <th className="py-2 font-semibold">Rate</th>
              <th className="py-2 font-semibold">Notes</th>
              <th className="py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id} className="border-b border-gray-50">
                <td className="py-2">{a.applied_at}</td>
                <td className="py-2 font-semibold text-primary">
                  {OPERATION_TYPE_LABEL[a.type] ?? a.type}
                </td>
                <td className="py-2">{a.product ?? '—'}</td>
                <td className="py-2">
                  {a.rate != null ? `${a.rate}${a.unit ? ' ' + a.unit : ''}` : '—'}
                </td>
                <td className="py-2 text-gray-600 truncate max-w-xs">{a.notes ?? ''}</td>
                <td className="py-2 text-right">
                  <form action={removeApplication.bind(null, a.id, fieldId)}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:underline"
                      aria-label="Delete operation"
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
          + Log operation
        </summary>
        <form action={createBound} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="applied_at">Date</label>
            <input
              id="applied_at"
              name="applied_at"
              type="date"
              required
              defaultValue={today}
              className="input"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="type">Type</label>
            <select id="type" name="type" required className="input">
              {OPERATION_TYPE_GROUPS.map((g) => (
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
          <div className="sm:col-span-2">
            <label className="label" htmlFor="product">Product (optional)</label>
            <input
              id="product"
              name="product"
              type="text"
              maxLength={100}
              className="input"
              placeholder="e.g. Atrazine 4L, Roundup PowerMax"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="rate">Rate</label>
              <input
                id="rate"
                name="rate"
                type="number"
                step="0.01"
                min={0}
                className="input"
                placeholder="2.0"
              />
            </div>
            <div>
              <label className="label" htmlFor="unit">Unit</label>
              <input
                id="unit"
                name="unit"
                type="text"
                maxLength={20}
                className="input"
                placeholder="qt/ac"
              />
            </div>
          </div>
          <div className="sm:col-span-3">
            <label className="label" htmlFor="op_notes">Notes</label>
            <input
              id="op_notes"
              name="notes"
              type="text"
              maxLength={500}
              className="input"
              placeholder="Wind, applicator, target weed/insect, etc."
            />
          </div>
          {varietyIsRipenerSensitive && (
            <div className="sm:col-span-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              ⚠ This variety is glyphosate-ripener sensitive. Don&apos;t use Roundup as a chemical ripener — pick a different ripener product or skip ripening on this field.
            </div>
          )}
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" className="btn-primary">Add operation</button>
          </div>
        </form>
      </details>
    </section>
  )
}
