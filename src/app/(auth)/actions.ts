'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BASE_URL } from '@/lib/site'

const SignUpSchema = z.object({
  email: z.string().email(),
  farm_name: z.string().min(2).max(100),
  state: z.enum(['LA', 'FL']),
  units: z.enum(['acres', 'arpents']).default('acres'),
})

const SignInSchema = z.object({
  email: z.string().email(),
})

export async function signUp(formData: FormData) {
  const parsed = SignUpSchema.safeParse({
    email: formData.get('email'),
    farm_name: formData.get('farm_name'),
    state: formData.get('state'),
    units: formData.get('units') ?? 'acres',
  })
  if (!parsed.success) {
    redirect('/signup?error=' + encodeURIComponent('Please fill in farm name, state, and email.'))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      data: {
        farm_name: parsed.data.farm_name,
        state: parsed.data.state,
        units: parsed.data.units,
      },
      emailRedirectTo: `${BASE_URL}/auth/callback?next=/app/map`,
    },
  })
  if (error) redirect('/signup?error=' + encodeURIComponent(error.message))
  redirect('/check-email?email=' + encodeURIComponent(parsed.data.email))
}

export async function signIn(formData: FormData) {
  const parsed = SignInSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    redirect('/login?error=' + encodeURIComponent('Please enter a valid email.'))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${BASE_URL}/auth/callback?next=/app/map`,
    },
  })
  if (error) redirect('/login?error=' + encodeURIComponent(error.message))
  redirect('/check-email?email=' + encodeURIComponent(parsed.data.email))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
