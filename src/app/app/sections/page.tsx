import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listSections } from '@/lib/sections'
import {
  archiveSectionAction,
  createSectionAction,
  updateSectionAction,
} from './actions'
import RotateSectionButton from './RotateSectionButton'

export const metadata: Metadata = { title: 'Sections' }

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const sections = await listSections(org.id)
  const { error, saved } = await searchParams

  return (
    <div className="container-wide py-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-primary mb-1">Sections</h1>
      <p className="text-sm text-gray-600 mb-6">
        Group your blocks by location (e.g. <em>Rosedale</em>, <em>Woodlawn</em>). Lines up with
        the FSA Farm / Tract concept — add the farm and tract numbers if you have them.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-100 px-3 py-2 text-sm text-green-700">
          Saved.
        </div>
      )}

      <form
        action={createSectionAction}
        className="bg-white border border-gray-100 rounded-xl p-5 mb-6 space-y-3"
      >
        <h2 className="text-base font-bold text-primary">New section</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="new-name">Name</label>
            <input
              id="new-name"
              name="name"
              type="text"
              required
              maxLength={100}
              placeholder="Rosedale"
              className="input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="new-farm">
                FSA farm # <span className="font-normal text-gray-400">(opt.)</span>
              </label>
              <input
                id="new-farm"
                name="fsa_farm_number"
                type="text"
                maxLength={50}
                placeholder="e.g. 37"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="new-tract">
                FSA tract # <span className="font-normal text-gray-400">(opt.)</span>
              </label>
              <input
                id="new-tract"
                name="fsa_tract_number"
                type="text"
                maxLength={50}
                placeholder="e.g. 563"
                className="input"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="new-notes">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="new-notes"
            name="notes"
            rows={2}
            maxLength={1000}
            className="input"
            placeholder="Anything worth remembering about this section"
          />
        </div>
        <button type="submit" className="btn-primary">Create section</button>
      </form>

      {sections.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-8">
          No sections yet. Create one above, then assign blocks to it from the map.
        </div>
      ) : (
        <ul className="space-y-3">
          {sections.map((section) => {
            const updateAction = updateSectionAction.bind(null, section.id)
            const archiveAction = archiveSectionAction.bind(null, section.id)
            return (
              <li
                key={section.id}
                className="bg-white border border-gray-100 rounded-xl p-5"
              >
                <form action={updateAction} className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex-1">
                      <label className="label" htmlFor={`name-${section.id}`}>Name</label>
                      <input
                        id={`name-${section.id}`}
                        name="name"
                        type="text"
                        required
                        maxLength={100}
                        defaultValue={section.name}
                        className="input"
                      />
                    </div>
                    <p className="text-xs text-gray-500 whitespace-nowrap pt-6">
                      {section.field_count} block{section.field_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor={`farm-${section.id}`}>
                        FSA farm #
                      </label>
                      <input
                        id={`farm-${section.id}`}
                        name="fsa_farm_number"
                        type="text"
                        maxLength={50}
                        defaultValue={section.fsa_farm_number ?? ''}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`tract-${section.id}`}>
                        FSA tract #
                      </label>
                      <input
                        id={`tract-${section.id}`}
                        name="fsa_tract_number"
                        type="text"
                        maxLength={50}
                        defaultValue={section.fsa_tract_number ?? ''}
                        className="input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor={`notes-${section.id}`}>Notes</label>
                    <textarea
                      id={`notes-${section.id}`}
                      name="notes"
                      rows={2}
                      maxLength={1000}
                      defaultValue={section.notes ?? ''}
                      className="input"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <button type="submit" className="btn-primary text-sm">Save</button>
                    <button
                      type="submit"
                      formAction={archiveAction}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Archive section
                    </button>
                  </div>
                </form>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <RotateSectionButton
                    sectionId={section.id}
                    sectionName={section.name}
                    fieldCount={section.field_count}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-8 text-xs text-gray-500 leading-relaxed">
        Archiving a section unassigns its blocks (they revert to <em>Unassigned</em>) but doesn&apos;t
        delete them. Blocks can be reassigned anytime from the map sidebar.
      </p>
    </div>
  )
}
