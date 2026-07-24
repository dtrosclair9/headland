import type { Metadata } from 'next'
import { requireUserAndOrg } from '@/lib/orgs'
import { listFields } from '@/lib/fields'
import { getOrgColors } from '@/lib/org-colors'
import { listAnnotations } from '@/lib/annotations'
import { listPlanGroups } from '@/lib/fly-plans'
import MapShell from '@/components/map/MapShell'
import { parseLabelFields, type LabelField } from '@/lib/label-fields'

export const metadata: Metadata = { title: 'Block map' }

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>
}) {
  const { org } = await requireUserAndOrg()
  const { focus } = await searchParams
  const [fields, colorOverrides, annotations, planGroups] = await Promise.all([
    listFields(org.id),
    getOrgColors(org.id),
    listAnnotations(org.id),
    listPlanGroups(org.id),
  ])

  return (
    <MapShell
      initialFields={fields}
      units={org.units_default}
      state={org.state}
      colorOverrides={colorOverrides}
      initialAnnotations={annotations}
      initialPlanGroups={planGroups}
      focusFieldId={focus ?? null}
      viewDefaults={{
        labelFields: parseLabelFields(org.label_fields as LabelField[] | undefined),
        colorBy: (org.default_color_by as 'stage' | 'variety') ?? 'stage',
        updatedAt: String(org.view_defaults_updated_at ?? ''),
      }}
    />
  )
}
