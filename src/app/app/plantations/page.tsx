import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listPlantations } from '@/lib/plantations'
import {
  archivePlantationAction,
  createPlantationAction,
  updatePlantationAction,
} from './actions'
import RotatePlantationButton from './RotatePlantationButton'

export const metadata: Metadata = { title: 'Plantations' }

export default async function PlantationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const plantations = await listPlantations(org.id)
  const { error, saved } = await searchParams

  return (
    <div className="container-wide py-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-primary mb-1">Plantations</h1>
      <p className="text-sm text-gray-600 mb-6">
        Group your blocks by location (e.g. <em>Rosedale</em>, <em>Woodlawn</em>). A plantation
        usually matches an FSA <strong>farm</strong>; tract numbers live on each block (a
        plantation can span several tracts).
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
        action={createPlantationAction}
        className="bg-white border border-gray-100 rounded-xl p-5 mb-6 space-y-3"
      >
        <h2 className="text-base font-bold text-primary">New plantation</h2>
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
                FSA farm # <span className="font-normal text-gray-500">(opt.)</span>
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
                FSA tract # <span className="font-normal text-gray-500">(opt.)</span>
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
            Notes <span className="font-normal text-gray-500">(optional)</span>
          </label>
          <textarea
            id="new-notes"
            name="notes"
            rows={2}
            maxLength={1000}
            className="input"
            placeholder="Anything worth remembering about this plantation"
          />
        </div>
        <button type="submit" className="btn-primary">Create plantation</button>
      </form>

      {plantations.length === 0 ? (
        <div className="text-center text-sm text-gray-500 py-8">
          No plantations yet. Create one above, then assign blocks to it from the map.
        </div>
      ) : (
        <ul className="space-y-3">
          {plantations.map((plantation) => {
            const updateAction = updatePlantationAction.bind(null, plantation.id)
            const archiveAction = archivePlantationAction.bind(null, plantation.id)
            return (
              <li
                key={plantation.id}
                className="bg-white border border-gray-100 rounded-xl p-5"
              >
                <form action={updateAction} className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex-1">
                      <label className="label" htmlFor={`name-${plantation.id}`}>Name</label>
                      <input
                        id={`name-${plantation.id}`}
                        name="name"
                        type="text"
                        required
                        maxLength={100}
                        defaultValue={plantation.name}
                        className="input"
                      />
                    </div>
                    <p className="text-xs text-gray-500 whitespace-nowrap pt-6">
                      {plantation.field_count} block{plantation.field_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor={`farm-${plantation.id}`}>
                        FSA farm #
                      </label>
                      <input
                        id={`farm-${plantation.id}`}
                        name="fsa_farm_number"
                        type="text"
                        maxLength={50}
                        defaultValue={plantation.fsa_farm_number ?? ''}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`tract-${plantation.id}`}>
                        FSA tract #
                      </label>
                      <input
                        id={`tract-${plantation.id}`}
                        name="fsa_tract_number"
                        type="text"
                        maxLength={50}
                        defaultValue={plantation.fsa_tract_number ?? ''}
                        className="input"
                      />
                      {plantation.block_tracts.length > 0 ? (
                        <p className="mt-1 text-xs text-gray-500">
                          {plantation.block_tracts.length === 1
                            ? <>Blocks carry tract <strong>{plantation.block_tracts[0]}</strong>.</>
                            : <>Blocks span tracts <strong>{plantation.block_tracts.join(', ')}</strong> — leave this blank; each block keeps its own.</>}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-500">
                          Used for blocks that don&apos;t carry their own tract (e.g. hand-drawn).
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor={`notes-${plantation.id}`}>Notes</label>
                    <textarea
                      id={`notes-${plantation.id}`}
                      name="notes"
                      rows={2}
                      maxLength={1000}
                      defaultValue={plantation.notes ?? ''}
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
                      Archive plantation
                    </button>
                  </div>
                </form>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-start justify-between gap-3">
                  {plantation.field_count > 0 ? (
                    <a
                      href={`/plantations/${plantation.id}/print`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                    >
                      Print map →
                    </a>
                  ) : (
                    <span />
                  )}
                  <RotatePlantationButton
                    plantationId={plantation.id}
                    plantationName={plantation.name}
                    fieldCount={plantation.field_count}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-8 text-xs text-gray-500 leading-relaxed">
        Archiving a plantation unassigns its blocks (they revert to <em>Unassigned</em>) but doesn&apos;t
        delete them. Blocks can be reassigned anytime from the map sidebar.
      </p>
    </div>
  )
}
