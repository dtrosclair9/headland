'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import {
  archiveSection,
  createSection,
  getSection,
  updateSection,
} from '@/lib/sections'

const NameSchema = z.string().trim().min(1).max(100)
const OptionalTextSchema = z
  .string()
  .max(1000)
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
const OptionalTractSchema = z
  .string()
  .max(50)
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))

const CreateSchema = z.object({
  name: NameSchema,
  fsa_tract_number: OptionalTractSchema,
  notes: OptionalTextSchema,
})

const UpdateSchema = CreateSchema

async function requireOwnedSection(sectionId: string) {
  const { org } = await requireUserAndOrg()
  const section = await getSection(sectionId)
  if (!section || section.org_id !== org.id) {
    redirect('/app/sections?error=' + encodeURIComponent('Section not found.'))
  }
  return { org, section }
}

export async function createSectionAction(formData: FormData) {
  const { org } = await requireUserAndOrg()
  const parsed = CreateSchema.safeParse({
    name: formData.get('name'),
    fsa_tract_number: formData.get('fsa_tract_number'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) {
    redirect('/app/sections?error=' + encodeURIComponent('Please enter a section name.'))
  }
  try {
    await createSection({
      orgId: org.id,
      name: parsed.data.name,
      fsa_tract_number: parsed.data.fsa_tract_number,
      notes: parsed.data.notes,
    })
  } catch (e) {
    // Most common: unique (org_id, name) violation.
    const msg = e instanceof Error ? e.message : String(e)
    const friendly = msg.includes('unique')
      ? 'A section with that name already exists.'
      : msg
    redirect('/app/sections?error=' + encodeURIComponent(friendly))
  }
  revalidatePath('/app/sections')
  revalidatePath('/app/map')
  redirect('/app/sections?saved=1')
}

export async function updateSectionAction(sectionId: string, formData: FormData) {
  await requireOwnedSection(sectionId)
  const parsed = UpdateSchema.safeParse({
    name: formData.get('name'),
    fsa_tract_number: formData.get('fsa_tract_number'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) {
    redirect('/app/sections?error=' + encodeURIComponent('Please enter a section name.'))
  }
  try {
    await updateSection(sectionId, parsed.data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect('/app/sections?error=' + encodeURIComponent(msg))
  }
  revalidatePath('/app/sections')
  revalidatePath('/app/map')
  redirect('/app/sections?saved=1')
}

export async function archiveSectionAction(sectionId: string) {
  await requireOwnedSection(sectionId)
  try {
    await archiveSection(sectionId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect('/app/sections?error=' + encodeURIComponent(msg))
  }
  revalidatePath('/app/sections')
  revalidatePath('/app/map')
  redirect('/app/sections?saved=1')
}
