'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUserAndOrg } from '@/lib/orgs'

const SettingsSchema = z.object({
  name: z.string().min(2).max(100),
  state: z.enum(['LA', 'FL']),
  units_default: z.enum(['acres', 'arpents']),
})

export async function updateOrgSettings(formData: FormData) {
  const { org } = await requireUserAndOrg()
  if (org.role !== 'owner') {
    redirect('/app/settings?error=' + encodeURIComponent('Only the owner can change farm settings.'))
  }

  const parsed = SettingsSchema.safeParse({
    name: formData.get('name'),
    state: formData.get('state'),
    units_default: formData.get('units_default'),
  })
  if (!parsed.success) {
    redirect('/app/settings?error=' + encodeURIComponent('Please enter a valid farm name and state.'))
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update(parsed.data)
    .eq('id', org.id)

  if (error) {
    redirect('/app/settings?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/app', 'layout')
  redirect('/app/settings?saved=1')
}
