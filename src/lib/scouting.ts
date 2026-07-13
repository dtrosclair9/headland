import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sniffImage } from '@/lib/image-sniff'
import type { ScoutingCategory } from '@/lib/types'

const BUCKET = 'scouting-photos'

export interface ScoutingPinRow {
  id: string
  field_id: string
  category: ScoutingCategory
  note: string | null
  photo_url: string | null
  created_by: string
  created_at: string
  lng: number
  lat: number
}

export interface ScoutingPinForOrgRow extends ScoutingPinRow {
  org_id: string
}

export async function listScoutingPins(fieldId: string): Promise<ScoutingPinRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scouting_pins_view')
    .select('*')
    .eq('field_id', fieldId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ScoutingPinRow[]
}

export async function listScoutingPinsForOrg(
  orgId: string,
): Promise<ScoutingPinForOrgRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scouting_pins_for_org')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ScoutingPinForOrgRow[]
}

export interface UploadPhotoInput {
  orgId: string
  fieldId: string
  pinId: string
  file: File
}

export async function uploadScoutingPhoto({
  orgId,
  fieldId,
  pinId,
  file,
}: UploadPhotoInput): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer())
  // Verified type drives BOTH the extension and the stored content type; the
  // client's file.type and filename never touch either.
  const kind = sniffImage(buf)
  if (!kind) throw new Error('That file is not a photo we can accept (JPEG, PNG, WebP, or HEIC).')
  const path = `${orgId}/${fieldId}/${pinId}.${kind.ext}`

  // Service-role client: cleaner than fighting Storage RLS for write-through paths
  // (the RLS we wrote covers the user-token path; the server action runs the upload
  // on the user's behalf after we've already verified org membership).
  const admin = createAdminClient()
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
    contentType: kind.mime,
    upsert: true,
  })
  if (upErr) throw upErr

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function deleteScoutingPhotoByUrl(photoUrl: string | null): Promise<void> {
  if (!photoUrl) return
  // publicUrl format: https://<ref>.supabase.co/storage/v1/object/public/scouting-photos/<path>
  const marker = `/${BUCKET}/`
  const idx = photoUrl.indexOf(marker)
  if (idx === -1) return
  const path = photoUrl.slice(idx + marker.length)
  const admin = createAdminClient()
  await admin.storage.from(BUCKET).remove([path])
}

export interface CreateScoutingPinInput {
  fieldId: string
  lng: number
  lat: number
  category: ScoutingCategory
  note: string | null
  photoUrl: string | null
}

export async function createScoutingPin(
  input: CreateScoutingPinInput,
): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_scouting_pin', {
    p_field_id: input.fieldId,
    p_lng: input.lng,
    p_lat: input.lat,
    p_category: input.category,
    p_note: input.note,
    p_photo_url: input.photoUrl,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { id: row.id as string }
}

export async function deleteScoutingPin(pinId: string): Promise<void> {
  const supabase = await createClient()
  const { data: pin } = await supabase
    .from('scouting_pins')
    .select('photo_url')
    .eq('id', pinId)
    .maybeSingle()

  const { error } = await supabase.from('scouting_pins').delete().eq('id', pinId)
  if (error) throw error

  if (pin?.photo_url) {
    await deleteScoutingPhotoByUrl(pin.photo_url)
  }
}

// New pin id generator (used to scope storage path before insert).
export function newPinId(): string {
  return randomUUID()
}

export const SCOUTING_CATEGORY_GROUPS: {
  group: string
  options: { value: ScoutingCategory; label: string }[]
}[] = [
  {
    group: 'Pressure',
    options: [
      { value: 'weed_pressure', label: 'Weed pressure' },
      { value: 'insect_pressure', label: 'Insect pressure' },
      { value: 'disease', label: 'Disease' },
    ],
  },
  {
    group: 'Damage',
    options: [
      { value: 'lodging', label: 'Lodging' },
      { value: 'washout', label: 'Washout' },
      { value: 'gap', label: 'Gap / stand loss' },
    ],
  },
  {
    group: 'Other',
    options: [
      { value: 'note', label: 'Note' },
      { value: 'other', label: 'Other' },
    ],
  },
]

export const SCOUTING_CATEGORY_LABEL: Record<ScoutingCategory, string> =
  SCOUTING_CATEGORY_GROUPS.flatMap((g) => g.options).reduce<
    Record<ScoutingCategory, string>
  >((acc, o) => {
    acc[o.value] = o.label
    return acc
  }, {} as Record<ScoutingCategory, string>)
