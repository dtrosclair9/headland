'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import {
  archivePlantation,
  createPlantation,
  getPlantation,
  updatePlantation,
} from '@/lib/plantations'

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
  fsa_farm_number: OptionalTractSchema,
  notes: OptionalTextSchema,
})

const UpdateSchema = CreateSchema

async function requireOwnedPlantation(plantationId: string) {
  const { org } = await requireUserAndOrg()
  const plantation = await getPlantation(plantationId)
  if (!plantation || plantation.org_id !== org.id) {
    redirect('/app/plantations?error=' + encodeURIComponent('Plantation not found.'))
  }
  return { org, plantation }
}

export async function createPlantationAction(formData: FormData) {
  const { org } = await requireUserAndOrg()
  const parsed = CreateSchema.safeParse({
    name: formData.get('name'),
    fsa_tract_number: formData.get('fsa_tract_number'),
    fsa_farm_number: formData.get('fsa_farm_number'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) {
    redirect('/app/plantations?error=' + encodeURIComponent('Please enter a plantation name.'))
  }
  try {
    await createPlantation({
      orgId: org.id,
      name: parsed.data.name,
      fsa_tract_number: parsed.data.fsa_tract_number,
      fsa_farm_number: parsed.data.fsa_farm_number,
      notes: parsed.data.notes,
    })
  } catch (e) {
    // Most common: unique (org_id, name) violation.
    const msg = e instanceof Error ? e.message : String(e)
    const friendly = msg.includes('unique')
      ? 'A plantation with that name already exists.'
      : msg
    redirect('/app/plantations?error=' + encodeURIComponent(friendly))
  }
  revalidatePath('/app/plantations')
  revalidatePath('/app/map')
  redirect('/app/plantations?saved=1')
}

export async function updatePlantationAction(plantationId: string, formData: FormData) {
  await requireOwnedPlantation(plantationId)
  const parsed = UpdateSchema.safeParse({
    name: formData.get('name'),
    fsa_tract_number: formData.get('fsa_tract_number'),
    fsa_farm_number: formData.get('fsa_farm_number'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) {
    redirect('/app/plantations?error=' + encodeURIComponent('Please enter a plantation name.'))
  }
  try {
    await updatePlantation(plantationId, parsed.data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect('/app/plantations?error=' + encodeURIComponent(msg))
  }
  revalidatePath('/app/plantations')
  revalidatePath('/app/map')
  redirect('/app/plantations?saved=1')
}

export async function archivePlantationAction(plantationId: string) {
  await requireOwnedPlantation(plantationId)
  try {
    await archivePlantation(plantationId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    redirect('/app/plantations?error=' + encodeURIComponent(msg))
  }
  revalidatePath('/app/plantations')
  revalidatePath('/app/map')
  redirect('/app/plantations?saved=1')
}
