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
}

export default function FieldSidebar({
  fields,
  units,
  selectedFieldId,
  onSelectField,
  totalAcres,
}: FieldSidebarProps) {
  const total = formatArea(totalAcres, units)

  return (
    <aside className="w-72 border-r border-gray-100 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          Fields
        </p>
        <p className="text-2xl font-bold text-primary mt-1">{fields.length}</p>
        <p className="text-xs text-gray-500">
          Total: <span className="font-semibold text-gray-700">{total.primary}</span>
          {fields.length > 0 && <span className="text-gray-400"> · {total.alt}</span>}
        </p>
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
