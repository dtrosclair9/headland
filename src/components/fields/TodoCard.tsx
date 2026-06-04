import type { BlockTask } from '@/lib/types'
import { createBlockTask, toggleBlockTask, removeBlockTask } from '@/app/app/fields/[id]/actions'

interface Props {
  fieldId: string
  tasks: BlockTask[]
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TodoCard({ fieldId, tasks }: Props) {
  const open = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)
  const createBound = createBlockTask.bind(null, fieldId)

  return (
    <section className="bg-white border border-gray-100 rounded-xl p-6">
      <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
        To-do
        {open.length > 0 && (
          <span className="text-xs font-bold bg-accent/20 text-primary-dark rounded-full px-2 py-0.5">
            {open.length}
          </span>
        )}
      </h2>

      {/* Quick add — sized for thumbs in the truck. */}
      <form action={createBound} className="flex gap-2 mb-4">
        <input
          name="text"
          type="text"
          required
          maxLength={500}
          autoComplete="off"
          placeholder="Add a to-do — e.g. spray Johnson grass in row 4"
          className="input flex-1"
        />
        <button type="submit" className="btn-primary shrink-0">Add</button>
      </form>

      {open.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing to do here right now.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((t) => (
            <li key={t.id} className="flex items-start gap-3">
              <form action={toggleBlockTask.bind(null, t.id, fieldId, true)} className="pt-0.5">
                <button
                  type="submit"
                  aria-label="Mark done"
                  className="w-5 h-5 rounded border-2 border-gray-300 bg-white hover:border-primary transition flex items-center justify-center"
                />
              </form>
              <p className="flex-1 min-w-0 text-sm text-gray-800 break-words">
                {t.text}
                <span className="block text-xs text-gray-400">added {shortDate(t.created_at)}</span>
              </p>
              <form action={removeBlockTask.bind(null, t.id, fieldId)} className="pt-0.5">
                <button
                  type="submit"
                  aria-label="Delete to-do"
                  className="text-gray-300 hover:text-red-600 text-sm leading-none"
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm font-semibold text-gray-500 cursor-pointer">
            Done ({done.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {done.map((t) => (
              <li key={t.id} className="flex items-start gap-3">
                <form action={toggleBlockTask.bind(null, t.id, fieldId, false)} className="pt-0.5">
                  <button
                    type="submit"
                    aria-label="Reopen to-do"
                    className="w-5 h-5 rounded border-2 border-primary bg-primary text-white flex items-center justify-center"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.42 0l-4-4a1 1 0 011.42-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </form>
                <p className="flex-1 min-w-0 text-sm text-gray-400 line-through break-words">{t.text}</p>
                <form action={removeBlockTask.bind(null, t.id, fieldId)} className="pt-0.5">
                  <button
                    type="submit"
                    aria-label="Delete to-do"
                    className="text-gray-300 hover:text-red-600 text-sm leading-none"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
