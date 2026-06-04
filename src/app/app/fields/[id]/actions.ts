'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUserAndOrg } from '@/lib/orgs'
import {
  archiveField,
  getField,
  updateFieldMetadata,
} from '@/lib/fields'
import {
  addApplication,
  addHarvest,
  deleteApplication,
  deleteHarvest,
} from '@/lib/records'
import {
  createScoutingPin as createScoutingPinDb,
  deleteScoutingPin as deleteScoutingPinDb,
  newPinId,
  uploadScoutingPhoto,
} from '@/lib/scouting'
import {
  createBlockTask as createBlockTaskDb,
  setBlockTaskDone,
  deleteBlockTask as deleteBlockTaskDb,
} from '@/lib/block-tasks'

// ── field metadata ───────────────────────────────────────────────────

const RatoonEnum = z.enum([
  'plant_cane',
  'first_stubble',
  'second_stubble',
  'third_stubble',
  'fourth_stubble',
  'fifth_stubble_plus',
  'sixth_stubble_plus',
  'fallow',
])

const UpdateSchema = z.object({
  name: z.string().min(1).max(100),
  variety: z.string().max(50).optional().transform((v) => (v && v.length > 0 ? v : null)),
  plant_date: z.string().optional().transform((v) => (v && v.length > 0 ? v : null)),
  current_ratoon: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .pipe(RatoonEnum.nullable()),
  notes: z.string().max(2000).optional().transform((v) => (v && v.length > 0 ? v : null)),
  section_id: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .pipe(z.string().uuid().nullable()),
})

async function requireOwnedField(fieldId: string) {
  const { user, org } = await requireUserAndOrg()
  const field = await getField(fieldId)
  if (!field || field.org_id !== org.id) {
    redirect('/app/map?error=' + encodeURIComponent('Field not found.'))
  }
  return { user, org, field }
}

export async function updateField(fieldId: string, formData: FormData) {
  await requireOwnedField(fieldId)

  const parsed = UpdateSchema.safeParse({
    name: formData.get('name'),
    variety: formData.get('variety'),
    plant_date: formData.get('plant_date'),
    current_ratoon: formData.get('current_ratoon'),
    notes: formData.get('notes'),
    section_id: formData.get('section_id'),
  })
  if (!parsed.success) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Please check the values entered.'))
  }

  try {
    await updateFieldMetadata(fieldId, parsed.data)
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath('/app/map')
  revalidatePath(`/app/fields/${fieldId}`)
  redirect(`/app/fields/${fieldId}?saved=1`)
}

