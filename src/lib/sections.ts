import { createClient } from '@/lib/supabase/server'
import type { Section } from '@/lib/types'

// One section, plus a denormalized count of how many active (un-archived)
// fields are currently assigned to it. The count is useful for the
// management UI and avoids an N+1 round-trip per section.
export interface SectionWithCount extends Section {
  field_count: number
}

export async function listSections(orgId: string): Promise<SectionWithCount[]> {
  const supabase = await createClient()
  // Two queries instead of a nested PostgREST select — nested filters on
  // joined rows can be flaky and silently drop the archived-at filter.
  const [sectionsRes, fieldRes] = await Promise.all([
    supabase
      .from('sections')
      .select('*')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('fields')
      .select('section_id')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .not('section_id', 'is', null),
  ])
  if (sectionsRes.error) throw sectionsRes.error
  if (fieldRes.error) throw fieldRes.error

  const counts = new Map<string, number>()
  for (const row of (fieldRes.data ?? []) as { section_id: string | null }[]) {
    if (!row.section_id) continue
    counts.set(row.section_id, (counts.get(row.section_id) ?? 0) + 1)
  }

  return ((sectionsRes.data ?? []) as Section[]).map((s) => ({
    ...s,
    field_count: counts.get(s.id) ?? 0,
  }))
}

export async function getSection(sectionId: string): Promise<Section | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sections')
    .select('*')
    .eq('id', sectionId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as Section | null
}

export async function createSection(input: {
  orgId: string
  name: string
  fsa_tract_number?: string | null
  notes?: string | null
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sections')
    .insert({
      org_id: input.orgId,
      name: input.name,
      fsa_tract_number: input.fsa_tract_number ?? null,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id as string }
}

export async function updateSection(
  sectionId: string,
  patch: {
    name?: string
    fsa_tract_number?: string | null
    notes?: string | null
  },
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('sections').update(patch).eq('id', sectionId)
  if (error) throw error
}

export async function archiveSection(sectionId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('sections')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', sectionId)
  if (error) throw error
}
