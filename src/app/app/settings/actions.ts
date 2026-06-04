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

const PasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  })

// Sets (or changes) the signed-in user's password. This is how magic-link-only
// accounts get a password the first time, and how anyone rotates it later.
export async function updatePassword(formData: FormData) {
  await requireUserAndOrg() // must be signed in
  const parsed = PasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    redirect('/app/settings?error=' + encodeURIComponent(parsed.error.issues[0]?.message ?? 'Invalid password.'))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    redirect('/app/settings?error=' + encodeURIComponent(error.message))
  }
  redirect('/app/settings?saved=password')
}
