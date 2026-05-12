import { createClient } from '@/lib/supabase/server'
import type { Application, ApplicationType, Harvest } from '@/lib/types'

export async function listHarvests(fieldId: string): Promise<Harvest[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('harvests')
    .select('*')
    .eq('field_id', fieldId)
    .order('harvest_year', { ascending: false })
  if (error) throw error
  return (data ?? []) as Harvest[]
}

export async function listApplications(fieldId: string): Promise<Application[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('field_id', fieldId)
    .order('applied_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Application[]
}

export async function listRecentApplications(
  fieldId: string,
  limit = 5,
): Promise<Application[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('field_id', fieldId)
    .order('applied_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Application[]
}

export interface AddHarvestInput {
  field_id: string
  harvest_year: number
  tons_total: number | null
  tons_per_acre: number | null
  notes: string | null
}

export async function addHarvest(input: AddHarvestInput): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('harvests').insert(input)
  if (error) throw error
}

export async function deleteHarvest(harvestId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('harvests').delete().eq('id', harvestId)
  if (error) throw error
}

export interface AddApplicationInput {
  field_id: string
  applied_at: string
  product: string | null
  type: ApplicationType
  rate: number | null
  unit: string | null
  notes: string | null
  applied_by: string
}

export async function addApplication(input: AddApplicationInput): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('applications').insert(input)
  if (error) throw error
}

export async function deleteApplication(applicationId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('applications').delete().eq('id', applicationId)
  if (error) throw error
}

// Display-friendly grouping for the operation type select.
export const OPERATION_TYPE_GROUPS: {
  group: string
  options: { value: ApplicationType; label: string }[]
}[] = [
  {
    group: 'Sprays',
    options: [
      { value: 'herbicide', label: 'Herbicide' },
      { value: 'insecticide', label: 'Insecticide' },
      { value: 'fungicide', label: 'Fungicide' },
    ],
  },
  {
    group: 'Fertilizer / ripener',
    options: [
      { value: 'fertilizer', label: 'Fertilizer' },
      { value: 'ripener', label: 'Ripener (e.g., glyphosate)' },
    ],
  },
  {
    group: 'Tillage',
    options: [
      { value: 'sub_soiling', label: 'Sub-soiling' },
      { value: 'cultivation', label: 'Cultivation / off-barring' },
      { value: 'layby', label: 'Layby (closing in)' },
      { value: 'stubble_shave', label: 'Stubble shave' },
    ],
  },
  {
    group: 'Harvest events',
    options: [
      { value: 'pre_harvest_burn', label: 'Pre-harvest burn' },
      { value: 'green_harvest', label: 'Green harvest (no burn)' },
      { value: 'post_harvest_burn', label: 'Post-harvest trash burn' },
    ],
  },
  {
    group: 'Other',
    options: [{ value: 'other', label: 'Other' }],
  },
]

export const OPERATION_TYPE_LABEL: Record<string, string> = OPERATION_TYPE_GROUPS.flatMap(
  (g) => g.options,
).reduce<Record<string, string>>((acc, o) => {
  acc[o.value] = o.label
  return acc
}, {})
