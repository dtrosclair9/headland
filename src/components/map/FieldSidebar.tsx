'use client'

import type { FieldRow } from '@/lib/fields'
import type { Units } from '@/lib/types'
import { formatArea } from '@/lib/units'

interface FieldSidebarProps {
  fields: FieldRow[]
  units: Units
  selectedFieldId: string | null
  onSelectField: (id: string | null) => void
  totalAcres: number
  onClose?: () => void
}

export default function FieldSidebar({
  fields,
  units,
  selectedFieldId,
  onSelectField,
  totalAcres,
  onClose,
}: FieldSidebarProps) {
  const total = formatArea(totalAcres, units)

  return (
    <aside className="w-72 border-r border-gray-100 bg-white flex flex-col shadow-xl md:shadow-none">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Fields
          </p>
          <p className="text-2xl font-bold text-primary mt-1">{fields.length}</p>
          <p className="text-xs text-gray-500">
            Total: <span className="font-semibold text-gray-700">{total.primary}</span>
            {fields.length > 0 && <span className="text-gray-400"> · {total.alt}</span>}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fields panel"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-primary"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {fields.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            <p className="mb-2 font-semibold text-primary">No fields yet</p>
            <p>Click the <strong>Draw a field</strong> button on the map to plot your first one.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {fields.map((f) => {
              const area = formatArea(f.acreage_cached, units)
              const isSelected = f.id === selectedFieldId
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onSelectField(isSelected ? null : f.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                      isSelected ? 'bg-accent/10 border-l-4 border-accent' : ''
                    }`}
                  >
                    <p className="font-semibold text-primary text-sm truncate">{f.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {area.primary}
                      <span className="text-gray-400"> · {area.alt}</span>
                    </p>
                    {f.variety && (
                      <p className="text-xs text-gray-500">
                        {f.variety}
                        {f.current_ratoon && (
                          <span className="text-gray-400">
                            {' · '}
                            {f.current_ratoon.replace(/_/g, ' ')}
                          </span>
                        )}
                      </p>
                    )}
                    {f.notes && (
                      <p
                        className="text-[11px] text-gray-500 mt-1 leading-snug"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {f.notes}
                      </p>
                    )}
                  </button>

                  {isSelected && (
                    <div className="px-4 pb-3 flex gap-2">
                      <a
                        href={`/app/fields/${f.id}`}
                        className="flex-1 text-center text-xs font-semibold bg-white border border-primary text-primary px-3 py-2 rounded-md hover:bg-primary/5"
                      >
                        Edit
                      </a>
                      <a
                        href={`/fields/${f.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 text-center text-xs font-semibold bg-primary text-white px-3 py-2 rounded-md hover:bg-primary-light"
                      >
                        Print
                      </a>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