export async function deleteField(fieldId: string) {
  await requireOwnedField(fieldId)
  try {
    await archiveField(fieldId)
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath('/app/map')
  redirect('/app/map')
}

// ── harvests ────────────────────────────────────────────────────────

const HarvestSchema = z.object({
  harvest_year: z.coerce.number().int().min(1980).max(2100),
  tons_total: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .pipe(z.number().nonnegative().nullable()),
  tons_per_acre: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .pipe(z.number().nonnegative().nullable()),
  notes: z.string().max(500).optional().transform((v) => (v && v.length > 0 ? v : null)),
})

export async function createHarvest(fieldId: string, formData: FormData) {
  await requireOwnedField(fieldId)

  const parsed = HarvestSchema.safeParse({
    harvest_year: formData.get('harvest_year'),
    tons_total: formData.get('tons_total'),
    tons_per_acre: formData.get('tons_per_acre'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Invalid harvest entry.'))
  }

  try {
    await addHarvest({ field_id: fieldId, ...parsed.data })
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  redirect(`/app/fields/${fieldId}?saved=harvest`)
}

export async function removeHarvest(harvestId: string, fieldId: string) {
  await requireOwnedField(fieldId)
  try {
    await deleteHarvest(harvestId)
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  redirect(`/app/fields/${fieldId}`)
}

// ── applications / operations ───────────────────────────────────────

const ApplicationTypeEnum = z.enum([
  'herbicide',
  'insecticide',
  'fungicide',
  'fertilizer',
  'ripener',
  'pre_harvest_burn',
  'post_harvest_burn',
  'green_harvest',
  'stubble_shave',
  'sub_soiling',
  'cultivation',
  'layby',
  'other',
])

const WindDirectionEnum = z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'])

const ApplicationSchema = z.object({
  applied_at: z.string().min(1),
  type: ApplicationTypeEnum,
  product: z.string().max(100).optional().transform((v) => (v && v.length > 0 ? v : null)),
  rate: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .pipe(z.number().nonnegative().nullable()),
  unit: z.string().max(20).optional().transform((v) => (v && v.length > 0 ? v : null)),
  wind_direction: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null))
    .pipe(WindDirectionEnum.nullable()),
  wind_speed_mph: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .pipe(z.number().nonnegative().max(200).nullable()),
  notes: z.string().max(500).optional().transform((v) => (v && v.length > 0 ? v : null)),
})

export async function createApplication(fieldId: string, formData: FormData) {
  const { user } = await requireOwnedField(fieldId)

  const parsed = ApplicationSchema.safeParse({
    applied_at: formData.get('applied_at'),
    type: formData.get('type'),
    product: formData.get('product'),
    rate: formData.get('rate'),
    unit: formData.get('unit'),
    wind_direction: formData.get('wind_direction'),
    wind_speed_mph: formData.get('wind_speed_mph'),
    notes: formData.get('notes'),
  })
  if (!parsed.success) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Invalid operation entry.'))
  }

  try {
    await addApplication({ field_id: fieldId, applied_by: user.id, ...parsed.data })
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  redirect(`/app/fields/${fieldId}?saved=op`)
}

export async function removeApplication(applicationId: string, fieldId: string) {
  await requireOwnedField(fieldId)
  try {
    await deleteApplication(applicationId)
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  redirect(`/app/fields/${fieldId}`)
}

// ── scouting pins ───────────────────────────────────────────────────

const ScoutingCategoryEnum = z.enum([
  'weed_pressure',
  'insect_pressure',
  'disease',
  'lodging',
  'washout',
  'gap',
  'note',
  'other',
])

const ScoutingSchema = z.object({
  category: ScoutingCategoryEnum,
  note: z.string().max(1000).optional().transform((v) => (v && v.length > 0 ? v : null)),
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
})

const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

export async function createScoutingPin(fieldId: string, formData: FormData) {
  const { org, field } = await requireOwnedField(fieldId)

  const parsed = ScoutingSchema.safeParse({
    category: formData.get('category'),
    note: formData.get('note'),
    lng: formData.get('lng'),
    lat: formData.get('lat'),
  })
  if (!parsed.success) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Invalid scouting entry.'))
  }

  // Optional photo upload.
  let photoUrl: string | null = null
  const fileEntry = formData.get('photo')
  if (fileEntry instanceof File && fileEntry.size > 0) {
    if (!ALLOWED_PHOTO_MIME.has(fileEntry.type)) {
      redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Photo must be JPEG, PNG, WebP, or HEIC.'))
    }
    if (fileEntry.size > MAX_PHOTO_BYTES) {
      redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Photo is over 10 MB.'))
    }
    const pinId = newPinId()
    try {
      photoUrl = await uploadScoutingPhoto({
        orgId: org.id,
        fieldId: field.id,
        pinId,
        file: fileEntry,
      })
    } catch (e) {
      redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Photo upload failed: ' + (e instanceof Error ? e.message : String(e))))
    }
  }

  try {
    await createScoutingPinDb({
      fieldId,
      lng: parsed.data.lng,
      lat: parsed.data.lat,
      category: parsed.data.category,
      note: parsed.data.note,
      photoUrl,
    })
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }

  revalidatePath(`/app/fields/${fieldId}`)
  revalidatePath('/app/map')
  redirect(`/app/fields/${fieldId}?saved=scout`)
}

export async function removeScoutingPin(pinId: string, fieldId: string) {
  await requireOwnedField(fieldId)
  try {
    await deleteScoutingPinDb(pinId)
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  revalidatePath('/app/map')
  redirect(`/app/fields/${fieldId}`)
}

// ── to-do list ──────────────────────────────────────────────────────

const TaskTextSchema = z.string().trim().min(1).max(500)

export async function createBlockTask(fieldId: string, formData: FormData) {
  const { user } = await requireOwnedField(fieldId)

  const parsed = TaskTextSchema.safeParse(formData.get('text'))
  if (!parsed.success) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent('Type a to-do first.'))
  }

  try {
    await createBlockTaskDb({ fieldId, text: parsed.data, createdBy: user.id })
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  revalidatePath('/app/map')
  redirect(`/app/fields/${fieldId}?saved=todo`)
}

// done is bound at the call site (true to check off, false to reopen).
export async function toggleBlockTask(taskId: string, fieldId: string, done: boolean) {
  const { user } = await requireOwnedField(fieldId)
  try {
    await setBlockTaskDone({ taskId, done, userId: user.id })
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  revalidatePath('/app/map')
  redirect(`/app/fields/${fieldId}`)
}

export async function removeBlockTask(taskId: string, fieldId: string) {
  await requireOwnedField(fieldId)
  try {
    await deleteBlockTaskDb(taskId)
  } catch (e) {
    redirect(`/app/fields/${fieldId}?error=` + encodeURIComponent(e instanceof Error ? e.message : String(e)))
  }
  revalidatePath(`/app/fields/${fieldId}`)
  revalidatePath('/app/map')
  redirect(`/app/fields/${fieldId}`)
}
